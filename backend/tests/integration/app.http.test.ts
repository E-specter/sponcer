import { describe, expect, it } from 'vitest';
import { api } from '@sponcer/contracts';
import { demoUser } from '@sponcer/contracts/fixtures';
import { loadEnv } from '../../src/config/env';
import {
  buildTestApp,
  call,
  claimsPath,
  expectError,
  expectMatchesContract,
  profilePath,
  STATUS,
} from '../support/app';

const BODY_PADDING = 200_000; // sobre los 100 kB que acepta express.json() por defecto
const ALL_ENDPOINTS = [
  ['get', '/api/v1/me'],
  ['post', '/api/v1/claims'],
  ['post', '/api/v1/claims/00000000-0000-4000-8000-000000000000/verify'],
  ['get', '/api/v1/profiles/sofi.moda.demo'],
  ['patch', '/api/v1/profiles/00000000-0000-4000-8000-000000000000/declared'],
  ['put', '/api/v1/profiles/00000000-0000-4000-8000-000000000000/services'],
] as const;

describe('app (bordes comunes)', () => {
  it('GET /health es público y cumple el esquema', async () => {
    const res = await call((await buildTestApp()).app, 'get', api.health.path, null);
    expect(res.status).toBe(STATUS.OK);
    expectMatchesContract(api.health, res.body);
  });

  it.each(ALL_ENDPOINTS)('%s %s exige autenticación', async (verb, path) => {
    expectError(
      await call((await buildTestApp()).app, verb, path, null, {}),
      STATUS.UNAUTHORIZED,
      'UNAUTHORIZED',
    );
  });

  it('el token mal formado o de otro esquema no autentica', async () => {
    const t = await buildTestApp();
    const res = await call(t.app, 'get', api.me.path, null).set(
      'Authorization',
      `Basic mock:${demoUser.id}`,
    );
    expectError(res, STATUS.UNAUTHORIZED, 'UNAUTHORIZED');
  });

  it('ruta desconocida: 404 con ErrorBody', async () => {
    expectError(
      await call((await buildTestApp()).app, 'get', '/api/v1/nada', demoUser.id),
      STATUS.NOT_FOUND,
      'NOT_FOUND',
    );
  });

  it('JSON mal formado: 400 VALIDATION_ERROR, sin filtrar la traza', async () => {
    const res = await call((await buildTestApp()).app, 'post', claimsPath, demoUser.id)
      .set('Content-Type', 'application/json')
      .send('{"x":');
    expectError(res, STATUS.BAD_REQUEST, 'VALIDATION_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('node_modules');
    expect(res.body.error).not.toHaveProperty('stack');
  });

  it('B-4: no anuncia el framework con X-Powered-By', async () => {
    const res = await call((await buildTestApp()).app, 'get', api.health.path, null);
    expect(res.headers).not.toHaveProperty('x-powered-by');
  });

  it('CORS: solo el origen configurado recibe Access-Control-Allow-Origin', async () => {
    const t = await buildTestApp();
    const res = await call(t.app, 'get', api.health.path, null).set(
      'Origin',
      'http://evil.example',
    );
    expect(res.headers['access-control-allow-origin']).toBe(t.env.CORS_ORIGIN);
  });

  // M-4: onError mapea el `status` 4xx de Express/body-parser en vez de responder 500.
  it('M-4: un payload sobre el límite responde 413/400, no 500', async () => {
    const res = await call((await buildTestApp()).app, 'post', claimsPath, demoUser.id, {
      handle: 'a',
      role: 'creator',
      pad: 'x'.repeat(BODY_PADDING),
    });
    expect(res.status).toBeLessThan(STATUS.SERVER_ERROR);
  });

  it('M-4: un parámetro de ruta con percent-encoding inválido responde 400, no 500', async () => {
    const res = await call((await buildTestApp()).app, 'get', profilePath('%E0%A4%A'), demoUser.id);
    expect(res.status).toBe(STATUS.BAD_REQUEST);
  });
});

describe('config/env', () => {
  // A-2: `Bearer mock:<uuid>` es un bypass total de autenticación y los uuid demo son públicos.
  it('A-2: NODE_ENV=production rechaza cualquier adaptador mock', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow('ADAPTER_AUTH=mock no se permite');
  });

  it('A-2: en producción con todos los adaptadores reales y credenciales, el entorno es válido', () => {
    const slices = [
      'AUTH',
      'PROFILES',
      'INGESTION',
      'CLASSIFICATION',
      'MATCHING',
      'QUOTES',
      'NOTIFICATIONS',
      'CHAT',
    ];
    const real = Object.fromEntries(slices.map((s) => [`ADAPTER_${s}`, 'real']));
    const env = loadEnv({
      NODE_ENV: 'production',
      SUPABASE_URL: 'http://localhost:54321',
      SUPABASE_SERVICE_ROLE_KEY: 'k',
      SUPABASE_ANON_KEY: 'k',
      APIFY_TOKEN: 'k',
      ...real,
    });
    expect(env.NODE_ENV).toBe('production');
  });

  it('los adaptadores reales exigen las credenciales de Supabase', () => {
    expect(() => loadEnv({ ADAPTER_AUTH: 'real' })).toThrow('SUPABASE_URL');
  });

  it('por defecto todo es mock', () => {
    const env = loadEnv({});
    expect([env.ADAPTER_AUTH, env.ADAPTER_PROFILES]).toEqual(['mock', 'mock']);
  });
});
