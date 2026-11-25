import { constants } from 'node:http2';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { demoUser, fixtureProfiles } from '@sponcer/contracts/fixtures';
import { composeApp } from './compose';
import { loadEnv } from './config/env';

const OK = constants.HTTP_STATUS_OK;
const CREATED_RANGE = 299;
const NEW_HANDLE = 'nuevo.smoke.demo';

const byHandle = (h: string) => fixtureProfiles.find((p) => p.snapshot.handle === h)!;
const creator = byHandle('sofi.moda.demo'); // del usuario demo
const brand = byHandle('kallpa.sport.demo'); // de otro usuario
const brandOwner = brand.ownerUserId!;
const demoBrand = fixtureProfiles.find((p) => p.role === 'brand' && p.ownerUserId === demoUser.id)!;

describe('composeApp (humo de integración, modo mock)', () => {
  let app: ReturnType<typeof composeApp>['app'];
  const as = (userId: string) => ({ Authorization: `Bearer mock:${userId}` });
  const get = (path: string, userId = demoUser.id) => request(app).get(path).set(as(userId));
  const post = (path: string, body: object, userId = demoUser.id) =>
    request(app).post(path).set(as(userId)).send(body);

  beforeAll(async () => {
    const composed = composeApp(loadEnv({}));
    app = composed.app;
    const r = await composed.backfill;
    expect(r.classified).toBeGreaterThan(0);
  });

  it('health y me', async () => {
    expect((await request(app).get('/api/v1/health')).status).toBe(OK);
    const me = await get('/api/v1/me');
    expect(me.status).toBe(OK);
    expect(me.body.userId).toBe(demoUser.id);
  });

  it('getProfile trae la clasificación real del pipeline', async () => {
    const res = await get(`/api/v1/profiles/${creator.snapshot.handle}`);
    expect(res.status).toBe(OK);
    expect(res.body.classification.niches.length).toBeGreaterThan(0);
  });

  it('feed del creador y de la marca demo', async () => {
    const f1 = await get(`/api/v1/feed?profileId=${creator.id}`);
    expect(f1.status).toBe(OK);
    expect(f1.body.items.length).toBeGreaterThan(0);
    const f2 = await get(`/api/v1/feed?profileId=${demoBrand.id}`);
    expect(f2.status).toBe(OK);
    expect(f2.body.items.length).toBeGreaterThan(0);
  });

  it('interés recíproco -> match -> chat -> notificación', async () => {
    const first = await post('/api/v1/interactions', {
      actorProfileId: creator.id,
      targetProfileId: brand.id,
      kind: 'interest',
    });
    // Los fixtures pueden traer ya el interés de la otra parte: el match llega en la 1.ª o en la 2.ª interacción.
    const result = first.body.matched
      ? first
      : await post(
          '/api/v1/interactions',
          { actorProfileId: brand.id, targetProfileId: creator.id, kind: 'interest' },
          brandOwner,
        );
    expect(result.body.matched).toBe(true);
    const matchId = result.body.matchId as string;

    const matches = await get(`/api/v1/matches?profileId=${creator.id}`);
    expect(matches.body.items.map((m: { id: string }) => m.id)).toContain(matchId);

    const sent = await post(`/api/v1/matches/${matchId}/messages`, {
      senderProfileId: creator.id,
      body: 'Hola',
    });
    expect(sent.status).toBe(OK);
    const list = await get(`/api/v1/matches/${matchId}/messages`);
    expect(list.body.items.map((m: { body: string }) => m.body)).toContain('Hola');

    const notes = await get('/api/v1/notifications', brandOwner);
    const kinds = notes.body.items.map((n: { kind: string }) => n.kind);
    expect(kinds).toContain('match_created');
    expect(kinds).toContain('message_received');
  });

  it('cotización: crear y transicionar', async () => {
    const service = byHandle('sofi.moda.demo').services[0]!;
    const created = await post(
      '/api/v1/quotes',
      {
        requesterProfileId: brand.id,
        serviceId: service.id,
        message: 'Quiero cotizar',
      },
      brandOwner,
    );
    expect(created.status).toBeLessThanOrEqual(CREATED_RANGE);
    const moved = await post(`/api/v1/quotes/${created.body.id}/transitions`, {
      actorProfileId: creator.id,
      to: 'accepted',
    });
    expect(moved.body.status).toBe('accepted');
  });

  it('reclamo de un handle nuevo -> verified', async () => {
    const started = await post('/api/v1/claims', { handle: NEW_HANDLE, role: 'creator' });
    expect(started.status).toBeLessThanOrEqual(CREATED_RANGE);
    const verified = await post(`/api/v1/claims/${started.body.claimId}/verify`, {});
    expect(verified.body.status).toBe('verified');
  });
});
