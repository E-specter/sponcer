// Integración contra Supabase local: backfill + feed (RPC match_candidates) + interés recíproco.
// Se omite sin SUPABASE_URL. Datos propios (perfiles de prueba) que se borran al final (ON DELETE CASCADE).
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FeedItem, type Declared } from '@sponcer/contracts';
import { demoUser } from '@sponcer/contracts/fixtures';
import { createApp } from '../../app';
import { loadEnv } from '../../config/env';
import { createEventBus } from '../../shared/events/event-bus';
import { createAuthModule } from '../auth';
import { createClassificationModule } from '../classification';
import { createMockEmbeddingProvider } from '../classification/infrastructure/out/mock/mock-adapters';
import { createIngestionModule } from '../ingestion';
import { createProfilesModule } from '../profiles';
import { createMatchingModule } from './matching.module';

const OK = 200;
const AUTH = { Authorization: `Bearer mock:${demoUser.id}` };
const TIMEOUT_MS = 60_000;
const BUDGET_MIN = 100;
const BUDGET_MAX = 1000;
const SUFFIX_LENGTH = 8;
const TEST_PROFILES = 2;

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!url || !key)('matching real (Supabase local)', () => {
  const db = createClient(url ?? 'http://unused', key ?? 'unused', {
    auth: { persistSession: false },
  });
  const suffix = randomUUID().slice(0, SUFFIX_LENGTH);
  const creator = { id: randomUUID(), handle: `it_creator_${suffix}.demo`, role: 'creator' };
  const brand = { id: randomUUID(), handle: `it_brand_${suffix}.demo`, role: 'brand' };
  const creatorDeclared: Declared = { role: 'creator', niches: ['moda'], accountType: 'creator' };
  const brandDeclared: Declared = {
    role: 'brand',
    sector: 'moda-retail',
    objectives: ['reconocimiento'],
    targetNiches: ['moda'],
    budgetMinPen: BUDGET_MIN,
    budgetMaxPen: BUDGET_MAX,
    accountType: 'business',
  };
  let app: ReturnType<typeof createApp>;
  let embeddingOf: (id: string) => Promise<number[] | null>;

  // Perfiles de prueba `it_*` (el `_` se escapa en LIKE); dependientes caen por ON DELETE CASCADE.
  const cleanup = () => db.from('profiles').delete().like('ig_handle', 'it\\_%');

  beforeAll(async () => {
    await cleanup();
    const rows = [
      {
        ...creator,
        ig_handle: creator.handle,
        status: 'verified',
        owner_user_id: demoUser.id,
        declared: creatorDeclared,
      },
      {
        ...brand,
        ig_handle: brand.handle,
        status: 'verified',
        owner_user_id: demoUser.id,
        declared: brandDeclared,
      },
    ].map(({ id, role, ig_handle, status, owner_user_id, declared }) => ({
      id,
      role,
      ig_handle,
      status,
      owner_user_id,
      declared,
    }));
    const ins = await db.from('profiles').insert(rows);
    if (ins.error) throw new Error(ins.error.message);

    const env = loadEnv({});
    const bus = createEventBus();
    const profiles = createProfilesModule({ adapter: 'real', bus, supabase: db });
    const ingestion = createIngestionModule({ adapter: 'mock', bus });
    const classification = createClassificationModule({
      adapter: 'real',
      bus,
      supabase: db,
      profiles: profiles.api,
      snapshots: ingestion.api,
      embeddings: createMockEmbeddingProvider(), // el modelo e5 se valida aparte (evaluate-niches)
    });
    embeddingOf = classification.api.getEmbedding;
    const backfill = await classification.api.classifyAll();
    expect(backfill.classified).toBeGreaterThanOrEqual(TEST_PROFILES);
    const matching = createMatchingModule({
      adapter: 'real',
      bus,
      supabase: db,
      profiles: profiles.api,
      classification: classification.api,
      weights: env.MATCH_WEIGHTS,
    });
    const auth = createAuthModule({ adapter: 'mock', bus, profiles: profiles.api });
    app = createApp({ env, authMiddleware: auth.middleware, routers: [matching.router] });
  }, TIMEOUT_MS);

  afterAll(async () => {
    await cleanup();
  });

  it('el feed del creador trae marcas ordenadas por score, sin el propio perfil', async () => {
    const started = performance.now();
    const res = await request(app).get('/api/v1/feed').query({ profileId: creator.id }).set(AUTH);
    console.log(`feed real: ${(performance.now() - started).toFixed(0)} ms`);
    expect(res.status).toBe(OK);
    const items = FeedItem.array().parse(res.body.items);
    // Referencia "antes": una consulta de embedding por candidato (lo que hacía la búsqueda previa).
    const legacy = performance.now();
    await Promise.all(items.map((i) => embeddingOf(i.card.id)));
    console.log(
      `costo extra del esquema anterior (${items.length} consultas): ${(performance.now() - legacy).toFixed(0)} ms`,
    );
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.card.role === 'brand')).toBe(true);
    expect(items.map((i) => i.score)).toEqual([...items.map((i) => i.score)].sort((a, b) => b - a));
  });

  it('un candidato sin embedding aparece igual (similitud 0), como en el mock, y q lo encuentra por handle', async () => {
    const lonely = { id: randomUUID(), handle: `it_nobed_${suffix}.demo` };
    const ins = await db.from('profiles').insert({
      id: lonely.id,
      role: 'brand',
      ig_handle: lonely.handle,
      status: 'unclaimed', // sin dueño: si fuera del demo, el feed lo excluiría como perfil propio
      owner_user_id: null,
      declared: null,
    });
    expect(ins.error).toBeNull();
    const res = await request(app)
      .get('/api/v1/feed')
      .query({ profileId: creator.id, q: lonely.handle })
      .set(AUTH);
    const items = FeedItem.array().parse(res.body.items);
    expect(items.map((i) => i.card.id)).toEqual([lonely.id]);
    expect(items[0]?.reasons).not.toContain('similarity');
  });

  it('interés recíproco crea un solo match, aunque se repita', async () => {
    const send = (actor: string, target: string) =>
      request(app)
        .post('/api/v1/interactions')
        .set(AUTH)
        .send({ actorProfileId: actor, targetProfileId: target, kind: 'interest' });
    const first = await send(creator.id, brand.id);
    expect(first.body).toMatchObject({ matched: false });
    const second = await send(brand.id, creator.id);
    expect(second.body).toMatchObject({ matched: true });
    const again = await send(brand.id, creator.id);
    expect(again.body.matchId).toBe(second.body.matchId);
    const { count } = await db
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .eq('creator_profile_id', creator.id)
      .eq('brand_profile_id', brand.id);
    expect(count).toBe(1);
    const { count: interactions } = await db
      .from('interactions')
      .select('id', { count: 'exact', head: true })
      .eq('actor_profile_id', creator.id);
    expect(interactions).toBe(1);
  });
});
