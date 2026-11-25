import type { Notification } from '@sponcer/contracts';
import { DomainError } from '../../../../shared/errors';
import { err, ok } from '../../../../shared/result';
import type { ListNotifications, MarkAsRead } from '../ports/in/notification-use-cases';
import type {
  NotificationRepository,
  StoredNotification,
} from '../ports/out/notification-repository';

const DECIMAL = 10;
// shortcut: cursor = offset numérico; con BD real pasar a cursor por (createdAt,id).
const parseOffset = (cursor: string | undefined): number => {
  const n = Number.parseInt(cursor ?? '', DECIMAL);
  return Number.isNaN(n) || n < 0 ? 0 : n;
};

const toPublic = ({ userId: _userId, ...n }: StoredNotification): Notification => n;

export const makeListNotifications =
  (d: { repo: NotificationRepository }): ListNotifications =>
  async (userId, q) => {
    const offset = parseOffset(q.cursor);
    const { items, total } = await d.repo.listByUser(userId, offset, q.limit);
    const next = offset + items.length;
    return ok({ items: items.map(toPublic), nextCursor: next < total ? String(next) : null });
  };

export const makeMarkAsRead =
  (d: { repo: NotificationRepository; now: () => Date }): MarkAsRead =>
  async (userId, id) => {
    const found = await d.repo.findById(id);
    // Una ajena se reporta como inexistente para no filtrar su existencia.
    if (!found || found.userId !== userId)
      return err(new DomainError('NOT_FOUND', 'Notificación no encontrada'));
    if (found.readAt) return ok(toPublic(found));
    const updated = await d.repo.markRead(id, d.now().toISOString());
    return updated
      ? ok(toPublic(updated))
      : err(new DomainError('NOT_FOUND', 'Notificación no encontrada'));
  };
