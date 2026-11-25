// Poda real de ig_snapshots. Se omite sin SUPABASE_URL.
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'vitest';
import { genericSnapshot } from '../mock/mock-adapters';
import { SNAPSHOT_RETENTION } from '../../../domain/snapshot-freshness';
import { createSupabaseSnapshotRepository } from './supabase-repositories';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SAVES = 5;
const SUFFIX_LENGTH = 8;
const MS_PER_HOUR = 3_600_000;

describe.skipIf(!url || !key)('retención de snapshots (Supabase local)', () => {
  const db = createClient(url ?? 'http://unused', key ?? 'unused', {
    auth: { persistSession: false },
  });
  const handle = `it_snap_${randomUUID().slice(0, SUFFIX_LENGTH)}.demo`;
  afterAll(async () => void (await db.from('ig_snapshots').delete().eq('ig_handle', handle)));

  it('prune deja los N más recientes', async () => {
    const repo = createSupabaseSnapshotRepository(db);
    const start = new Date('2026-01-01T00:00:00Z');
    const times = Array.from(
      { length: SAVES },
      (_, i) => new Date(start.getTime() + i * MS_PER_HOUR),
    );
    await Promise.all(times.map((t) => repo.save(genericSnapshot(handle, t))));
    await repo.prune(handle, SNAPSHOT_RETENTION);
    const { data } = await db
      .from('ig_snapshots')
      .select('fetched_at')
      .eq('ig_handle', handle)
      .order('fetched_at');
    expect(data).toHaveLength(SNAPSHOT_RETENTION);
    expect(new Date(data![0]!.fetched_at).toISOString()).toBe(
      times[SAVES - SNAPSHOT_RETENTION]!.toISOString(),
    );
  });
});
