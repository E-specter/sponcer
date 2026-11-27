import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { VisibilityItem, VisibilitySummary } from '@sponcer/contracts';
import { demoInfluencer, demoUser, fixtureProfiles } from '@sponcer/contracts/fixtures';
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
const COMPANY = { Authorization: `Bearer mock:${demoUser.id}` };
const INFLUENCER = { Authorization: `Bearer mock:${demoInfluencer.id}` };
const idOf = (handle: string) => fixtureProfiles.find((p) => p.snapshot.handle === handle)!.id;

const SOFI = idOf('sofi.moda.demo'); // del influencer demo: 3 intereses sin match en el seed
const ANDINA = idOf('andina.snacks.demo'); // de la empresa demo
const KALLPA = idOf('kallpa.sport.demo'); // otra empresa, misma clase que ANDINA
const NO_OWNER = idOf('mateo.deportes.demo');
const SEED_INTERESTS = 3;

async function setup(isAdmin = false) {
  const bus = createEventBus();
  const profiles = createProfilesModule({ adapter: 'mock', bus });
  const ingestion = createIngestionModule({ adapter: 'mock', bus });
  const classification = createClassificationModule({
    adapter: 'mock',
    bus,
    profiles: profiles.api,
    snapshots: ingestion.api,
  });
  const matching = createMatchingModule({
    adapter: 'mock',
    bus,
    profiles: profiles.api,
    classification: classification.api,
    weights: loadEnv({}).MATCH_WEIGHTS,
    isAdmin: async () => isAdmin,
    now: () => new Date('2026-11-25T12:00:00Z'),
  });
  const auth = createAuthModule({ adapter: 'mock', bus, profiles: profiles.api });
  return createApp({
    env: loadEnv({}),
    authMiddleware: auth.middleware,
    routers: [matching.router],
  });
}

describe('visibilidad HTTP', () => {
  it('summary e intereses sin match del seed; 403 si el perfil es ajeno', async () => {
    const app = await setup();
    const summary = await request(app)
      .get('/api/v1/visibility/summary')
      .query({ profileId: SOFI })
      .set(INFLUENCER);
    expect(summary.status).toBe(OK);
    expect(VisibilitySummary.parse(summary.body)).toMatchObject({
      interests7d: 0,
      interests30d: SEED_INTERESTS,
    });
    const list = await request(app)
      .get('/api/v1/visibility')
      .query({ profileId: SOFI, kind: 'interest' })
      .set(INFLUENCER);
    const items = VisibilityItem.array().parse(list.body.items);
    expect(items).toHaveLength(SEED_INTERESTS);
    expect(items.every((i) => i.profile.role === 'brand' && !i.reciprocated)).toBe(true);

    const statuses = await Promise.all(
      ['/api/v1/visibility/summary', '/api/v1/visibility'].map(
        async (path) =>
          (await request(app).get(path).query({ profileId: SOFI, kind: 'view' }).set(COMPANY))
            .status,
      ),
    );
    expect(statuses).toEqual([FORBIDDEN, FORBIDDEN]);
  });

  it('registra una visita por día y la muestra al dueño de la ficha', async () => {
    const app = await setup();
    const view = (viewer: string, viewed: string, auth = COMPANY) =>
      request(app)
        .post(`/api/v1/profiles/${viewed}/views`)
        .set(auth)
        .send({ viewerProfileId: viewer });
    expect((await view(ANDINA, SOFI)).body).toEqual({ recorded: true });
    expect((await view(ANDINA, SOFI)).body).toEqual({ recorded: false });
    expect((await view(ANDINA, NO_OWNER)).body).toEqual({ recorded: false }); // sin dueño
    expect((await view(ANDINA, KALLPA)).body).toEqual({ recorded: false }); // mismo tipo
    expect((await view(SOFI, ANDINA)).status).toBe(FORBIDDEN); // viewer ajeno

    const list = await request(app)
      .get('/api/v1/visibility')
      .query({ profileId: SOFI, kind: 'view' })
      .set(INFLUENCER);
    const items = VisibilityItem.array().parse(list.body.items);
    expect(items.map((i) => [i.profile.id, i.count])).toEqual([[ANDINA, 1]]);
    const summary = await request(app)
      .get('/api/v1/visibility/summary')
      .query({ profileId: SOFI })
      .set(INFLUENCER);
    expect(summary.body).toMatchObject({ views7d: 1, views30d: 1 });
  });

  it('los administradores no registran visitas', async () => {
    const app = await setup(true);
    const res = await request(app)
      .post(`/api/v1/profiles/${SOFI}/views`)
      .set(COMPANY)
      .send({ viewerProfileId: ANDINA });
    expect(res.body).toEqual({ recorded: false });
  });
});
