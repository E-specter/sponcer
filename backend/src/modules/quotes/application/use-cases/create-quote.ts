import { randomUUID } from 'node:crypto';
import type { CreateQuotesResult, QuoteTarget } from '@sponcer/contracts';
import { DomainError } from '../../../../shared/errors';
import type { EventBus } from '../../../../shared/events/event-bus';
import type { WindowLimiter } from '../../../../shared/rate-limit';
import { err, ok } from '../../../../shared/result';
import type { ProfilesApi } from '../../../profiles';
import { isOpenQuote } from '../../domain/campaign';
import { applyTransition, newQuote } from '../../domain/quote';
import type { CreateQuote } from '../ports/in/quotes-use-cases';
import type { CampaignRepository } from '../ports/out/campaign-repository';
import type { QuoteRepository } from '../ports/out/quote-repository';
import { toQuoteViews } from '../quote-view';

type Failed = CreateQuotesResult['failed'][number];
const RATE_MESSAGE = 'Alcanzaste el límite de cotizaciones por hora; prueba más tarde';

export const makeCreateQuote =
  (d: {
    quotes: QuoteRepository;
    campaigns: CampaignRepository;
    profiles: ProfilesApi;
    bus: EventBus;
    limiter: WindowLimiter;
    now: () => Date;
    newId?: () => string;
  }): CreateQuote =>
  async (userId, req) => {
    const mine = await d.profiles.listByOwner(userId);
    const requester = mine.find((p) => p.id === req.requesterProfileId);
    if (!requester) return err(new DomainError('FORBIDDEN', 'El perfil solicitante no es tuyo'));
    if (requester.role !== 'brand')
      return err(new DomainError('FORBIDDEN', 'Solo las marcas solicitan cotizaciones'));
    const campaign = await d.campaigns.findById(req.campaignId);
    if (!campaign || campaign.brandProfileId !== requester.id)
      return err(new DomainError('NOT_FOUND', 'Campaña no encontrada'));
    if (campaign.status !== 'active')
      return err(
        new DomainError('VALIDATION_ERROR', 'Solo se cotiza dentro de una campaña activa', {
          reason: 'campaign_not_active',
        }),
      );

    const taken = new Set(
      (await d.quotes.listByCampaign(campaign.id))
        .filter(isOpenQuote)
        .map((q) => q.creatorProfileId),
    );
    const created = [];
    const failed: Failed[] = [];
    const fail = (t: QuoteTarget, code: Failed['code'], message: string) =>
      void failed.push({ creatorProfileId: t.creatorProfileId, code, message });

    for (const target of req.targets) {
      const [creator] = await d.profiles.getCards([target.creatorProfileId]);
      if (!creator || creator.role !== 'creator') {
        fail(target, 'NOT_FOUND', 'Creador no encontrado');
        continue;
      }
      const found = target.serviceId ? await d.profiles.getService(target.serviceId) : null;
      if (target.serviceId && found?.creatorProfileId !== creator.id) {
        fail(target, 'VALIDATION_ERROR', 'El servicio no pertenece a ese creador');
        continue;
      }
      if (taken.has(creator.id)) {
        fail(target, 'CONFLICT', 'Ya hay una cotización abierta para ese creador en la campaña');
        continue;
      }
      if (!d.limiter.tryTake(requester.id)) {
        fail(target, 'VALIDATION_ERROR', RATE_MESSAGE);
        continue;
      }

      const now = d.now();
      const draft = newQuote({
        id: (d.newId ?? randomUUID)(),
        campaignId: campaign.id,
        serviceId: target.serviceId ?? null,
        creatorProfileId: creator.id,
        requesterProfileId: requester.id,
        message: req.message,
        amountPen: req.amountPen ?? found?.service.pricePen ?? null,
        now,
      });
      const quote = req.send
        ? applyTransition(draft, { actorProfileId: requester.id, to: 'sent' }, now)
        : ok(draft);
      if (!quote.ok) return quote;
      try {
        await d.quotes.save(quote.value);
      } catch (e) {
        // Carrera con otra petición: el índice único de la BD ya tomó ese creador.
        if (!(e instanceof DomainError && e.code === 'CONFLICT')) throw e;
        fail(target, 'CONFLICT', 'Ya hay una cotización abierta para ese creador en la campaña');
        continue;
      }
      taken.add(creator.id);
      created.push(quote.value);
      if (req.send)
        d.bus.publish({
          type: 'QuoteStatusChanged',
          quoteId: quote.value.id,
          from: 'draft',
          to: 'sent',
        });
    }

    // Todo rechazado por el límite: es un error de la petición, no un resultado parcial.
    if (
      created.length === 0 &&
      failed.length > 0 &&
      failed.every((f) => f.message === RATE_MESSAGE)
    )
      return err(new DomainError('RATE_LIMITED', RATE_MESSAGE));
    const views = await toQuoteViews(d, created);
    return views.ok ? ok({ created: views.value, failed }) : views;
  };
