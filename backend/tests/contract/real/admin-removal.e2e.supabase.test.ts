import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api } from '@sponcer/contracts';
import { demoUser, fixtureProfiles } from '@sponcer/contracts/fixtures';
import {
  createWorld,
  hasSupabase,
  serviceClient,
  supabaseEnv,
} from '../../../../db/tests/support/supabase';
import { createApp } from '../../../src/app';
import { loadEnv } from '../../../src/config/env';
import { createAuthMiddleware } from '../../../src/modules/auth/infrastructure/in/http/auth.middleware';
import { createMockIdentityProvider } from '../../../src/modules/auth/infrastructure/out/mock/mock-adapters';
import { createClassificationModule } from '../../../src/modules/classification';
import { createMockEmbeddingProvider } from '../../../src/modules/classification/infrastructure/out/mock/mock-adapters';
import { createSupabaseClassificationRepository } from '../../../src/modules/classification/infrastructure/out/supabase/supabase-classification-repository';
import { createIngestionModule } from '../../../src/modules/ingestion';
import { createProfilesModule } from '../../../src/modules/profiles';
import { createEventBus } from '../../../src/shared/events/event-bus';
import { call, expectError, OTHER_USER, STATUS } from '../../support/app';

/**
 * Panel de exclusiones de punta a punta contra Supabase local (Ley 29733): un administrador aplica un pedido y, vía
 * `ProfileRemoved`, ingestion bloquea el handle y borra snapshots y fotos (Storage), y classification borra
 * clasificación y embedding. Adaptadores REALES de profiles, ingestion (con token falso: no debe llamar a Apify) y
 * classification (solo el proveedor de embeddings es el mock, para no descargar el modelo).
 */
const SETUP_TIMEOUT_MS = 60_000;
const POLL_MS = 100;
const POLL_TRIES = 80;
const SETTLE_MS = 800;
const BUCKET = 'profile-images';
const EMBEDDING_DIMENSIONS = 384;
const SNAPSHOTS_SEEDED = 2;
const SNAP = fixtureProfiles[0]!.snapshot;
// Cabecera PNG (8 bytes) en base64: basta para el bucket, que solo valida el tipo declarado.
const PHOTO = new Uint8Array(Buffer.from('iVBORw0KGgo=', 'base64'));
const PHOTOS_PER_PROFILE = 2;
const classification = {
  niches: [],
  tier: 'nano' as const,
  followers: 0,
  engagementRate: 0,
  classifiedAt: '2026-01-01T10:00:00.000Z',
};
const embedding = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === 0 ? 1 : 0));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (check: () => Promise<boolean>, left = POLL_TRIES): Promise<boolean> => {
  if (await check()) return true;
  if (left <= 0) return false;
  await sleep(POLL_MS);
  return waitFor(check, left - 1);
};

describe.skipIf(!hasSupabase)('panel de exclusiones · de punta a punta (Supabase local)', () => {
  const sb = serviceClient();
  const world = createWorld(sb);
  const classifications = createSupabaseClassificationRepository(sb);
  const photoPaths: string[] = [];
  let ingestion: ReturnType<typeof createIngestionModule>;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    const env = loadEnv({
      ADAPTER_PROFILES: 'real',
      ADAPTER_INGESTION: 'real',
      ADAPTER_CLASSIFICATION: 'real',
      APIFY_TOKEN: 'token-falso-no-se-debe-usar',
      ADMIN_EMAILS: demoUser.email,
      ...supabaseEnv(),
    });
    const bus = createEventBus();
    const profiles = createProfilesModule({
      adapter: 'real',
      bus,
      supabase: sb,
      adminEmails: env.ADMIN_EMAILS,
    });
    ingestion = createIngestionModule({
      adapter: 'real',
      bus,
      apifyToken: env.APIFY_TOKEN,
      supabase: sb,
    });
    createClassificationModule({
      adapter: 'real',
      bus,
      profiles: profiles.api,
      snapshots: ingestion.api,
      supabase: sb,
      embeddings: createMockEmbeddingProvider(),
    });
    app = createApp({
      env,
      authMiddleware: createAuthMiddleware(createMockIdentityProvider()),
      routers: [profiles.router],
    });
    await world.cleanup();
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await sb.storage.from(BUCKET).remove(photoPaths);
    await world.cleanup();
  }, SETUP_TIMEOUT_MS);

  /** Ficha ajena (de OTHER_USER) con snapshots, clasificación, embedding y dos fotos en Storage. */
  async function seededProfile() {
    const profile = await world.newProfile('creator', OTHER_USER.id);
    world.trackHandle(profile.handle);
    await sb.from('ig_snapshots').insert(
      Array.from({ length: SNAPSHOTS_SEEDED }, () => ({
        ig_handle: profile.handle,
        payload: { ...SNAP, handle: profile.handle },
        source: 'mock',
      })),
    );
    await classifications.save(profile.id, classification, embedding);
    const paths = ['a.png', 'b.png'].map((name) => `${profile.handle}/${name}`);
    photoPaths.push(...paths);
    await Promise.all(
      paths.map((p) =>
        sb.storage.from(BUCKET).upload(p, PHOTO, { contentType: 'image/png', upsert: true }),
      ),
    );
    return profile;
  }
  const rowsOf = async (table: string, column: string, value: string) =>
    (await sb.from(table).select('*').eq(column, value)).data ?? [];
  const photosOf = async (handle: string) =>
    (await sb.storage.from(BUCKET).list(handle)).data?.length ?? 0;
  const removalPath = (handle: string) => api.requestRemoval.path.replace(':handle', handle);
  const reviewPath = (id: string) => api.adminReviewRemoval.path.replace(':requestId', id);

  /** Pedido anónimo pendiente; devuelve su id leyéndolo de la tabla. */
  async function pendingRequest(handle: string): Promise<string> {
    await call(app, 'post', removalPath(handle), null, { email: 'titular@correo.pe' });
    const rows = await rowsOf('profile_removal_requests', 'ig_handle', handle);
    expect(rows).toHaveLength(1);
    return String(rows[0]!.id);
  }
  const isErased = async (handle: string, profileId: string) =>
    (await rowsOf('ingestion_blocklist', 'ig_handle', handle)).length === 1 &&
    (await rowsOf('ig_snapshots', 'ig_handle', handle)).length === 0 &&
    (await rowsOf('profile_classifications', 'profile_id', profileId)).length === 0 &&
    (await rowsOf('profile_embeddings', 'profile_id', profileId)).length === 0 &&
    (await photosOf(handle)) === 0;

  it('el pedido anónimo no borra nada hasta que un administrador lo aplica', async () => {
    const profile = await seededProfile();
    await pendingRequest(profile.handle);
    await sleep(SETTLE_MS);
    expect((await rowsOf('profiles', 'id', profile.id))[0]).toMatchObject({ status: 'verified' });
    expect(await rowsOf('ingestion_blocklist', 'ig_handle', profile.handle)).toEqual([]);
    expect(await rowsOf('ig_snapshots', 'ig_handle', profile.handle)).toHaveLength(
      SNAPSHOTS_SEEDED,
    );
    expect(await photosOf(profile.handle)).toBe(PHOTOS_PER_PROFILE);
  });

  it('un usuario que no es administrador no puede aplicar el pedido (403) y no se borra nada', async () => {
    const profile = await seededProfile();
    const id = await pendingRequest(profile.handle);
    expectError(
      await call(app, 'post', reviewPath(id), OTHER_USER.id, { decision: 'apply' }),
      STATUS.FORBIDDEN,
      'FORBIDDEN',
    );
    await sleep(SETTLE_MS);
    expect((await rowsOf('profile_removal_requests', 'id', id))[0]).toMatchObject({
      status: 'pending',
    });
    expect(await rowsOf('ingestion_blocklist', 'ig_handle', profile.handle)).toEqual([]);
    expect(await photosOf(profile.handle)).toBe(PHOTOS_PER_PROFILE);
  });

  it('apply: ficha retirada, handle bloqueado y snapshots, clasificación, embedding y fotos borrados; re-ingesta bloqueada', async () => {
    const profile = await seededProfile();
    const other = await seededProfile();
    const id = await pendingRequest(profile.handle);
    const res = await call(app, 'post', reviewPath(id), demoUser.id, {
      decision: 'apply',
      note: 'titular verificado',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(STATUS.OK);
    expect(res.body).toMatchObject({ status: 'applied', reviewNote: 'titular verificado' });
    expect(await waitFor(() => isErased(profile.handle, profile.id))).toBe(true);

    expect((await rowsOf('profiles', 'id', profile.id))[0]).toMatchObject({ status: 'removed' });
    expect((await rowsOf('profile_removal_requests', 'id', id))[0]).toMatchObject({
      status: 'applied',
      reviewed_by: demoUser.id,
    });
    const again = await ingestion.api.ingestProfile(profile.handle);
    expect(!again.ok && again.error.code).toBe('FORBIDDEN');
    expect(await rowsOf('ig_snapshots', 'ig_handle', profile.handle)).toEqual([]);

    // el resto de fichas no se toca
    expect(await rowsOf('ig_snapshots', 'ig_handle', other.handle)).toHaveLength(SNAPSHOTS_SEEDED);
    expect(await photosOf(other.handle)).toBe(PHOTOS_PER_PROFILE);
    expect(await rowsOf('profile_classifications', 'profile_id', other.id)).toHaveLength(1);
  });

  it('revisar dos veces el mismo pedido da 409 CONFLICT y no vuelve a borrar ni a cambiar el estado', async () => {
    const profile = await seededProfile();
    const id = await pendingRequest(profile.handle);
    await call(app, 'post', reviewPath(id), demoUser.id, { decision: 'reject', note: 'primero' });
    expectError(
      await call(app, 'post', reviewPath(id), demoUser.id, { decision: 'apply' }),
      STATUS.CONFLICT,
      'CONFLICT',
    );
    await sleep(SETTLE_MS);
    expect((await rowsOf('profile_removal_requests', 'id', id))[0]).toMatchObject({
      status: 'rejected',
      review_note: 'primero',
    });
    expect(await rowsOf('ingestion_blocklist', 'ig_handle', profile.handle)).toEqual([]);
    expect(await photosOf(profile.handle)).toBe(PHOTOS_PER_PROFILE);
  });

  it('reject: la ficha y todos sus datos se conservan', async () => {
    const profile = await seededProfile();
    const id = await pendingRequest(profile.handle);
    const res = await call(app, 'post', reviewPath(id), demoUser.id, { decision: 'reject' });
    expect(res.body).toMatchObject({ status: 'rejected' });
    await sleep(SETTLE_MS);
    expect((await rowsOf('profiles', 'id', profile.id))[0]).toMatchObject({ status: 'verified' });
    expect(await rowsOf('ig_snapshots', 'ig_handle', profile.handle)).toHaveLength(
      SNAPSHOTS_SEEDED,
    );
    expect(await rowsOf('profile_embeddings', 'profile_id', profile.id)).toHaveLength(1);
    expect(await photosOf(profile.handle)).toBe(PHOTOS_PER_PROFILE);
  });

  it('dos administradores aplicando a la vez: uno gana (200), el otro recibe 409, y el borrado queda completo', async () => {
    const profile = await seededProfile();
    const id = await pendingRequest(profile.handle);
    const results = await Promise.all([
      call(app, 'post', reviewPath(id), demoUser.id, { decision: 'apply' }),
      call(app, 'post', reviewPath(id), demoUser.id, { decision: 'apply' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([STATUS.OK, STATUS.CONFLICT]);
    expect(await waitFor(() => isErased(profile.handle, profile.id))).toBe(true);
  });

  it('apply sobre un handle que nunca tuvo ficha bloquea el handle igualmente', async () => {
    const handle = world.newHandle();
    const id = await pendingRequest(handle);
    const res = await call(app, 'post', reviewPath(id), demoUser.id, { decision: 'apply' });
    expect(res.body).toMatchObject({ status: 'applied', profile: null });
    expect(
      await waitFor(
        async () => (await rowsOf('ingestion_blocklist', 'ig_handle', handle)).length === 1,
      ),
    ).toBe(true);
    const again = await ingestion.api.ingestProfile(handle);
    expect(!again.ok && again.error.code).toBe('FORBIDDEN');
  });
});
