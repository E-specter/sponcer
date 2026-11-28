import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { FeedItem, InteractionResult, Match, type DomainEvent } from '@sponcer/contracts';
import {
  demoInfluencer,
  demoUser,
  fixtureProfiles,
  fixtureSocial,
} from '@sponcer/contracts/fixtures';
import { createApp } from '../../app';
import { loadEnv } from '../../config/env';
import { createEventBus } from '../../shared/events/event-bus';
import { createAuthModule } from '../auth';
import { createClassificationModule } from '../classification';
import { createIngestionModule } from '../ingestion';
import { createProfilesModule } from '../profiles';
import { createMatchingModule } from './matching.module';

const OK = 200;
const FORBIDDEN = 403;
const AUTH = { Authorization: `Bearer mock:${demoUser.id}` };
const AUTH_INF = { Authorization: `Bearer mock:${demoInfluencer.id}` };
const idOf = (handle: string) => fixtureProfiles.find((p) => p.snapshot.handle === handle)!.id;

const DEMO_CREATOR = idOf('sofi.moda.demo');
const DEMO_BRAND = idOf('andina.snacks.demo');
/** Ya expresó interés en la marca demo (fixtureSocial). */
const INTERESTED_CREATOR = idOf('diego.belleza.demo');
const FOREIGN_CREATOR = idOf('mateo.deportes.demo');
const PAGE = 5;
const MAX_REASONS = 2;

async function setup() {
  const env = loadEnv({});
  const bus = createEventBus();
  const created: DomainEvent[] = [];
  bus.subscribe('MatchCreated', (e) => void created.push(e));
  const profiles = createProfilesModule({ adapter: 'mock', bus });
  const ingestion = createIngestionModule({ adapter: 'mock', bus });
  const classification = createClassificationModule({
    adapter: 'mock',
    bus,
    profiles: profiles.api,
    snapshots: ingestion.api,
  });
  await classification.api.classifyAll();
  const matching = createMatchingModule({
    adapter: 'mock',
    bus,
    profiles: profiles.api,
    classification: classification.api,
    weights: env.MATCH_WEIGHTS,
  });
  const auth = createAuthModule({ adapter: 'mock', bus, profiles: profiles.api });
  const app = createApp({ env, authMiddleware: auth.middleware, routers: [matching.router] });
  return { app, matching, created };
}

describe('feed', () => {
  it('ordena por score, excluye propios e interés ya expresado y trae 2 razones', async () => {
    const { app } = await setup();
    const res = await request(app)
      .get('/api/v1/feed')
      .query({ profileId: DEMO_CREATOR })
      .set(AUTH_INF);
    expect(res.status).toBe(OK);
    const items = FeedItem.array().parse(res.body.items);
    const ids = items.map((i) => i.card.id);
    expect(items.every((i) => i.card.role === 'brand')).toBe(true);
    expect(ids).not.toContain(idOf('rumbo.viajes.demo')); // ya hay match/interés
    expect(items.map((i) => i.score)).toEqual([...items.map((i) => i.score)].sort((a, b) => b - a));
    expect(items.every((i) => i.reasons.length <= MAX_REASONS)).toBe(true);
  });

  it('pagina por cursor sin repetir ni perder', async () => {
    const { app } = await setup();
    const get = (cursor?: string) =>
      request(app)
        .get('/api/v1/feed')
        .query({ profileId: DEMO_BRAND, limit: PAGE, cursor })
        .set(AUTH);
    const all = await get().then((r) => r.body);
    const second = await get(all.nextCursor).then((r) => r.body);
    const full = await request(app).get('/api/v1/feed').query({ profileId: DEMO_BRAND }).set(AUTH);
    const ids = [...all.items, ...second.items].map((i: { card: { id: string } }) => i.card.id);
    expect(ids).toEqual(
      full.body.items.slice(0, ids.length).map((i: { card: { id: string } }) => i.card.id),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('aplica filtros (nicho) y rechaza perfiles ajenos', async () => {
    const { app } = await setup();
    const filtered = await request(app)
      .get('/api/v1/feed')
      .query({ profileId: DEMO_CREATOR, niches: 'tecnologia' })
      .set(AUTH_INF);
    expect(
      filtered.body.items.every((i: { card: { niches: string[] } }) =>
        i.card.niches.includes('tecnologia'),
      ),
    ).toBe(true);
    const foreign = await request(app)
      .get('/api/v1/feed')
      .query({ profileId: FOREIGN_CREATOR })
      .set(AUTH_INF);
    expect(foreign.status).toBe(FORBIDDEN);
  });
});

describe('interacciones y matches', () => {
  it('interés mutuo crea un solo match y publica MatchCreated una vez', async () => {
    const { app, created } = await setup();
    const express = () =>
      request(app).post('/api/v1/interactions').set(AUTH).send({
        actorProfileId: DEMO_BRAND,
        targetProfileId: INTERESTED_CREATOR,
        kind: 'interest',
      });
    const [first, second] = [await express(), await express()];
    const a = InteractionResult.parse(first.body);
    const b = InteractionResult.parse(second.body);
    expect(a.matched).toBe(true);
    expect(b).toEqual(a);
    expect(created).toHaveLength(1);

    const list = await request(app)
      .get('/api/v1/matches')
      .query({ profileId: DEMO_BRAND })
      .set(AUTH);
    const matches = Match.array().parse(list.body.items);
    expect(matches.filter((m) => m.creator.id === INTERESTED_CREATOR)).toHaveLength(1);
  });

  it('interés sin reciprocidad no crea match; descartar saca al perfil del feed', async () => {
    const { app, created } = await setup();
    const target = idOf('pata.feliz.demo');
    const send = (kind: 'interest' | 'dismiss', t: string) =>
      request(app)
        .post('/api/v1/interactions')
        .set(AUTH_INF)
        .send({ actorProfileId: DEMO_CREATOR, targetProfileId: t, kind });
    expect((await send('interest', target)).body).toEqual({ matched: false, matchId: null });
    const dismissed = idOf('sabor.costa.demo');
    await send('dismiss', dismissed);
    const feed = await request(app)
      .get('/api/v1/feed')
      .query({ profileId: DEMO_CREATOR })
      .set(AUTH_INF);
    const ids = feed.body.items.map((i: { card: { id: string } }) => i.card.id);
    expect(ids).not.toContain(target);
    expect(ids).not.toContain(dismissed);
    expect(created).toHaveLength(0);
  });

  it('actuar con un perfil ajeno: FORBIDDEN', async () => {
    const { app } = await setup();
    const res = await request(app)
      .post('/api/v1/interactions')
      .set(AUTH)
      .send({ actorProfileId: FOREIGN_CREATOR, targetProfileId: DEMO_BRAND, kind: 'interest' });
    expect(res.status).toBe(FORBIDDEN);
  });

  it('MatchingApi: getMatch e isParticipant', async () => {
    const { matching } = await setup();
    const seeded = fixtureSocial.matches[0]!;
    expect((await matching.api.getMatch(seeded.id))?.brandProfileId).toBe(seeded.brandProfileId);
    expect(await matching.api.isParticipant(seeded.id, demoInfluencer.id)).toBe(true); // dueña del creador
    expect(await matching.api.isParticipant(seeded.id, 'otro-usuario')).toBe(false);
    expect(await matching.api.isParticipant('no-existe', demoUser.id)).toBe(false);
  });
});
