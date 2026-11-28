import { describe, expect, it } from 'vitest';
import type { ProfileCard } from '@sponcer/contracts';
import { createInMemoryProfileViewRepository } from '../../infrastructure/out/mock/mock-adapters';
import type { Interaction, MatchRecord } from '../../domain/candidate';
import { makeGetVisibilitySummary, makeListVisibility } from './visibility';

const ME = 'me';
const TWO = 2;
const PAGE = 20;
const BIG = 5;
const NOW = new Date('2026-11-27T12:00:00Z');
const card = (id: string) => ({ id, role: 'brand', handle: id }) as unknown as ProfileCard;
const interest = (actor: string, createdAt: string): Interaction => ({
  id: actor,
  actorProfileId: actor,
  targetProfileId: ME,
  kind: 'interest',
  createdAt,
});

async function setup(removed: string[] = []) {
  const received = [
    interest('recent', '2026-11-25T10:00:00Z'),
    interest('old', '2026-11-05T10:00:00Z'),
    interest('ancient', '2026-09-01T10:00:00Z'),
    interest('matched', '2026-11-25T10:00:00Z'),
    interest('gone', '2026-11-25T10:00:00Z'),
  ];
  const matches: MatchRecord[] = [
    { id: 'm', creatorProfileId: ME, brandProfileId: 'matched', createdAt: '2026-11-26T10:00:00Z' },
  ];
  const views = createInMemoryProfileViewRepository();
  const deps = {
    profiles: {
      isOwner: async (id: string) => id === ME,
      getOwnerUserId: async () => null,
      getCards: async (ids: string[]) => ids.filter((i) => !removed.includes(i)).map(card),
    },
    interactions: {
      upsert: async () => undefined,
      find: async () => null,
      listByActor: async () => [],
      listByTarget: async () => received,
    },
    matches: {
      createIfAbsent: async () => {
        throw new Error('no se usa');
      },
      getById: async () => null,
      listByProfile: async () => matches,
    },
    views,
    isAdmin: async () => false,
    now: () => NOW,
  };
  return { deps, views };
}

describe('visibilidad: intereses y visitas', () => {
  it('cuenta 7d/30d, excluye match, fuera de ventana y perfiles removidos', async () => {
    const { deps, views } = await setup(['gone']);
    await views.recordOnce('v1', ME, '2026-11-26', '2026-11-26T09:00:00Z');
    await views.recordOnce('v1', ME, '2026-11-10', '2026-11-10T09:00:00Z');
    await views.recordOnce('v2', ME, '2026-11-01', '2026-11-01T09:00:00Z');
    await views.recordOnce('v3', ME, '2026-09-01', '2026-09-01T09:00:00Z');
    const r = await makeGetVisibilitySummary(deps)('u', { profileId: ME });
    expect(r).toEqual({
      ok: true,
      value: { interests7d: 1, interests30d: TWO, views7d: 1, views30d: TWO },
    });
    const list = await makeListVisibility(deps)('u', { profileId: ME, kind: 'view', limit: PAGE });
    expect(list.ok && list.value.items.map((i) => [i.profile.id, i.count])).toEqual([
      ['v1', TWO],
      ['v2', 1],
    ]);
  });

  it('pagina con cursor y rechaza cursor corrupto', async () => {
    const { deps } = await setup();
    const list = makeListVisibility(deps);
    const first = await list('u', { profileId: ME, kind: 'interest', limit: 1 });
    expect(first.ok && first.value.items.map((i) => i.profile.id)).toEqual(['gone']);
    const next = first.ok ? (first.value.nextCursor ?? undefined) : undefined;
    const second = await list('u', { profileId: ME, kind: 'interest', limit: BIG, cursor: next });
    expect(second.ok && second.value.items.map((i) => i.profile.id)).toEqual(['recent', 'old']);
    expect(second.ok && second.value.nextCursor).toBeNull();
    const bad = await list('u', { profileId: ME, kind: 'interest', limit: 1, cursor: '%%%' });
    expect(!bad.ok && bad.error.code).toBe('VALIDATION_ERROR');
  });

  it('solo el dueño: FORBIDDEN', async () => {
    const { deps } = await setup();
    const r = await makeGetVisibilitySummary(deps)('u', { profileId: 'otro' });
    expect(!r.ok && r.error.code).toBe('FORBIDDEN');
  });

  it('registrar es idempotente por día', async () => {
    const { views } = await setup();
    expect(await views.recordOnce('a', 'b', '2026-11-27', 'x')).toBe(true);
    expect(await views.recordOnce('a', 'b', '2026-11-27', 'y')).toBe(false);
    expect(await views.recordOnce('a', 'b', '2026-11-28', 'z')).toBe(true);
  });
});
