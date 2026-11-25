import { describe, expect, it } from 'vitest';
import {
  createInMemoryInteractionRepository,
  createInMemoryMatchRepository,
} from './mock-adapters';

const [ID1, ID2, ACTOR, TARGET, OTHER] = ['i1', 'i2', 'actor', 'target', 'otro'];
const NOW = '2026-01-01T10:00:00.000Z';

describe('mocks coherentes con la BD ante ids duplicados', () => {
  it('interactions: el mismo par se reemplaza (upsert); el mismo id en otro par viola la PK', async () => {
    const repo = createInMemoryInteractionRepository();
    const base = {
      id: ID1,
      actorProfileId: ACTOR,
      targetProfileId: TARGET,
      createdAt: NOW,
    };
    await repo.upsert({ ...base, kind: 'interest' });
    await repo.upsert({ ...base, id: ID2, kind: 'dismiss' });
    expect((await repo.find(ACTOR, TARGET))?.kind).toBe('dismiss');
    await expect(
      repo.upsert({ ...base, id: ID2, targetProfileId: OTHER, kind: 'interest' }),
    ).rejects.toThrow('id duplicado');
  });

  it('matches: el par repetido devuelve el existente; el mismo id en otro par viola la PK', async () => {
    const repo = createInMemoryMatchRepository();
    const m = { id: ID1, creatorProfileId: ACTOR, brandProfileId: TARGET, createdAt: NOW };
    expect((await repo.createIfAbsent(m)).created).toBe(true);
    const again = await repo.createIfAbsent({ ...m, id: ID2 });
    expect(again).toMatchObject({ created: false, match: { id: ID1 } });
    await expect(repo.createIfAbsent({ ...m, brandProfileId: OTHER })).rejects.toThrow(
      'id duplicado',
    );
  });
});
