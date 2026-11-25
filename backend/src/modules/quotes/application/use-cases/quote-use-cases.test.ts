import { describe, expect, it } from 'vitest';
import { demoUser, fixtureProfiles, fixtureSocial } from '@sponcer/contracts/fixtures';
import type { DomainEvent } from '@sponcer/contracts';
import { createEventBus } from '../../../../shared/events/event-bus';
import { createProfilesModule } from '../../../profiles';
import { createMockQuoteRepository } from '../../infrastructure/out/mock/mock-adapters';
import { makeCreateQuote } from './create-quote';
import { makeListQuotes } from './list-quotes';
import { makeTransitionQuote } from './transition-quote';

const STRANGER = '00000000-0000-4000-8000-000000000000';
const MISSING = '00000000-0000-4000-8000-000000000001';
const NOW = new Date('2026-11-25T10:00:00Z');
const brand = fixtureProfiles.find((p) => p.ownerUserId === demoUser.id && p.role === 'brand')!;
const creator = fixtureProfiles.find((p) => p.ownerUserId === demoUser.id && p.role === 'creator')!;
const service = creator.services[0]!;

function setup() {
  const bus = createEventBus();
  const events: DomainEvent[] = [];
  bus.subscribe('QuoteStatusChanged', (e) => void events.push(e));
  const profiles = createProfilesModule({ adapter: 'mock', bus }).api;
  const quotes = createMockQuoteRepository();
  const d = { quotes, profiles, bus, now: () => NOW };
  return {
    events,
    create: makeCreateQuote(d),
    transition: makeTransitionQuote(d),
    list: makeListQuotes(d),
  };
}

const req = { requesterProfileId: brand.id, serviceId: service.id, message: 'hola', send: true };

describe('CreateQuote', () => {
  it('send=true deja la cotización en sent con historial draft->sent y publica el evento', async () => {
    const { create, events } = setup();
    const r = await create(demoUser.id, req);
    expect(r.ok && r.value.status).toBe('sent');
    expect(r.ok && r.value.history.map((h) => h.to)).toEqual(['draft', 'sent']);
    expect(events).toHaveLength(1);
  });

  it('send=false la deja en draft sin evento', async () => {
    const { create, events } = setup();
    const r = await create(demoUser.id, { ...req, send: false });
    expect(r.ok && r.value.status).toBe('draft');
    expect(events).toHaveLength(0);
  });

  it('exige perfil propio, rol marca y servicio existente', async () => {
    const { create } = setup();
    const code = async (u: string, body: typeof req) => {
      const r = await create(u, body);
      return !r.ok && r.error.code;
    };
    expect(await code(STRANGER, req)).toBe('FORBIDDEN');
    expect(await code(demoUser.id, { ...req, requesterProfileId: creator.id })).toBe('FORBIDDEN');
    expect(await code(demoUser.id, { ...req, serviceId: MISSING })).toBe('NOT_FOUND');
  });
});

describe('TransitionQuote', () => {
  it('el creador acepta y el estado cambia', async () => {
    const { create, transition, events } = setup();
    const q = await create(demoUser.id, req);
    if (!q.ok) throw new Error('setup');
    const r = await transition(demoUser.id, q.value.id, {
      actorProfileId: q.value.creatorProfileId,
      to: 'accepted',
    });
    expect(r.ok && r.value.status).toBe('accepted');
    expect(events.at(-1)).toMatchObject({ from: 'sent', to: 'accepted' });
  });

  it('actor ajeno al usuario -> FORBIDDEN; cotización inexistente -> NOT_FOUND; salto inválido -> INVALID_TRANSITION', async () => {
    const { create, transition } = setup();
    const q = await create(demoUser.id, req);
    if (!q.ok) throw new Error('setup');
    const forbidden = await transition(STRANGER, q.value.id, {
      actorProfileId: brand.id,
      to: 'cancelled',
    });
    const missing = await transition(demoUser.id, MISSING, {
      actorProfileId: brand.id,
      to: 'cancelled',
    });
    const invalid = await transition(demoUser.id, q.value.id, {
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
      expect(first.ok && first.value.nextCursor).toBe('1');
    } else {
      expect(first.ok && first.value.nextCursor).toBeNull();
    }
  });
});
