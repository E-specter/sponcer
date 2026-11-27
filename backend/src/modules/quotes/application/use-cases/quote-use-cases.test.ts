import { describe, expect, it } from 'vitest';
import {
  demoInfluencer,
  demoUser,
  fixtureProfiles,
  fixtureSocial,
} from '@sponcer/contracts/fixtures';
import type { DomainEvent } from '@sponcer/contracts';
import { createEventBus } from '../../../../shared/events/event-bus';
import { createWindowLimiter } from '../../../../shared/rate-limit';
import { createProfilesModule } from '../../../profiles';
import {
  createMockCampaignRepository,
  createMockQuoteRepository,
} from '../../infrastructure/out/mock/mock-adapters';
import { makeCreateQuote } from './create-quote';
import { encodeCursor } from '../../../../shared/cursor';
import { makeListQuotes } from './list-quotes';
import { makeTransitionQuote } from './transition-quote';

const STRANGER = '00000000-0000-4000-8000-000000000000';
const MISSING = '00000000-0000-4000-8000-000000000001';
const NOW = new Date('2026-11-25T10:00:00Z');
const HOUR_MS = 3_600_000;
const PLENTY = 100;
const OVERRIDE_AMOUNT = 500;
const profile = (handle: string) => fixtureProfiles.find((p) => p.snapshot.handle === handle)!;
const brand = profile('rumbo.viajes.demo');
const otherBrand = profile('andina.snacks.demo');
const brandOfOthers = profile('kallpa.sport.demo');
const sofi = profile('sofi.moda.demo');
const valeria = profile('valeria.fitness.demo');
const camila = profile('camila.gastronomia.demo');
const GENERAL = fixtureSocial.campaigns.find((c) => c.brandProfileId === brand.id)!;
const DRAFT_CAMPAIGN = fixtureSocial.campaigns.find((c) => c.brandProfileId === otherBrand.id)!;

function setup(limit = PLENTY) {
  const bus = createEventBus();
  const events: DomainEvent[] = [];
  bus.subscribe('QuoteStatusChanged', (e) => void events.push(e));
  const profiles = createProfilesModule({ adapter: 'mock', bus }).api;
  const quotes = createMockQuoteRepository();
  const campaigns = createMockCampaignRepository();
  const limiter = createWindowLimiter({ limit, windowMs: HOUR_MS, now: () => NOW });
  const d = { quotes, campaigns, profiles, bus, now: () => NOW, limiter };
  return {
    events,
    create: makeCreateQuote(d),
    transition: makeTransitionQuote(d),
    list: makeListQuotes(d),
  };
}

const req = {
  requesterProfileId: brand.id,
  campaignId: GENERAL.id,
  targets: [{ creatorProfileId: valeria.id, serviceId: valeria.services[0]!.id }],
  message: 'hola',
  send: true,
};
// Cotización enviada a valeria dentro de la campaña General.
const createOne = async (create: ReturnType<typeof setup>['create']) => {
  const r = await create(demoUser.id, req);
  if (!r.ok || r.value.created.length !== 1) throw new Error('setup');
  return r.value.created[0]!;
};

describe('CreateQuote', () => {
  it('send=true deja la cotización en sent con historial draft->sent y publica el evento', async () => {
    const { create, events } = setup();
    const q = await createOne(create);
    expect(q.status).toBe('sent');
    expect(q.history.map((h) => h.to)).toEqual(['draft', 'sent']);
    expect(q.campaign).toMatchObject({ id: GENERAL.id, name: 'General' });
    expect(q.service?.id).toBe(valeria.services[0]!.id);
    expect(events).toHaveLength(1);
  });

  it('send=false la deja en draft sin evento', async () => {
    const { create, events } = setup();
    const r = await create(demoUser.id, { ...req, send: false });
    expect(r.ok && r.value.created[0]?.status).toBe('draft');
    expect(events).toHaveLength(0);
  });

  it('cotiza a varios a la vez, sin match y sin servicio (propuesta abierta), con created y failed por destinatario', async () => {
    const { create } = setup();
    const r = await create(demoUser.id, {
      ...req,
      targets: [
        { creatorProfileId: valeria.id },
        { creatorProfileId: camila.id, serviceId: camila.services[0]!.id },
        { creatorProfileId: MISSING },
        { creatorProfileId: sofi.id }, // ya tiene una cotización abierta en General
        { creatorProfileId: camila.id }, // repetida en la misma petición
        { creatorProfileId: valeria.id, serviceId: camila.services[1]!.id }, // servicio ajeno
      ],
      amountPen: OVERRIDE_AMOUNT,
    });
    if (!r.ok) throw new Error('setup');
    expect(r.value.created.map((q) => [q.creatorProfileId, q.serviceId, q.amountPen])).toEqual([
      [valeria.id, null, OVERRIDE_AMOUNT],
      [camila.id, camila.services[0]!.id, OVERRIDE_AMOUNT],
    ]);
    expect(r.value.failed.map((f) => [f.creatorProfileId, f.code])).toEqual([
      [MISSING, 'NOT_FOUND'],
      [sofi.id, 'CONFLICT'],
      [camila.id, 'CONFLICT'],
      [valeria.id, 'VALIDATION_ERROR'],
    ]);
  });

  it('sin monto y con servicio toma el precio del servicio; sin servicio queda sin monto', async () => {
    const { create } = setup();
    const r = await create(demoUser.id, {
      ...req,
      targets: [
        { creatorProfileId: valeria.id, serviceId: valeria.services[0]!.id },
        { creatorProfileId: camila.id },
      ],
    });
    expect(r.ok && r.value.created.map((q) => q.amountPen)).toEqual([
      valeria.services[0]!.pricePen,
      null,
    ]);
  });

  it('una cotización terminal no bloquea una nueva al mismo creador; una abierta sí', async () => {
    const { create, transition } = setup();
    const first = await createOne(create);
    const blocked = await create(demoUser.id, req);
    expect(blocked.ok && blocked.value.failed.map((f) => f.code)).toEqual(['CONFLICT']);
    await transition(demoUser.id, first.id, { actorProfileId: brand.id, to: 'cancelled' });
    const again = await create(demoUser.id, req);
    expect(again.ok && again.value.created).toHaveLength(1);
  });

  it('exige perfil propio, rol marca y campaña propia, activa y existente', async () => {
    const { create } = setup();
    const code = async (u: string, body: typeof req) => {
      const r = await create(u, body);
      return !r.ok && r.error.code;
    };
    expect(await code(STRANGER, req)).toBe('FORBIDDEN');
    expect(await code(demoInfluencer.id, { ...req, requesterProfileId: sofi.id })).toBe(
      'FORBIDDEN',
    );
    expect(await code(demoUser.id, { ...req, requesterProfileId: brandOfOthers.id })).toBe(
      'FORBIDDEN',
    );
    expect(await code(demoUser.id, { ...req, campaignId: MISSING })).toBe('NOT_FOUND');
    // Campaña de otra marca (aunque sea del mismo usuario): no es de la solicitante.
    expect(await code(demoUser.id, { ...req, campaignId: DRAFT_CAMPAIGN.id })).toBe('NOT_FOUND');
    // Campaña propia pero en borrador.
    expect(
      await code(demoUser.id, {
        ...req,
        requesterProfileId: otherBrand.id,
        campaignId: DRAFT_CAMPAIGN.id,
      }),
    ).toBe('VALIDATION_ERROR');
  });

  it('el límite por hora corta las cotizaciones y avisa en failed; si no cabe ninguna, RATE_LIMITED', async () => {
    const { create } = setup(1);
    const partial = await create(demoUser.id, {
      ...req,
      targets: [{ creatorProfileId: valeria.id }, { creatorProfileId: camila.id }],
    });
    expect(partial.ok && [partial.value.created.length, partial.value.failed.length]).toEqual([
      1, 1,
    ]);
    const none = await create(demoUser.id, {
      ...req,
      targets: [{ creatorProfileId: profile('mateo.deportes.demo').id }],
    });
    expect(!none.ok && none.error.code).toBe('RATE_LIMITED');
  });
});

describe('TransitionQuote', () => {
  it('el creador acepta y el estado cambia', async () => {
    const { create, transition, events } = setup();
    const q = await createOne(create);
    const r = await transition(valeria.ownerUserId!, q.id, {
      actorProfileId: q.creatorProfileId,
      to: 'accepted',
    });
    expect(r.ok && r.value.status).toBe('accepted');
    expect(events.at(-1)).toMatchObject({ from: 'sent', to: 'accepted' });
  });

  it('actor ajeno al usuario -> FORBIDDEN; cotización inexistente -> NOT_FOUND; salto inválido -> INVALID_TRANSITION', async () => {
    const { create, transition } = setup();
    const q = await createOne(create);
    const forbidden = await transition(STRANGER, q.id, {
      actorProfileId: brand.id,
      to: 'cancelled',
    });
    const missing = await transition(demoUser.id, MISSING, {
      actorProfileId: brand.id,
      to: 'cancelled',
    });
    const invalid = await transition(demoUser.id, q.id, {
      actorProfileId: brand.id,
      to: 'completed',
    });
    expect([forbidden, missing, invalid].map((r) => !r.ok && r.error.code)).toEqual([
      'FORBIDDEN',
      'NOT_FOUND',
      'INVALID_TRANSITION',
    ]);
  });
});

const PAGE = 50;

describe('ListQuotes', () => {
  it('lista las del perfil propio y rechaza perfiles ajenos', async () => {
    const { list } = setup();
    const seeded = fixtureSocial.quotes[0]!;
    const owner = fixtureProfiles.find((p) => p.id === seeded.requesterProfileId)!.ownerUserId!;
    const mine = await list(owner, seeded.requesterProfileId, { limit: PAGE });
    expect(mine.ok && mine.value.items.map((q) => q.id)).toContain(seeded.id);
    const other = await list(STRANGER, brand.id, { limit: PAGE });
    expect(!other.ok && other.error.code).toBe('FORBIDDEN');
  });

  it('filtra por campaña y devuelve la campaña y el servicio (nullable)', async () => {
    const { list, create } = setup();
    await create(demoUser.id, { ...req, targets: [{ creatorProfileId: valeria.id }] });
    const all = await list(demoUser.id, brand.id, { limit: PAGE });
    const inGeneral = await list(demoUser.id, brand.id, { limit: PAGE, campaignId: GENERAL.id });
    const elsewhere = await list(demoUser.id, brand.id, { limit: PAGE, campaignId: MISSING });
    expect(all.ok && all.value.items).toHaveLength(2);
    expect(inGeneral.ok && inGeneral.value.items.every((q) => q.campaign.id === GENERAL.id)).toBe(
      true,
    );
    expect(inGeneral.ok && inGeneral.value.items.map((q) => q.service === null)).toContain(true);
    expect(elsewhere.ok && elsewhere.value.items).toEqual([]);
  });

  it('pagina con cursor, más reciente primero, sin repetir ni perder', async () => {
    const { list } = setup();
    const seeded = fixtureSocial.quotes[0]!;
    const owner = fixtureProfiles.find((p) => p.id === seeded.requesterProfileId)!.ownerUserId!;
    const all = await list(owner, seeded.requesterProfileId, { limit: PAGE });
    const first = await list(owner, seeded.requesterProfileId, { limit: 1 });
    expect(first.ok && first.value.items).toHaveLength(1);
    const dates = all.ok ? all.value.items.map((q) => q.createdAt) : [];
    expect([...dates].sort().reverse()).toEqual(dates);
    if (all.ok && all.value.items.length > 1) {
      expect(first.ok && first.value.nextCursor).toBe(encodeCursor(1));
    } else {
      expect(first.ok && first.value.nextCursor).toBeNull();
    }
  });
});
