import { describe, expect, it, vi } from 'vitest';
import type { ProfileCard } from '@sponcer/contracts';
import { ok } from '../../../../shared/result';
import type { Candidate } from '../../domain/candidate';
import { weightedScore } from '../../domain/weighted-score';
import type { CandidateSearch } from '../ports/out/candidate-search';
import { INITIAL_POOL, MAX_POOL, makeGetFeed } from './get-feed';

const WEIGHTS = [1, 1, 1, 1];
const LIMIT = 5;
const DOUBLE = 2;
const CARD_A = 1;
const CARD_B = 2;
const CARD_C = 3;
const ENGAGEMENT = 0.05;
const FOLLOWERS = 1000;
const ID_WIDTH = 12;
const NOISE_OFFSET = 10;
const VIEWER = '00000000-0000-4000-8000-000000000000';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(ID_WIDTH, '0')}`;

const card = (n: number, over: Partial<ProfileCard> = {}): ProfileCard => ({
  id: uuid(n + 1),
  handle: `marca${n}.demo`,
  role: 'brand',
  fullName: `Marca ${n}`,
  profilePicUrl: null,
  status: 'verified',
  niches: ['moda'],
  tier: 'micro',
  followers: FOLLOWERS,
  engagementRate: ENGAGEMENT,
  sector: null,
  minServicePricePen: null,
  budgetMaxPen: null,
  city: 'lima',
  bio: null,
  bioSource: null,
  ...over,
});
const cand = (c: ProfileCard): Candidate => ({ card: c, embedding: null });

/** Búsqueda falsa: entrega los primeros `limit` del universo y `exhausted` cuando ya los entregó todos. */
const fakeSearch = (universe: Candidate[]): CandidateSearch & { calls: number[] } => {
  const calls: number[] = [];
  return {
    calls,
    find: async (_id, o) => {
      const limit = o?.limit ?? universe.length;
      calls.push(limit);
      return ok({
        viewer: cand(card(-1, { id: VIEWER, role: 'creator' })),
        candidates: universe.slice(0, limit),
        exhausted: limit >= universe.length,
      });
    },
  };
};

const feed = (search: CandidateSearch) =>
  makeGetFeed({
    profiles: { isOwner: async () => true, listByOwner: async () => [] },
    search,
    interactions: {
      upsert: vi.fn(),
      find: vi.fn(),
      listByActor: async () => [],
      listByTarget: async () => [],
    },
    scoring: weightedScore(WEIGHTS),
  });

const noise = (count: number) =>
  Array.from({ length: count }, (_, i) => cand(card(i + NOISE_OFFSET, { city: 'cusco' })));

describe('GetFeed · includeInteracted', () => {
  const seen = uuid(CARD_A + 1);
  const own = uuid(CARD_B + 1);
  const run = async (includeInteracted?: boolean) => {
    const excludes: string[][] = [];
    const base = fakeSearch([cand(card(CARD_A))]);
    const get = makeGetFeed({
      profiles: { isOwner: async () => true, listByOwner: async () => [{ id: own }] as never },
      search: {
        find: async (id, o) => {
          excludes.push(o?.exclude ?? []);
          return base.find(id, o);
        },
      },
      interactions: {
        upsert: vi.fn(),
        find: vi.fn(),
        listByActor: async () => [{ targetProfileId: seen, kind: 'dismiss' }] as never,
        listByTarget: async () => [],
      },
      scoring: weightedScore(WEIGHTS),
    });
    await get('u', { profileId: VIEWER, limit: LIMIT, includeInteracted });
    return excludes[0];
  };

  it('por defecto excluye interactuados; con includeInteracted solo propios', async () => {
    expect(await run()).toEqual(expect.arrayContaining([seen, own]));
    const ex = await run(true);
    expect(ex).toContain(own);
    expect(ex).not.toContain(seen);
  });
});

describe('GetFeed · q y city', () => {
  it('filtra por texto (sin tildes) y ciudad', async () => {
    const search = fakeSearch([
      cand(card(CARD_A, { fullName: 'Café Andino', city: 'cusco' })),
      cand(card(CARD_B, { fullName: 'Cafe Costa', city: 'lima' })),
      cand(card(CARD_C, { fullName: 'Otra', city: 'lima' })),
    ]);
    const r = await feed(search)('u', { profileId: VIEWER, limit: LIMIT, q: 'CAFÉ', city: 'lima' });
    expect(r.ok && r.value.items.map((i) => i.card.handle)).toEqual(['marca2.demo']);
  });

  it('amplía el pool cuando el filtro vacía la página, hasta agotar candidatos', async () => {
    const search = fakeSearch([...noise(INITIAL_POOL), cand(card(1, { city: 'lima' }))]);
    const r = await feed(search)('u', { profileId: VIEWER, limit: LIMIT, city: 'lima' });
    expect(r.ok && r.value.items).toHaveLength(1);
    expect(search.calls).toEqual([INITIAL_POOL, INITIAL_POOL * DOUBLE]);
  });

  it('respeta el tope del pool aunque el filtro no encuentre nada', async () => {
    const search = fakeSearch(noise(MAX_POOL * DOUBLE));
    const r = await feed(search)('u', { profileId: VIEWER, limit: LIMIT, city: 'lima' });
    expect(r.ok && r.value.items).toEqual([]);
    expect(Math.max(...search.calls)).toBe(MAX_POOL);
  });
});
