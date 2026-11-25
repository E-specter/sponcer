import { describe, expect, it } from 'vitest';
import { createProfilesMockAdapters } from '../../infrastructure/out/mock/mock-adapters';
import { createEventBus } from '../../../../shared/events/event-bus';
import { makeRequestRemoval } from './request-removal';

const setup = () => {
  const a = createProfilesMockAdapters();
  const bus = createEventBus();
  const removed: string[] = [];
  bus.subscribe('ProfileRemoved', (e) => void removed.push(e.igHandle));
  const run = makeRequestRemoval({
    reader: a.profiles,
    writer: a.profiles,
    requests: a.removals,
    bus,
    now: () => new Date(),
  });
  return { a, run, removed };
};

describe('requestRemoval', () => {
  it('anónimo: queda pending y la ficha sigue visible', async () => {
    const { a, run } = setup();
    const p = (await a.profiles.listByRole('creator')).find((x) => x.ownerUserId)!;
    expect((await run(p.handle, 'a@b.pe', undefined, null)).ok).toBe(true);
    expect((await a.profiles.findById(p.id))?.status).toBe('verified');
    expect(a.removals.all().at(-1)?.status).toBe('pending');
  });

  it('dueño verificado autenticado: removed al instante', async () => {
    const { a, run, removed } = setup();
    const p = (await a.profiles.listByRole('creator')).find(
      (x) => x.ownerUserId && x.status === 'verified',
    )!;
    await run(p.handle, 'a@b.pe', undefined, p.ownerUserId);
    expect(removed).toEqual([p.handle]);
    expect((await a.profiles.findById(p.id))?.status).toBe('removed');
    expect(a.removals.all().at(-1)?.status).toBe('applied');
  });
});
