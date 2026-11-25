import { describe, expect, it } from 'vitest';
import type {
  RemovalRequestRecord,
  RemovalRequestStore,
} from '../../../src/modules/profiles/application/ports/out/removal-request-store';

const T0 = new Date('2026-01-01T10:00:00.000Z');
const TWO = 2;

export interface RemovalStoreHarness {
  store: RemovalRequestStore;
  /** Handle propio del test (único en una BD compartida); los pedidos de la suite usan `handle` y `handle + '.x'`. */
  handle: string;
  /** Lo persistido para ese prefijo de handle, solo para verificar (en el real, un SELECT con service_role). */
  recorded: () => RemovalRequestRecord[] | Promise<RemovalRequestRecord[]>;
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
  });
}
