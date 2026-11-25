import { describe, expect, it } from 'vitest';
import type {
  RemovalRequestRecord,
  RemovalRequestStore,
} from '../../../src/modules/profiles/application/ports/out/removal-request-store';

const T0 = new Date('2026-01-01T10:00:00.000Z');
const TWO = 2;
const THREE = 3;
const BURST = 10;
const SECOND_MS = 1000;
const PAGE_SCAN = 200;
const REVIEW_AT = new Date('2026-01-02T10:00:00.000Z');
const MISSING_ID = '00000000-0000-4000-8000-000000000000';

export interface RemovalStoreHarness {
  store: RemovalRequestStore;
  /** Handle propio del test (único en una BD compartida); los pedidos de la suite usan `handle` y `handle + '.x'`. */
  handle: string;
  /** Lo persistido para ese prefijo de handle, solo para verificar (en el real, un SELECT con service_role). */
  recorded: () => RemovalRequestRecord[] | Promise<RemovalRequestRecord[]>;
  /** Un usuario que existe (el administrador que revisa; en BD real, FK a auth.users). */
  adminId: string;
}

/** Suite de `RemovalRequestStore`: el pedido ARCO se persiste tal cual y nunca se pierde. */
export function describeRemovalRequestStoreContract(
  factory: () => RemovalStoreHarness | Promise<RemovalStoreHarness>,
): void {
  describe('RemovalRequestStore (contrato del puerto)', () => {
    it('add persiste handle, correo, motivo y fecha', async () => {
      const { store, recorded, handle } = await factory();
      const req: RemovalRequestRecord = {
        handle,
        email: 'titular@correo.pe',
        reason: 'ya no quiero',
        createdAt: T0,
      };
      await store.add(req);
      expect(await recorded()).toMatchObject([req]);
    });

    it('conserva el estado del pedido (pending / applied)', async () => {
      const { store, recorded, handle } = await factory();
      await store.add({
        handle: `${handle}.a`,
        email: 'a@correo.pe',
        createdAt: T0,
        status: 'pending',
      });
      await store.add({
        handle: `${handle}.c`,
        email: 'b@correo.pe',
        createdAt: T0,
        status: 'applied',
      });
      expect((await recorded()).map((x) => x.status).sort()).toEqual(['applied', 'pending']);
    });

    it('el motivo es opcional', async () => {
      const { store, recorded, handle } = await factory();
      await store.add({ handle, email: 'titular@correo.pe', createdAt: T0 });
      const [saved] = await recorded();
      expect(saved?.reason ?? null).toBeNull();
    });

    it('varios pedidos del mismo handle se acumulan (no se pisan)', async () => {
      const { store, recorded, handle } = await factory();
      await store.add({ handle, email: 'a@correo.pe', createdAt: T0 });
      await store.add({ handle, email: 'b@correo.pe', createdAt: T0 });
      expect(await recorded()).toHaveLength(TWO);
    });

    it('acepta pedidos de handles que no existen en Sponcer', async () => {
      const { store, recorded, handle } = await factory();
      await expect(
        store.add({ handle: `${handle}.zz`, email: 'a@correo.pe', createdAt: T0 }),
      ).resolves.toBeUndefined();
      expect(await recorded()).toHaveLength(1);
    });

    describe('revisión por administradores (list / findById / review)', () => {
      const request = (handle: string, n: number): RemovalRequestRecord => ({
        handle,
        email: `titular${n}@correo.pe`,
        reason: `motivo ${n}`,
        createdAt: new Date(T0.getTime() + n * TWO * SECOND_MS),
      });
      /** Los pedidos de este test, más reciente primero. */
      const mine = async (store: RemovalRequestStore, handle: string) =>
        (await store.list({ offset: 0, limit: PAGE_SCAN })).items.filter((r) =>
          r.handle.startsWith(handle),
        );

      it('list devuelve los pedidos pendientes con sus campos de revisión vacíos, más reciente primero', async () => {
        const { store, handle } = await factory();
        await store.add(request(handle, 0));
        await store.add(request(`${handle}.b`, 1));
        const items = await mine(store, handle);
        expect(items.map((r) => r.handle)).toEqual([`${handle}.b`, handle]);
        expect(items[0]).toMatchObject({
          status: 'pending',
          reviewedAt: null,
          reviewNote: null,
          email: 'titular1@correo.pe',
          reason: 'motivo 1',
        });
      });

      it('findById devuelve el pedido, o null si no existe', async () => {
        const { store, handle } = await factory();
        await store.add(request(handle, 0));
        const [item] = await mine(store, handle);
        expect(await store.findById(item!.id)).toEqual(item);
        expect(await store.findById(MISSING_ID)).toBeNull();
      });

      it('review fija estado, fecha y nota; un segundo review ya no cambia nada (atómico)', async () => {
        const { store, handle, adminId } = await factory();
        await store.add(request(handle, 0));
        const [item] = await mine(store, handle);
        const first = await store.review(item!.id, {
          status: 'applied',
          at: REVIEW_AT,
          by: adminId,
          note: 'ok',
        });
        const second = await store.review(item!.id, {
          status: 'rejected',
          at: REVIEW_AT,
          by: adminId,
          note: 'otra',
        });
        expect([first, second]).toEqual([true, false]);
        expect(await store.findById(item!.id)).toMatchObject({
          status: 'applied',
          reviewedAt: REVIEW_AT,
          reviewNote: 'ok',
        });
      });

      it('una ráfaga de revisiones del mismo pedido tiene exactamente un ganador', async () => {
        const { store, handle, adminId } = await factory();
        await store.add(request(handle, 0));
        const [item] = await mine(store, handle);
        const results = await Promise.all(
          Array.from({ length: BURST }, (_, n) =>
            store.review(item!.id, {
              status: n % TWO ? 'applied' : 'rejected',
              at: REVIEW_AT,
              by: adminId,
            }),
          ),
        );
        expect(results.filter(Boolean)).toHaveLength(1);
      });

      it('review de un id inexistente devuelve false', async () => {
        const { store, adminId } = await factory();
        expect(
          await store.review(MISSING_ID, { status: 'applied', at: REVIEW_AT, by: adminId }),
        ).toBe(false);
      });

      it('list filtra por estado y pagina sin repetir', async () => {
        const { store, handle, adminId } = await factory();
        await Promise.all([0, 1, TWO, THREE].map((n) => store.add(request(`${handle}.${n}`, n))));
        const [newest] = await mine(store, handle);
        await store.review(newest!.id, { status: 'rejected', at: REVIEW_AT, by: adminId });
        const rejected = await store.list({ status: 'rejected', offset: 0, limit: PAGE_SCAN });
        expect(rejected.items.map((r) => r.id)).toContain(newest!.id);
        expect(rejected.items.every((r) => r.status === 'rejected')).toBe(true);
        const pending = await store.list({ status: 'pending', offset: 0, limit: PAGE_SCAN });
        expect(pending.items.map((r) => r.id)).not.toContain(newest!.id);
        const [p1, p2] = [
          await store.list({ offset: 0, limit: TWO }),
          await store.list({ offset: TWO, limit: TWO }),
        ];
        const ids = [...p1.items, ...p2.items].map((r) => r.id);
        expect(new Set(ids).size).toBe(ids.length);
      });
    });
  });
}
