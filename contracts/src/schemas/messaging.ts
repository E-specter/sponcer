import { z } from 'zod';
import { MAX_CHAT_MESSAGE } from './limits';
import { Id, IsoDate, PageQuery } from './common';

// ---- Notificaciones (RF-12) ----

export const NotificationKind = z.enum([
  'match_created',
  'quote_status_changed',
  'message_received',
]);

export const Notification = z.object({
  id: Id,
  kind: NotificationKind,
  /** Datos mínimos para pintar y enlazar: matchId, quoteId, profileId, etc. */
  payload: z.record(z.string(), z.string()),
  readAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: IsoDate,
});
export type Notification = z.infer<typeof Notification>;

// ---- Chat (RF-13) ----

export const Message = z.object({
  id: Id,
  matchId: Id,
  senderProfileId: Id,
  body: z.string(),
  createdAt: IsoDate,
});
export type Message = z.infer<typeof Message>;

export const SendMessageRequest = z.object({
  senderProfileId: Id,
  body: z.string().trim().min(1).max(MAX_CHAT_MESSAGE),
});
export type SendMessageRequest = z.infer<typeof SendMessageRequest>;

export const MessagesQuery = PageQuery;
