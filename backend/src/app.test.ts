import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { demoInfluencer, demoUser } from '@sponcer/contracts/fixtures';
import { Me } from '@sponcer/contracts';
import { createApp } from './app';
import { loadEnv } from './config/env';
import { createEventBus } from './shared/events/event-bus';
import { createAuthModule } from './modules/auth';
import { createProfilesModule } from './modules/profiles';

const OK = 200;
const UNAUTHORIZED = 401;
const NOT_FOUND = 404;

function buildApp() {
  const env = loadEnv({});
  const bus = createEventBus();
  const profiles = createProfilesModule({ adapter: 'mock', bus });
  const auth = createAuthModule({ adapter: 'mock', bus, profiles: profiles.api });
  return createApp({
    env,
    authMiddleware: auth.middleware,
    routers: [auth.router, profiles.router],
  });
}

describe('humo HTTP', () => {
  it('GET /health es público', async () => {
    const res = await request(buildApp()).get('/api/v1/health');
    expect(res.status).toBe(OK);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /me exige auth', async () => {
    const res = await request(buildApp()).get('/api/v1/me');
    expect(res.status).toBe(UNAUTHORIZED);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('GET /me devuelve la Influencer demo con su cuenta y su creador', async () => {
    const res = await request(buildApp())
      .get('/api/v1/me')
      .set('Authorization', `Bearer mock:${demoInfluencer.id}`);
    const me = Me.parse(res.body);
    expect(me.account.accountKind).toBe('influencer');
    expect(me.profiles.map((p) => p.role)).toEqual(['creator']);
  });

  it('GET /me devuelve la Empresa demo con sus marcas', async () => {
    const res = await request(buildApp())
      .get('/api/v1/me')
      .set('Authorization', `Bearer mock:${demoUser.id}`);
    expect(res.status).toBe(OK);
    const me = Me.parse(res.body);
    expect(me.userId).toBe(demoUser.id);
    expect(me.account).toMatchObject({ accountKind: 'company', influencer: null });
    expect(me.account.company?.documentNumber).toBe(demoUser.company?.documentNumber);
    expect(me.profiles.map((p) => p.role)).toEqual(['brand', 'brand']);
  });

  it('ruta desconocida: 404 con ErrorBody', async () => {
    const res = await request(buildApp()).get('/api/v1/nada');
    expect(res.status).toBe(NOT_FOUND);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
