import { randomUUID } from 'node:crypto';
import { DomainError } from '../../../../shared/errors';
import type { EventBus } from '../../../../shared/events/event-bus';
import { err } from '../../../../shared/result';
import type { ProfilesApi } from '../../../profiles';
import { toQuoteView } from '../quote-view';
import { applyTransition, newQuote } from '../../domain/quote';
import type { CreateQuote } from '../ports/in/quotes-use-cases';
import type { QuoteRepository } from '../ports/out/quote-repository';

export const makeCreateQuote =
  (d: {
    quotes: QuoteRepository;
    profiles: ProfilesApi;
    bus: EventBus;
    now: () => Date;
    newId?: () => string;
  }): CreateQuote =>
  async (userId, req) => {
    const mine = await d.profiles.listByOwner(userId);
    const requester = mine.find((p) => p.id === req.requesterProfileId);
    if (!requester) return err(new DomainError('FORBIDDEN', 'El perfil solicitante no es tuyo'));
    if (requester.role !== 'brand')
      return err(new DomainError('FORBIDDEN', 'Solo las marcas solicitan cotizaciones'));
    const found = await d.profiles.getService(req.serviceId);
    if (!found) return err(new DomainError('NOT_FOUND', 'Servicio no encontrado'));

    const now = d.now();
    const draft = newQuote({
      id: (d.newId ?? randomUUID)(),
      serviceId: req.serviceId,
      creatorProfileId: found.creatorProfileId,
      requesterProfileId: req.requesterProfileId,
      message: req.message,
      amountPen: req.amountPen ?? found.service.pricePen,
      now,
    });
    if (!req.send) {
      await d.quotes.save(draft);
      return toQuoteView(d.profiles, draft);
    }
    const sent = applyTransition(
      draft,
      { actorProfileId: req.requesterProfileId, to: 'sent' },
      now,
    );
    if (!sent.ok) return sent;
    await d.quotes.save(sent.value);
    d.bus.publish({
      type: 'QuoteStatusChanged',
      quoteId: sent.value.id,
      from: 'draft',
      to: 'sent',
    });
    return toQuoteView(d.profiles, sent.value);
  };
