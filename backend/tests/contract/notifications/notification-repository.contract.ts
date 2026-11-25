import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type {
  NotificationRepository,
  StoredNotification,
} from '../../../src/modules/notifications/application/ports/out/notification-repository';

export interface NotificationHarness {
  repo: NotificationRepository;
  /** Un usuario que existe (en BD real, una fila de auth.users: hay FK). Cada llamada, uno distinto. */
  newUserId: () => Promise<string>;
}

const T0 = Date.parse('2026-01-01T10:00:00.000Z');
const SECOND_MS = 1000;
const TWO = 2;
const THREE = 3;
const MISSING_ID = '00000000-0000-4000-8000-000000000000';

const at = (n: number) => new Date(T0 + n * SECOND_MS).toISOString();
const note = (
  userId: string,
  n: number,
  over: Partial<StoredNotification> = {},
): StoredNotification => ({
  id: randomUUID(),
  userId,
  kind: 'match_created',
  payload: { matchId: randomUUID() },
  readAt: null,
  createdAt: at(n),
  ...over,
});

/** Suite de `NotificationRepository`: cada usuario solo ve lo suyo y el orden es del más reciente al más antiguo. */
export function describeNotificationRepositoryContract(
  factory: () => NotificationHarness | Promise<NotificationHarness>,
): void {
  describe('NotificationRepository (contrato del puerto)', () => {
    it('add + findById conserva todos los campos', async () => {
      const { repo, newUserId } = await factory();
      const n = note(await newUserId(), 0, {
        kind: 'quote_status_changed',
        payload: { quoteId: 'q', to: 'sent' },
      });
      await repo.add(n);
      expect(await repo.findById(n.id)).toEqual(n);
    });

    it('add con un id ya existente se rechaza con DomainError CONFLICT (sin pisar el original)', async () => {
      const { repo, newUserId } = await factory();
      const user = await newUserId();
      const original = note(user, 0);
      await repo.add(original);
      await expect(repo.add({ ...original, kind: 'message_received' })).rejects.toMatchObject({
        code: 'CONFLICT',
      });
      expect(await repo.findById(original.id)).toEqual(original);
    });

    it('findById devuelve null si no existe', async () => {
      expect(await (await factory()).repo.findById(MISSING_ID)).toBeNull();
    });

    it('listByUser devuelve lo más reciente primero y el total', async () => {
      const { repo, newUserId } = await factory();
      const user = await newUserId();
      const [a, b, c] = [note(user, 1), note(user, THREE), note(user, TWO)];
      await Promise.all([a, b, c].map((n) => repo.add(n)));
      const page = await repo.listByUser(user, 0, THREE);
      expect(page.items.map((n) => n.id)).toEqual([b.id, c.id, a.id]);
      expect(page.total).toBe(THREE);
    });

    it('listByUser pagina con offset y limit sin repetir ni perder elementos', async () => {
      const { repo, newUserId } = await factory();
      const user = await newUserId();
      const all = [0, 1, TWO, THREE].map((i) => note(user, i));
      await Promise.all(all.map((n) => repo.add(n)));
      const first = await repo.listByUser(user, 0, TWO);
      const second = await repo.listByUser(user, TWO, TWO);
      const ids = [...first.items, ...second.items].map((n) => n.id);
      expect(ids).toEqual([...all].reverse().map((n) => n.id));
      expect(second.total).toBe(all.length);
      expect((await repo.listByUser(user, all.length, TWO)).items).toEqual([]);
    });

    it('listByUser nunca devuelve notificaciones de otro usuario (ACL)', async () => {
      const { repo, newUserId } = await factory();
      const [alice, bob] = [await newUserId(), await newUserId()];
      const mine = note(alice, 0);
      await repo.add(mine);
      await repo.add(note(bob, 1));
      const page = await repo.listByUser(alice, 0, THREE * THREE);
      expect(page.items.map((n) => n.id)).toEqual([mine.id]);
      expect(page.total).toBe(1);
    });

    it('un usuario sin notificaciones recibe { items: [], total: 0 }', async () => {
      const { repo, newUserId } = await factory();
      expect(await repo.listByUser(await newUserId(), 0, THREE)).toEqual({ items: [], total: 0 });
    });

    it('markRead fija readAt, devuelve la notificación actualizada y persiste', async () => {
      const { repo, newUserId } = await factory();
      const n = note(await newUserId(), 0);
      await repo.add(n);
      const readAt = at(THREE);
      const updated = await repo.markRead(n.id, readAt);
      expect(updated).toEqual({ ...n, readAt });
      expect((await repo.findById(n.id))?.readAt).toBe(readAt);
    });

    it('markRead sobre un id inexistente devuelve null y no crea nada', async () => {
      const { repo } = await factory();
      expect(await repo.markRead(MISSING_ID, at(0))).toBeNull();
      expect(await repo.findById(MISSING_ID)).toBeNull();
    });

    it('markRead no toca las demás notificaciones', async () => {
      const { repo, newUserId } = await factory();
      const user = await newUserId();
      const [a, b] = [note(user, 0), note(user, 1)];
      await repo.add(a);
      await repo.add(b);
      await repo.markRead(a.id, at(THREE));
      expect((await repo.findById(b.id))?.readAt).toBeNull();
    });
  });
}
