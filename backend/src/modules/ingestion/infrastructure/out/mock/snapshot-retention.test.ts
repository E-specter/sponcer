import { describe, expect, it } from 'vitest';
import { SNAPSHOT_RETENTION } from '../../../domain/snapshot-freshness';
import { createInMemorySnapshotRepository, genericSnapshot } from './mock-adapters';

const SAVES = 6;
const MS_PER_HOUR = 3_600_000;

describe('retención de snapshots (mock)', () => {
  it('prune conserva solo los N más recientes por fetchedAt', async () => {
    const repo = createInMemorySnapshotRepository();
    const start = new Date('2026-01-01T00:00:00Z');
    const times = Array.from(
      { length: SAVES },
      (_, i) => new Date(start.getTime() + i * MS_PER_HOUR),
    );
    await Promise.all(times.map((t) => repo.save(genericSnapshot('nuevo.demo', t))));
    expect(repo.count('nuevo.demo')).toBe(SAVES);
    await repo.prune('nuevo.demo', SNAPSHOT_RETENTION);
    expect(repo.count('nuevo.demo')).toBe(SNAPSHOT_RETENTION);
    const latest = await repo.latestByHandle('nuevo.demo');
    expect(latest?.snapshot.fetchedAt).toBe(times.at(-1)!.toISOString());
  });
});
