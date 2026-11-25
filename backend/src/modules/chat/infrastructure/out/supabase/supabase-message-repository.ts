import type { SupabaseClient } from '@supabase/supabase-js';
import type { Message } from '@sponcer/contracts';
import { unwrap } from '../../../../../shared/supabase/unwrap';
import type { MessageRepository } from '../../../application/ports/out/chat-ports';

interface Row {
  id: string;
  match_id: string;
  sender_profile_id: string;
  body: string;
  created_at: string;
}

export const messageFromRow = (r: Row): Message => ({
  id: r.id,
  matchId: r.match_id,
  senderProfileId: r.sender_profile_id,
  body: r.body,
  createdAt: new Date(r.created_at).toISOString(),
});

/** El insert dispara la entrega en vivo (Supabase Realtime postgres_changes, ADR-006). */
export function createSupabaseMessageRepository(supabase: SupabaseClient): MessageRepository {
  const table = () => supabase.from('messages');
  return {
    async add(m) {
      unwrap(
        await table().insert({
          id: m.id,
          match_id: m.matchId,
          sender_profile_id: m.senderProfileId,
          body: m.body,
          created_at: m.createdAt,
        }),
      );
    },
    async listByMatch(matchId, offset, limit) {
      const res = await table()
        .select('*', { count: 'exact' })
        .eq('match_id', matchId)
        .order('created_at', { ascending: false })
        .order('id')
        .range(offset, offset + limit - 1)
        .returns<Row[]>();
      return { items: unwrap(res).map(messageFromRow), total: res.count ?? 0 };
    },
  };
}
