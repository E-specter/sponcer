import { Message } from '@sponcer/contracts';
import { subscribeInserts, type Unsubscribe } from '../../../lib/realtime';

export type { Unsubscribe };

interface MessageRow {
  id: string;
  match_id: string;
  sender_profile_id: string;
  body: string;
  created_at: string;
}

/**
 * Mensajes nuevos de un match (ADR-006: Supabase Realtime, postgres_changes sobre `messages`,
 * protegido por RLS). Solo lectura; en auth mock es un no-op. La isla descarta duplicados por id.
 */
export function subscribeMessages(
  matchId: string,
  onMessage: (m: Message) => void,
  onSubscribed?: () => void,
): Unsubscribe {
  return subscribeInserts<MessageRow>(
    'messages',
    () => `match_id=eq.${matchId}`,
    (row) => {
      const parsed = Message.safeParse({
        id: row.id,
        matchId: row.match_id,
        senderProfileId: row.sender_profile_id,
        body: row.body,
        createdAt: new Date(row.created_at).toISOString(),
      });
      if (parsed.success) onMessage(parsed.data);
    },
    onSubscribed,
  );
}
