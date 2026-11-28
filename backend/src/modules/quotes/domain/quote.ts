import {
  QUOTE_TRANSITIONS,
  QUOTE_TRANSITION_ACTOR,
  type QuoteRecord,
  type QuoteStatus,
} from '@sponcer/contracts';
import { DomainError } from '../../../shared/errors';
import { err, ok, type Result } from '../../../shared/result';

/** Estado de dominio = el `QuoteRecord` del contrato (State: la tabla de transiciones vive en contracts). */
export type { QuoteRecord };

export interface TransitionInput {
  actorProfileId: string;
  to: QuoteStatus;
  amountPen?: number | undefined;
  note?: string | undefined;
}

export const canTransition = (from: QuoteStatus, to: QuoteStatus): boolean =>
  QUOTE_TRANSITIONS[from].includes(to);

/** Valida quién puede disparar la transición hacia `to` (regla por estado destino). */
export function actorAllowed(quote: QuoteRecord, to: QuoteStatus, actorProfileId: string): boolean {
  const rule = QUOTE_TRANSITION_ACTOR[to];
  if (rule === 'requester') return actorProfileId === quote.requesterProfileId;
  if (rule === 'creator') return actorProfileId === quote.creatorProfileId;
  return actorProfileId === quote.requesterProfileId || actorProfileId === quote.creatorProfileId;
}

export function newQuote(p: {
  id: string;
  campaignId: string;
  serviceId: string | null;
  creatorProfileId: string;
  requesterProfileId: string;
  message: string;
  amountPen: number | null;
  now: Date;
}): QuoteRecord {
  const at = p.now.toISOString();
  return {
    id: p.id,
    campaignId: p.campaignId,
    serviceId: p.serviceId,
    creatorProfileId: p.creatorProfileId,
    requesterProfileId: p.requesterProfileId,
    status: 'draft',
    amountPen: p.amountPen,
    message: p.message,
    history: [{ from: null, to: 'draft', actorProfileId: p.requesterProfileId, note: null, at }],
    createdAt: at,
    updatedAt: at,
  };
}

export function applyTransition(
  quote: QuoteRecord,
  input: TransitionInput,
  now: Date,
): Result<QuoteRecord, DomainError> {
  if (!canTransition(quote.status, input.to)) {
    return err(
      new DomainError('INVALID_TRANSITION', `No se puede pasar de ${quote.status} a ${input.to}`),
    );
  }
  if (!actorAllowed(quote, input.to, input.actorProfileId)) {
    return err(
      new DomainError('FORBIDDEN', `Este perfil no puede mover la cotización a ${input.to}`),
    );
  }
  const at = now.toISOString();
  return ok({
    ...quote,
    status: input.to,
    // Solo en negociación se puede renegociar el monto.
    amountPen: input.to === 'negotiating' ? (input.amountPen ?? quote.amountPen) : quote.amountPen,
    history: [
      ...quote.history,
      {
        from: quote.status,
        to: input.to,
        actorProfileId: input.actorProfileId,
        note: input.note ?? null,
        at,
      },
    ],
    updatedAt: at,
  });
}
