import { DomainError } from '../../../../shared/errors';
import type { EventBus } from '../../../../shared/events/event-bus';
import { err } from '../../../../shared/result';
import type { ProfilesApi } from '../../../profiles';
import { toQuoteView } from '../quote-view';
import { applyTransition } from '../../domain/quote';
import type { TransitionQuote } from '../ports/in/quotes-use-cases';
import type { CampaignRepository } from '../ports/out/campaign-repository';
import type { QuoteRepository } from '../ports/out/quote-repository';

export const makeTransitionQuote =
  (d: {
    quotes: QuoteRepository;
    campaigns: CampaignRepository;
    profiles: ProfilesApi;
    bus: EventBus;
    now: () => Date;
  }): TransitionQuote =>
  async (userId, quoteId, req) => {
    const quote = await d.quotes.findById(quoteId);
    if (!quote) return err(new DomainError('NOT_FOUND', 'Cotización no encontrada'));
    if (!(await d.profiles.isOwner(req.actorProfileId, userId))) {
      return err(new DomainError('FORBIDDEN', 'El perfil actor no es tuyo'));
    }
    const next = applyTransition(quote, req, d.now());
    if (!next.ok) return next;
    await d.quotes.save(next.value);
    d.bus.publish({
      type: 'QuoteStatusChanged',
      quoteId,
      from: quote.status,
      to: next.value.status,
    });
    return toQuoteView(d, next.value);
  };
