import type { QuoteStatus } from '../schemas/quotes';

/** Eventos de dominio (docs/05-contratos/eventos-realtime.md). Bus en proceso, ADR-005. */
export type DomainEvent =
  | { type: 'ProfileIngested'; igHandle: string; snapshotId: string }
  | { type: 'ProfileVerified'; igHandle: string; userId: string; role: 'creator' | 'brand' }
  | { type: 'ProfileDeclaredDataChanged'; profileId: string }
  /** Ficha retirada (Ley 29733): ingestion bloquea el handle y borra snapshots; classification borra clasificación y embedding. */
  | { type: 'ProfileRemoved'; profileId: string; igHandle: string }
  | { type: 'ProfileClassified'; profileId: string }
  | { type: 'MatchCreated'; matchId: string; creatorProfileId: string; brandProfileId: string }
  | { type: 'QuoteStatusChanged'; quoteId: string; from: QuoteStatus | null; to: QuoteStatus }
  | { type: 'MessageSent'; messageId: string; matchId: string; senderProfileId: string };

export type DomainEventType = DomainEvent['type'];
export type EventOf<T extends DomainEventType> = Extract<DomainEvent, { type: T }>;

/** Canales realtime de solo lectura del frontend (ADR-006). */
export const REALTIME_TABLES = { notifications: 'notifications', messages: 'messages' } as const;
