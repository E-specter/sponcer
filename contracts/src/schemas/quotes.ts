import { z } from 'zod';
import { MAX_QUOTE_MESSAGE, MAX_QUOTE_NOTE } from './limits';
import { Id, IsoDate, PageQuery, PricePen } from './common';
import { ProfileSummary, Service } from './profiles';

export const QUOTE_STATUSES = [
  'draft',
  'sent',
  'negotiating',
  'accepted',
  'rejected',
  'completed',
  'cancelled',
] as const;
export const QuoteStatus = z.enum(QUOTE_STATUSES);
export type QuoteStatus = z.infer<typeof QuoteStatus>;

/** Máquina de estados (patrón State en backend/quotes). Contrato: el frontend lo usa para mostrar acciones. */
export const QUOTE_TRANSITIONS: Record<QuoteStatus, readonly QuoteStatus[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['negotiating', 'accepted', 'rejected', 'cancelled'],
  negotiating: ['accepted', 'rejected', 'cancelled'],
  accepted: ['completed', 'cancelled'],
  rejected: [],
  completed: [],
  cancelled: [],
};

/** Quién puede disparar cada transición: el que solicita (marca) o el creador dueño del servicio. */
export const QUOTE_TRANSITION_ACTOR: Record<QuoteStatus, 'requester' | 'creator' | 'any'> = {
  draft: 'requester',
  sent: 'requester',
  negotiating: 'any',
  accepted: 'creator',
  rejected: 'creator',
  completed: 'any',
  cancelled: 'any',
};

export const CreateQuoteRequest = z.object({
  requesterProfileId: Id,
  serviceId: Id,
  message: z.string().trim().min(1).max(MAX_QUOTE_MESSAGE),
  amountPen: PricePen.optional(),
  send: z.boolean().default(true),
});
export type CreateQuoteRequest = z.infer<typeof CreateQuoteRequest>;

export const TransitionQuoteRequest = z.object({
  actorProfileId: Id,
  to: QuoteStatus,
  amountPen: PricePen.optional(),
  note: z.string().trim().max(MAX_QUOTE_NOTE).optional(),
});
export type TransitionQuoteRequest = z.infer<typeof TransitionQuoteRequest>;

export const QuoteEvent = z.object({
  from: QuoteStatus.nullable(),
  to: QuoteStatus,
  actorProfileId: Id,
  note: z.string().nullable(),
  at: IsoDate,
});

/** Cotización persistida (sin datos de otras entidades). */
export const QuoteRecord = z.object({
  id: Id,
  serviceId: Id,
  creatorProfileId: Id,
  requesterProfileId: Id,
  status: QuoteStatus,
  amountPen: PricePen.nullable(),
  message: z.string(),
  history: z.array(QuoteEvent),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});
export type QuoteRecord = z.infer<typeof QuoteRecord>;

/** Cotización tal como la devuelve la API: con las dos partes y el servicio, para pintar la lista sin más llamadas. */
export const Quote = QuoteRecord.extend({
  creator: ProfileSummary,
  requester: ProfileSummary,
  service: Service,
});
export type Quote = z.infer<typeof Quote>;

export const QuotesQuery = PageQuery.extend({ profileId: Id });
