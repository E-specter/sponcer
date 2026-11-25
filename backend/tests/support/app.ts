import { constants } from 'node:http2';
import request from 'supertest';
import { expect } from 'vitest';
import { api, ErrorBody, type Endpoint } from '@sponcer/contracts';
import { demoUser, fixtureProfiles, fixtureUsers } from '@sponcer/contracts/fixtures';
import { composeApp } from '../../src/compose';
import { loadEnv } from '../../src/config/env';

const H = constants;
export const STATUS = {
  OK: H.HTTP_STATUS_OK,
  BAD_REQUEST: H.HTTP_STATUS_BAD_REQUEST,
  UNAUTHORIZED: H.HTTP_STATUS_UNAUTHORIZED,
  FORBIDDEN: H.HTTP_STATUS_FORBIDDEN,
  NOT_FOUND: H.HTTP_STATUS_NOT_FOUND,
  CONFLICT: H.HTTP_STATUS_CONFLICT,
  TOO_MANY: H.HTTP_STATUS_TOO_MANY_REQUESTS,
  PAYLOAD_TOO_LARGE: H.HTTP_STATUS_PAYLOAD_TOO_LARGE,
  SERVER_ERROR: H.HTTP_STATUS_INTERNAL_SERVER_ERROR,
} as const;

const MINUTE_MS = 60_000;
const START = new Date('2026-01-01T10:00:00Z');
const EVENT_TYPES = ['ProfileVerified', 'ProfileDeclaredDataChanged'] as const;

/**
 * Monta la app con `composeApp(env, { now })` (el mismo cableado que usa main.ts, sin `listen`), con todos los
 * slices y adaptadores mock. El reloj es controlable con `advanceMinutes`; `events` recoge los eventos de
 * dominio del bus que devuelve composeApp. Espera al backfill de clasificación.
 */
export async function buildTestApp(start = START, envOverrides: Record<string, string> = {}) {
  let clock = start;
  const env = loadEnv(envOverrides);
  const { app, bus, backfill } = composeApp(env, { now: () => clock });
  const events: Array<{ type: string } & Record<string, unknown>> = [];
  EVENT_TYPES.forEach((type) => bus.subscribe(type, (e) => void events.push(e)));
  await backfill;
  return {
    app,
    env,
    bus,
    events,
    advanceMinutes: (m: number) => void (clock = new Date(clock.getTime() + m * MINUTE_MS)),
  };
}

export const bearer = (userId: string) => `Bearer mock:${userId}`;

type Verb = 'get' | 'post' | 'put' | 'patch';
export type TestApp = Awaited<ReturnType<typeof buildTestApp>>;
type App = TestApp['app'];

/** Request con (o sin) sesión mock. `as(null)` = anónimo. */
export const call = (app: App, verb: Verb, path: string, userId: string | null, body?: unknown) => {
  const req = request(app)[verb](path);
  if (userId) req.set('Authorization', bearer(userId));
  return body === undefined ? req : req.send(body as object);
};

/**
 * La respuesta cumple el esquema `response` del registro `api` y NO trae campos de más
 * (el backend envía el objeto sin parsear: un campo interno colado llegaría al cliente).
 */
export function expectMatchesContract(endpoint: Endpoint, body: unknown): void {
  const parsed = endpoint.response.safeParse(body);
  expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  expect(body).toEqual(parsed.data);
}

/** La respuesta de error cumple `ErrorBody` y trae el código esperado. */
export function expectError(
  res: { status: number; body: unknown },
  status: number,
  code: string,
): void {
  expect(res.status).toBe(status);
  const parsed = ErrorBody.safeParse(res.body);
  expect(parsed.success, JSON.stringify(res.body)).toBe(true);
  expect(parsed.data?.error.code).toBe(code);
}

// ---- datos de fixtures ----
export const OTHER_USER = fixtureUsers.find((u) => u.id !== demoUser.id)!;
const owned = (userId: string, role: 'creator' | 'brand') =>
  fixtureProfiles.find((p) => p.ownerUserId === userId && p.role === role)!;
export const demoCreator = owned(demoUser.id, 'creator');
export const demoBrand = owned(demoUser.id, 'brand');
export const otherCreator = owned(OTHER_USER.id, 'creator');
export const unclaimedCreator = fixtureProfiles.find(
  (p) => p.status === 'unclaimed' && p.role === 'creator' && p.snapshot.isBusiness,
)!;
export const unclaimedPersonalAccount = fixtureProfiles.find(
  (p) => p.status === 'unclaimed' && p.role === 'creator' && !p.snapshot.isBusiness,
)!;
export const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000';
export const claimsPath = api.startClaim.path;
export const verifyPath = (claimId: string) => api.verifyClaim.path.replace(':claimId', claimId);
export const profilePath = (handle: string) => api.getProfile.path.replace(':handle', handle);
export const declaredPath = (id: string) => api.updateDeclared.path.replace(':profileId', id);
export const servicesPath = (id: string) => api.putServices.path.replace(':profileId', id);
export const removalPath = (handle: string) => api.requestRemoval.path.replace(':handle', handle);
