import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { CLAIM_MAX_ATTEMPTS_PER_HOUR, CLAIM_TTL_MINUTES } from '@sponcer/contracts';
import type { ClaimStore } from '../../../src/modules/auth/application/ports/out/claim-store';
import type { ClaimRecord } from '../../../src/modules/auth/domain/claim';

const MINUTE_MS = 60_000;
const OUTSIDE_WINDOW_MS = 7_200_000;
const T0 = new Date('2026-01-01T10:00:00.000Z');
const HASH = 'ab'.repeat(CLAIM_TTL_MINUTES);
const BURST_SIZE = 20;
const HALF_HOUR_MS = 1_800_000;
const HOUR_AND_A_BIT_MS = 3_660_000;

export interface ClaimStoreHarness {
  store: ClaimStore;
  /** Dos usuarios que existan (en BD real, filas de auth.users: hay FK). */
  userA: string;
  userB: string;
}

export interface ClaimStoreOptions {
  /**
   * El adaptador respeta el `now` recibido (mock). El real usa el reloj de la BD (`now()` del RPC) e ignora
   * el parámetro: los casos que mueven el reloj no aplican. Hallazgo L-1 del reporte F2.
   */
  clockInjectable: boolean;
}

const claim = (id: string, userId: string): ClaimRecord => ({
  id,
  userId,
  handle: 'handle.de.prueba',
  role: 'creator',
  codeHash: HASH,
  expiresAt: new Date(T0.getTime() + CLAIM_TTL_MINUTES * MINUTE_MS),
  consumed: false,
});

/** Ejecuta `fn` n veces una tras otra (sin for/while) y junta los resultados. */
const runSequentially = <T>(n: number, fn: () => Promise<T>): Promise<T[]> =>
  Array.from({ length: n }).reduce<Promise<T[]>>(
    async (acc) => [...(await acc), await fn()],
    Promise.resolve([]),
  );

const nowFor = (opts: ClaimStoreOptions) => (opts.clockInjectable ? T0 : new Date());

/** Suite del puerto out `ClaimStore`. `factory` devuelve un almacén sin reclamos ni intentos de sus usuarios. */
export function describeClaimStoreContract(
  factory: () => ClaimStoreHarness | Promise<ClaimStoreHarness>,
  opts: ClaimStoreOptions = { clockInjectable: true },
): void {
  describe('ClaimStore (contrato del puerto)', () => {
    // Ids nuevos por test: un adaptador real conserva las filas entre tests.
    let ID_1 = randomUUID();
    let ID_2 = randomUUID();
    beforeEach(() => {
      ID_1 = randomUUID();
      ID_2 = randomUUID();
    });

    it('findById devuelve null si el reclamo no existe', async () => {
      expect(await (await factory()).store.findById(ID_1)).toBeNull();
    });

    it('save + findById conserva todos los campos, incluida la fecha de expiración', async () => {
      const { store, userA } = await factory();
      const saved = claim(ID_1, userA);
      await store.save(saved);
      const found = await store.findById(ID_1);
      expect(found).toEqual(saved);
      expect(found?.expiresAt).toBeInstanceOf(Date);
    });

    it('solo guarda el hash del código: no hay campo con el código en claro', async () => {
      const { store, userA } = await factory();
      await store.save(claim(ID_1, userA));
      const found = (await store.findById(ID_1)) as unknown as Record<string, unknown>;
      expect(Object.keys(found).sort()).toEqual(
        ['codeHash', 'consumed', 'expiresAt', 'handle', 'id', 'role', 'userId'].sort(),
      );
    });

    it('markConsumed solo marca ese reclamo', async () => {
      const { store, userA } = await factory();
      await store.save(claim(ID_1, userA));
      await store.save(claim(ID_2, userA));
      await store.markConsumed(ID_1);
      expect((await store.findById(ID_1))?.consumed).toBe(true);
      expect((await store.findById(ID_2))?.consumed).toBe(false);
    });

    it('markConsumed sobre un id inexistente no lanza ni crea el reclamo', async () => {
      const { store } = await factory();
      await expect(store.markConsumed(ID_1)).resolves.toBeUndefined();
      expect(await store.findById(ID_1)).toBeNull();
    });

    describe('tryRecordAttempt (atómico)', () => {
      it('permite hasta CLAIM_MAX_ATTEMPTS_PER_HOUR intentos y rechaza el siguiente', async () => {
        const { store, userA } = await factory();
        const results = await runSequentially(CLAIM_MAX_ATTEMPTS_PER_HOUR + 1, () =>
          store.tryRecordAttempt(userA, nowFor(opts)),
        );
        expect(results).toEqual([...Array(CLAIM_MAX_ATTEMPTS_PER_HOUR).fill(true), false]);
      });

      it.runIf(opts.clockInjectable)(
        'un intento rechazado no se registra: no alarga el bloqueo',
        async () => {
          const { store, userA } = await factory();
          await runSequentially(CLAIM_MAX_ATTEMPTS_PER_HOUR, () =>
            store.tryRecordAttempt(userA, T0),
          );
          const rejected = new Date(T0.getTime() + HALF_HOUR_MS);
          await runSequentially(BURST_SIZE, () => store.tryRecordAttempt(userA, rejected));
          const afterWindow = new Date(T0.getTime() + HOUR_AND_A_BIT_MS);
          expect(await store.tryRecordAttempt(userA, afterWindow)).toBe(true);
        },
      );

      it('una ráfaga concurrente nunca supera el límite', async () => {
        const { store, userA } = await factory();
        const burst = await Promise.all(
          Array.from({ length: BURST_SIZE }, () => store.tryRecordAttempt(userA, nowFor(opts))),
        );
        expect(burst.filter(Boolean)).toHaveLength(CLAIM_MAX_ATTEMPTS_PER_HOUR);
      });

      it('el límite es por usuario', async () => {
        const { store, userA, userB } = await factory();
        await runSequentially(CLAIM_MAX_ATTEMPTS_PER_HOUR, () =>
          store.tryRecordAttempt(userA, nowFor(opts)),
        );
        expect(await store.tryRecordAttempt(userA, nowFor(opts))).toBe(false);
        expect(await store.tryRecordAttempt(userB, nowFor(opts))).toBe(true);
      });

      it.runIf(opts.clockInjectable)(
        'los intentos fuera de la ventana de 1 h no cuentan',
        async () => {
          const { store, userA } = await factory();
          await runSequentially(CLAIM_MAX_ATTEMPTS_PER_HOUR, () =>
            store.tryRecordAttempt(userA, T0),
          );
          expect(
            await store.tryRecordAttempt(userA, new Date(T0.getTime() + OUTSIDE_WINDOW_MS)),
          ).toBe(true);
        },
      );
    });
  });
}
