import type { SupabaseClient } from '@supabase/supabase-js';
import type { Notification } from '@sponcer/contracts';
import { unwrap } from '../../../../../shared/supabase/unwrap';
import type {
  NotificationRepository,
  StoredNotification,
} from '../../../application/ports/out/notification-repository';

interface Row {
  id: string;
  user_id: string;
  kind: Notification['kind'];
  payload: Record<string, string>;
  read_at: string | null;
  created_at: string;
}

const iso = (s: string): string => new Date(s).toISOString();

export const notificationFromRow = (r: Row): StoredNotification => ({
  id: r.id,
  userId: r.user_id,
  kind: r.kind,
  payload: r.payload,
  readAt: r.read_at ? iso(r.read_at) : null,
  createdAt: iso(r.created_at),
});

const toRow = (n: StoredNotification) => ({
  id: n.id,
  user_id: n.userId,
  kind: n.kind,
  payload: n.payload,
  read_at: n.readAt,
  created_at: n.createdAt,
});

export function createSupabaseNotificationRepository(
  supabase: SupabaseClient,
): NotificationRepository {
  const table = () => supabase.from('notifications');
  return {
    async add(n) {
      unwrap(await table().insert(toRow(n)));
    },
    async findById(id) {
      const row = unwrap(await table().select('*').eq('id', id).maybeSingle<Row>());
      return row ? notificationFromRow(row) : null;
    },
    async listByUser(userId, offset, limit) {
      const res = await table()
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .order('id')
        .range(offset, offset + limit - 1)
        .returns<Row[]>();
      return { items: unwrap(res).map(notificationFromRow), total: res.count ?? 0 };
    },
    async markRead(id, at) {
      const row = unwrap(
        await table().update({ read_at: at }).eq('id', id).select('*').maybeSingle<Row>(),
      );
      return row ? notificationFromRow(row) : null;
    },
  };
}
