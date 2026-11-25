import type { QuoteRecord, QuoteStatus } from '@sponcer/contracts';

type QuoteEvent = QuoteRecord['history'][number];

export interface QuoteRow {
  id: string;
  service_id: string;
  creator_profile_id: string;
  requester_profile_id: string;
  status: QuoteStatus;
  amount_pen: number | null;
  message: string;
  created_at: string;
  updated_at: string;
}

export interface EventRow {
  seq: number;
  from_status: QuoteStatus | null;
  to_status: QuoteStatus;
  actor_profile_id: string;
  note: string | null;
  at: string;
}

/** Postgres devuelve `+00:00`; el contrato usa ISO con `Z` (mismo instante). */
const iso = (s: string): string => new Date(s).toISOString();

export const eventFromRow = (r: EventRow): QuoteEvent => ({
  from: r.from_status,
  to: r.to_status,
  actorProfileId: r.actor_profile_id,
  note: r.note,
  at: iso(r.at),
});

export const eventToRow = (quoteId: string, e: QuoteEvent) => ({
  quote_id: quoteId,
  from_status: e.from,
  to_status: e.to,
  actor_profile_id: e.actorProfileId,
  note: e.note,
  at: e.at,
});

export const quoteFromRow = (r: QuoteRow, events: EventRow[]): QuoteRecord => ({
  id: r.id,
  serviceId: r.service_id,
  creatorProfileId: r.creator_profile_id,
  requesterProfileId: r.requester_profile_id,
  status: r.status,
  amountPen: r.amount_pen,
  message: r.message,
  history: [...events].sort((a, b) => a.seq - b.seq).map(eventFromRow),
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

export const quoteToRow = (q: QuoteRecord): QuoteRow => ({
  id: q.id,
  service_id: q.serviceId,
  creator_profile_id: q.creatorProfileId,
  requester_profile_id: q.requesterProfileId,
  status: q.status,
  amount_pen: q.amountPen,
  message: q.message,
  created_at: q.createdAt,
  updated_at: q.updatedAt,
});
