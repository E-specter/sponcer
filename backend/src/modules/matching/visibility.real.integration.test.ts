// Adaptador real de profile_views contra Supabase local. Se omite sin SUPABASE_URL o sin la migración de ADR-009.
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSupabaseProfileViewRepository } from './infrastructure/out/supabase/supabase-repositories';

const SUFFIX_LENGTH = 8;
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!url || !key)('profile_views real (Supabase local)', () => {
  const db = createClient(url ?? 'http://unused', key ?? 'unused', {
    auth: { persistSession: false },
  });
  const suffix = randomUUID().slice(0, SUFFIX_LENGTH);
  const mk = (role: string, n: string) => ({
    id: randomUUID(),
    role,
    ig_handle: `it_view_${n}_${suffix}.demo`,
    status: 'unclaimed',
  });
  const [viewer, viewed] = [mk('brand', 'a'), mk('creator', 'b')];
  let tableExists = false;
  const cleanup = () => db.from('profiles').delete().like('ig_handle', 'it\\_view\\_%');

  beforeAll(async () => {
    tableExists = !(await db.from('profile_views').select('viewed_on').limit(1)).error;
    if (!tableExists) return;
    await cleanup();
    const ins = await db.from('profiles').insert([viewer, viewed]);
    if (ins.error) throw new Error(ins.error.message);
  });
  afterAll(async () => {
    if (tableExists) await cleanup();
  });

  it('una visita por día: la repetida no inserta; listSince filtra por fecha', async (ctx) => {
    if (!tableExists) return ctx.skip();
    const repo = createSupabaseProfileViewRepository(db);
    expect(await repo.recordOnce(viewer.id, viewed.id, '2026-11-26', '2026-11-26T10:00:00Z')).toBe(
      true,
    );
    expect(await repo.recordOnce(viewer.id, viewed.id, '2026-11-26', '2026-11-26T11:00:00Z')).toBe(
      false,
    );
    expect(await repo.recordOnce(viewer.id, viewed.id, '2026-11-01', '2026-11-01T10:00:00Z')).toBe(
      true,
    );
    const rows = await repo.listSince(viewed.id, '2026-11-20');
    expect(rows.map((r) => [r.viewerProfileId, r.viewedOn, r.count])).toEqual([
      [viewer.id, '2026-11-26', 1],
    ]);
  });
});
