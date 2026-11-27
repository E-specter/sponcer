import { describe, expect, it } from 'vitest';
import type { Interaction } from './candidate';
import { canRecordView, dayOf, daysAgo, groupViews, pendingInterests } from './visibility';

const it1 = (actor: string, kind: Interaction['kind'], target = 'me'): Interaction => ({
  id: `${actor}${kind}${target}`,
  actorProfileId: actor,
  targetProfileId: target,
  kind,
  createdAt: '2026-11-20T10:00:00.000Z',
});

describe('pendingInterests', () => {
  it('excluye al actor con match y al que yo descarté; marca reciprocated si ya le di interés', () => {
    const received = [
      it1('a', 'interest'),
      it1('b', 'interest'),
      it1('c', 'interest'),
      it1('d', 'dismiss'),
      it1('e', 'interest'),
    ];
    const mine = [it1('me', 'dismiss', 'c'), it1('me', 'interest', 'e')];
    const r = pendingInterests(received, mine, new Set(['b']));
    expect(r.map((x) => [x.actorProfileId, x.reciprocated])).toEqual([
      ['a', false],
      ['e', true],
    ]);
  });
});

describe('canRecordView', () => {
  const base = {
    viewer: { id: 'v', role: 'brand' },
    viewed: { id: 'x', role: 'creator' },
    viewerIsOwnedByUser: true,
    viewedOwnerUserId: 'other',
    userId: 'u',
    isAdmin: false,
  };
  it('acepta el caso normal', () => expect(canRecordView(base)).toBe(true));
  it.each([
    ['admin', { isAdmin: true }],
    ['viewer ajeno', { viewerIsOwnedByUser: false }],
    ['mismo tipo', { viewed: { id: 'x', role: 'brand' } }],
    ['ficha sin dueño', { viewedOwnerUserId: null }],
    ['ficha propia (mismo dueño)', { viewedOwnerUserId: 'u' }],
    ['mismo perfil', { viewed: { id: 'v', role: 'creator' } }],
  ])('rechaza: %s', (_n, patch) => expect(canRecordView({ ...base, ...patch })).toBe(false));
});

const TWO = 2;
const WEEK = 7;
describe('groupViews', () => {
  it('suma visitas por visitante, conserva la última y marca los 7 días', () => {
    const g = groupViews(
      [
        { viewerProfileId: 'a', viewedOn: '2026-11-01', count: 1, lastAt: '2026-11-01T10:00:00Z' },
        { viewerProfileId: 'a', viewedOn: '2026-11-26', count: 1, lastAt: '2026-11-26T10:00:00Z' },
        { viewerProfileId: 'b', viewedOn: '2026-11-05', count: 1, lastAt: '2026-11-05T10:00:00Z' },
      ],
      '2026-11-20',
    );
    expect(g.get('a')).toEqual({ at: '2026-11-26T10:00:00Z', count: TWO, inShort: true });
    expect(g.get('b')?.inShort).toBe(false);
  });
});

describe('fechas', () => {
  it('dayOf y daysAgo trabajan en UTC', () => {
    expect(dayOf(daysAgo(new Date('2026-11-27T01:00:00Z'), WEEK))).toBe('2026-11-20');
  });
});
