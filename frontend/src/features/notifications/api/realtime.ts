import { Notification } from '@sponcer/contracts';
import { subscribeInserts, type Unsubscribe } from '../../../lib/realtime';

interface NotificationRow {
  id: string;
  kind: string;
  payload: unknown;
  read_at: string | null;
  created_at: string;
}

const iso = (d: string) => new Date(d).toISOString();

/** Notificaciones nuevas del usuario (postgres_changes en `notifications`, filtro por user_id, RLS). */
export function subscribeNotifications(onNotification: (n: Notification) => void): Unsubscribe {
  return subscribeInserts<NotificationRow>(
    'notifications',
    (userId) => `user_id=eq.${userId}`,
    (row) => {
      const parsed = Notification.safeParse({
        id: row.id,
        kind: row.kind,
        payload: row.payload,
        readAt: row.read_at ? iso(row.read_at) : null,
        createdAt: iso(row.created_at),
      });
      if (parsed.success) onNotification(parsed.data);
    },
  );
}
