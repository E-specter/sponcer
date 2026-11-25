// Flujo completo contra Supabase local: todos los ADAPTER_*=real salvo ingestion (mock, sin APIFY_TOKEN).
// Se omite sin SUPABASE_URL. Ejecutar con: cd backend && node --env-file=.env ../node_modules/vitest/vitest.mjs run src/compose.real.test.ts
// Usa datos aislados (dos usuarios y dos perfiles nuevos) y los borra al terminar.
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixtureProfiles } from '@sponcer/contracts/fixtures';
import { loadEnv } from './config/env';
import { composeApp } from './compose';

const OK = 200;
const PASSWORD = 'Sponcer-test-1234';
const PRICE_PEN = 300;
const BUDGET_MIN_PEN = 100;
const BUDGET_MAX_PEN = 5000;
const PAIR = 2;
const SETUP_TIMEOUT_MS = 60_000;
const BACKFILL_TIMEOUT_MS = 120_000;
const POLL_MS = 100;
const POLL_TRIES = 50;
const SEEDED_PROFILES = 30;
const SELLER_SERVICE = {
  type: 'publicacion-patrocinada',
  format: 'post',
  pricePen: PRICE_PEN,
  description: 'Post',
};
const raw = process.env;
const enabled = Boolean(raw.SUPABASE_URL && raw.SUPABASE_SERVICE_ROLE_KEY && raw.SUPABASE_ANON_KEY);

interface Actor {
  userId: string;
  email: string;
  jwt: string;
  handle: string;
  profileId: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!enabled)('flujo real completo (Supabase local)', () => {
  const url = raw.SUPABASE_URL as string;
  // describe.skipIf evalúa el cuerpo igualmente: el cliente se crea en beforeAll.
  let admin: SupabaseClient;
  let app: ReturnType<typeof composeApp>['app'];
  let backfill: ReturnType<typeof composeApp>['backfill'];
  let creator: Actor;
  let brand: Actor;
  let matchId = '';
  const tag = Date.now();

  const as = (a: Actor) => ({ Authorization: `Bearer ${a.jwt}` });
  const until = async (check: () => Promise<boolean>) => {
    await Array.from({ length: POLL_TRIES }).reduce<Promise<boolean>>(
      async (done) => (await done) || ((await check()) ? true : (await sleep(POLL_MS), false)),
      Promise.resolve(false),
    );
  };

  async function newActor(kind: 'creator' | 'brand'): Promise<Actor> {
    const email = `flow-${kind}-${randomUUID()}@sponcer.local`;
    const created = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    const anon = createClient(url, raw.SUPABASE_ANON_KEY as string, {
      auth: { persistSession: false },
    });
    const session = await anon.auth.signInWithPassword({ email, password: PASSWORD });
    const actor = {
      userId: created.data.user!.id,
      email,
      jwt: session.data.session!.access_token,
      handle: `flow.${kind}.${tag}`,
      profileId: '',
    };
    const started = await request(app)
      .post('/api/v1/claims')
      .set(as(actor))
      .send({ handle: actor.handle, role: kind });
    const verified = await request(app)
      .post(`/api/v1/claims/${started.body.claimId}/verify`)
      .set(as(actor));
    expect(verified.body.status).toBe('verified');
    return { ...actor, profileId: verified.body.profileId };
  }

  beforeAll(async () => {
    admin = createClient(url, raw.SUPABASE_SERVICE_ROLE_KEY as string, {
      auth: { persistSession: false },
    });
    const composed = composeApp(
      loadEnv({
        ...raw,
        NODE_ENV: 'test',
        ADAPTER_AUTH: 'real',
        ADAPTER_PROFILES: 'real',
        ADAPTER_CLASSIFICATION: 'real',
        ADAPTER_MATCHING: 'real',
        ADAPTER_QUOTES: 'real',
        ADAPTER_NOTIFICATIONS: 'real',
        ADAPTER_CHAT: 'real',
        ADAPTER_INGESTION: 'mock',
      }),
    );
    app = composed.app;
    backfill = composed.backfill;
    creator = await newActor('creator');
    brand = await newActor('brand');
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    const ids = [creator?.profileId, brand?.profileId].filter(Boolean);
    // matches, messages, quotes, interacciones y clasificación caen en cascada con el perfil.
    if (ids.length) await admin.from('profiles').delete().in('id', ids);
    await Promise.all(
      [creator, brand].filter(Boolean).map((a) => admin.auth.admin.deleteUser(a.userId)), // borra sus notificaciones
    );
    // Notificaciones de otros dueños (cotización/mensaje) que referencian lo creado en este flujo.
    await admin
      .from('notifications')
      .delete()
      .in('payload->>matchId', [matchId || randomUUID()]);
  });

  it('JWT real autentica y uno basura no', async () => {
    const me = await request(app).get('/api/v1/me').set(as(creator));
    expect(me.body.userId).toBe(creator.userId);
    expect(
      (await request(app).get('/api/v1/me').set('Authorization', 'Bearer a.b.c')).status,
    ).not.toBe(OK);
  });

  it(
    'backfill: 30+ perfiles con clasificación y embedding en BD',
    async () => {
      const result = await backfill;
      // Solo el seed: la BD puede tener perfiles de otros tests sin snapshot que fallen legítimamente.
      const seeded = await admin
        .from('profile_classifications')
        .select('profile_id')
        .in(
          'profile_id',
          fixtureProfiles.map((p) => p.id),
        );
      expect(seeded.data).toHaveLength(fixtureProfiles.length);
      expect(result.classified).toBeGreaterThanOrEqual(SEEDED_PROFILES);
      const cls = await admin
        .from('profile_classifications')
        .select('profile_id', { count: 'exact', head: true });
      const emb = await admin
        .from('profile_embeddings')
        .select('profile_id', { count: 'exact', head: true });
      expect(cls.count).toBeGreaterThanOrEqual(SEEDED_PROFILES);
      expect(emb.count).toBeGreaterThanOrEqual(SEEDED_PROFILES);
    },
    BACKFILL_TIMEOUT_MS,
  );

  it(
    'datos declarados -> se clasifica el perfil nuevo',
    async () => {
      const c = await request(app)
        .patch(`/api/v1/profiles/${creator.profileId}/declared`)
        .set(as(creator))
        .send({ role: 'creator', niches: ['moda'] });
      expect(c.status).toBe(OK);
      const b = await request(app)
        .patch(`/api/v1/profiles/${brand.profileId}/declared`)
        .set(as(brand))
        .send({
          role: 'brand',
          sector: 'alimentos-bebidas',
          objectives: ['ventas'],
          targetNiches: ['moda'],
          budgetMinPen: BUDGET_MIN_PEN,
          budgetMaxPen: BUDGET_MAX_PEN,
        });
      expect(b.status).toBe(OK);
      await until(async () => {
        const r = await admin
          .from('profile_embeddings')
          .select('profile_id')
          .in('profile_id', [creator.profileId, brand.profileId]);
        return r.data?.length === PAIR;
      });
      const r = await admin
        .from('profile_embeddings')
        .select('profile_id')
        .in('profile_id', [creator.profileId, brand.profileId]);
      expect(r.data).toHaveLength(PAIR);
    },
    SETUP_TIMEOUT_MS,
  );

  it('feed usa match_candidates: resultados con score y reasons (mide latencia)', async () => {
    const t0 = performance.now();
    const feed = await request(app).get(`/api/v1/feed?profileId=${brand.profileId}`).set(as(brand));
    const ms = Math.round(performance.now() - t0);
    console.info(`latencia feed (real): ${ms} ms, ${feed.body.items?.length} items`);
    expect(feed.status).toBe(OK);
    expect(feed.body.items.length).toBeGreaterThan(0);
    expect(feed.body.items[0]).toMatchObject({
      score: expect.any(Number),
      reasons: expect.any(Array),
    });
  });

  it('interés recíproco -> match en BD y notificación a ambos dueños', async () => {
    const first = await request(app).post('/api/v1/interactions').set(as(creator)).send({
      actorProfileId: creator.profileId,
      targetProfileId: brand.profileId,
      kind: 'interest',
    });
    expect(first.body.matched).toBe(false);
    const second = await request(app).post('/api/v1/interactions').set(as(brand)).send({
      actorProfileId: brand.profileId,
      targetProfileId: creator.profileId,
      kind: 'interest',
    });
    expect(second.body.matched).toBe(true);
    matchId = second.body.matchId;
    const row = await admin
      .from('matches')
      .select('creator_profile_id,brand_profile_id')
      .eq('id', matchId)
      .single();
    expect(row.data).toEqual({
      creator_profile_id: creator.profileId,
      brand_profile_id: brand.profileId,
    });
    await until(async () => {
      const n = await admin
        .from('notifications')
        .select('id')
        .eq('kind', 'match_created')
        .in('user_id', [creator.userId, brand.userId]);
      return n.data?.length === PAIR;
    });
    const lists = await Promise.all(
      [creator, brand].map((a) => request(app).get('/api/v1/notifications').set(as(a))),
    );
    lists.forEach((l) =>
      expect(l.body.items.map((n: { kind: string }) => n.kind)).toContain('match_created'),
    );
  });

  it('sendMessage -> fila en messages y notificación al otro', async () => {
    const sent = await request(app)
      .post(`/api/v1/matches/${matchId}/messages`)
      .set(as(creator))
      .send({ senderProfileId: creator.profileId, body: 'Hola real' });
    expect(sent.status).toBe(OK);
    const rows = await admin.from('messages').select('body').eq('match_id', matchId);
    expect(rows.data).toEqual([{ body: 'Hola real' }]);
    await until(async () => {
      const n = await admin
        .from('notifications')
        .select('id')
        .eq('kind', 'message_received')
        .eq('user_id', brand.userId);
      return (n.data?.length ?? 0) > 0;
    });
    const n = await admin
      .from('notifications')
      .select('id')
      .eq('kind', 'message_received')
      .eq('user_id', brand.userId);
    expect(n.data).toHaveLength(1);
  });

  it('cotización: crear y transicionar -> quote_events y notificación', async () => {
    const put = await request(app)
      .put(`/api/v1/profiles/${creator.profileId}/services`)
      .set(as(creator))
      .send({ services: [SELLER_SERVICE] });
    expect(put.status).toBe(OK);
    const created = await request(app)
      .post('/api/v1/quotes')
      .set(as(brand))
      .send({ requesterProfileId: brand.profileId, serviceId: put.body[0].id, message: 'Hola' });
    expect(created.status).toBe(OK);
    const moved = await request(app)
      .post(`/api/v1/quotes/${created.body.id}/transitions`)
      .set(as(creator))
      .send({ actorProfileId: creator.profileId, to: 'accepted' });
    expect(moved.body.status).toBe('accepted');
    const events = await admin
      .from('quote_events')
      .select('to_status')
      .eq('quote_id', created.body.id)
      .order('seq');
    expect(events.data?.map((e) => e.to_status)).toEqual(['draft', 'sent', 'accepted']);
    await until(async () => {
      const n = await admin
        .from('notifications')
        .select('id')
        .eq('kind', 'quote_status_changed')
        .eq('user_id', brand.userId);
      return (n.data?.length ?? 0) > 0;
    });
    const n = await admin
      .from('notifications')
      .select('id')
      .eq('kind', 'quote_status_changed')
      .eq('user_id', brand.userId);
    expect(n.data?.length).toBeGreaterThan(0);
  });
});
