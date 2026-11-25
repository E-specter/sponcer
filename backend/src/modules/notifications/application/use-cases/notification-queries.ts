import type { Notification } from '@sponcer/contracts';
import { decodeCursor, encodeCursor } from '../../../../shared/cursor';
import { DomainError } from '../../../../shared/errors';
import { err, ok } from '../../../../shared/result';
import type { ListNotifications, MarkAsRead } from '../ports/in/notification-use-cases';
import type {
  NotificationRepository,
  StoredNotification,
} from '../ports/out/notification-repository';

const toPublic = ({ userId: _userId, ...n }: StoredNotification): Notification => n;

export const makeListNotifications =
  (d: { repo: NotificationRepository }): ListNotifications =>
  async (userId, q) => {
    const parsed = decodeCursor(q.cursor);
    if (!parsed.ok) return parsed;
    const offset = parsed.value;
    const { items, total } = await d.repo.listByUser(userId, offset, q.limit);
    const next = offset + items.length;
    return ok({ items: items.map(toPublic), nextCursor: next < total ? encodeCursor(next) : null });
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
