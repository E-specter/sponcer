import { describe, expect, it } from 'vitest';
import type { ProfileCard } from '@sponcer/contracts';
import type { MatchRecord } from '../../domain/candidate';
import { makeListMatches } from './list-matches';

const TOTAL = 5;
const LIMIT = 2;
const ID_WIDTH = 12;
const MATCH_OFFSET = 100;
const BRAND_OFFSET = 10;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(ID_WIDTH, '0')}`;
const ME = uuid(1);
const card = (id: string) =>
  ({
    id,
    handle: `h${id.slice(-3)}`,
    role: 'brand',
    fullName: id,
    niches: [],
  }) as unknown as ProfileCard;

const records: MatchRecord[] = Array.from({ length: TOTAL }, (_, i) => ({
  id: uuid(MATCH_OFFSET + i),
  creatorProfileId: ME,
  brandProfileId: uuid(BRAND_OFFSET + i),
  createdAt: `2026-01-0${i + 1}T10:00:00.000Z`,
}));

const list = makeListMatches({
  profiles: { isOwner: async () => true, getCards: async (ids) => [...new Set(ids)].map(card) },
  matches: {
    listByProfile: async () => records,
    getById: async () => null,
    createIfAbsent: async () => {
      throw new Error('no se usa');
    },
  },
});

const cursorOf = (r: Awaited<ReturnType<typeof list>>) =>
  r.ok ? (r.value.nextCursor ?? undefined) : undefined;

describe('ListMatches paginado', () => {
  it('más reciente primero, sin repetir ni perder entre páginas', async () => {
    const first = await list('u', { profileId: ME, limit: LIMIT });
    const second = await list('u', { profileId: ME, limit: LIMIT, cursor: cursorOf(first) });
    const third = await list('u', { profileId: ME, limit: LIMIT, cursor: cursorOf(second) });
    const ids = [first, second, third].flatMap((r) => (r.ok ? r.value.items.map((m) => m.id) : []));
    expect(ids).toEqual([...records].reverse().map((m) => m.id));
    expect(third.ok && third.value.nextCursor).toBeNull();
  });

  it('un cursor corrupto es VALIDATION_ERROR', async () => {
    const r = await list('u', { profileId: ME, limit: LIMIT, cursor: 'no-es-un-numero' });
    expect(!r.ok && r.error.code).toBe('VALIDATION_ERROR');
  });
});
