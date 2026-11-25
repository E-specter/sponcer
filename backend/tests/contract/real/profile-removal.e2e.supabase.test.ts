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
import { call, OTHER_USER } from '../../support/app';

/**
 * F3-A-1 de punta a punta contra Supabase local (Ley 29733, RNF-05): el dueño verificado retira su ficha por la
 * API real y, a través del bus (`ProfileRemoved`), ingestion bloquea el handle y borra sus snapshots y classification
 * borra clasificación y embedding. Con el adaptador de ingestion `real` y un token falso: si la re-ingesta no
 * estuviera bloqueada intentaría llamar a Apify y fallaría con UPSTREAM_ERROR en vez de FORBIDDEN.
 */
const SETUP_TIMEOUT_MS = 60_000;
const POLL_MS = 100;
const POLL_TRIES = 50;
const SETTLE_MS = 700;
const HTTP_OK = 200;
const SNAPSHOTS_SEEDED = 2;
const EMBEDDING_DIMENSIONS = 384;
const SNAP = fixtureProfiles[0]!.snapshot;
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

describe.skipIf(!hasSupabase)(
  'F3-A-1 · exclusión del titular de punta a punta (Supabase local)',
  () => {
    const sb = serviceClient();
    const world = createWorld(sb);
    const classifications = createSupabaseClassificationRepository(sb);
    // Los módulos reales exigen credenciales: se montan en beforeAll (se salta sin Supabase), no en el cuerpo del describe.
    let ingestion: ReturnType<typeof createIngestionModule>;
    let app: ReturnType<typeof createApp>;

    beforeAll(async () => {
      const env = loadEnv({
        ADAPTER_PROFILES: 'real',
        ADAPTER_INGESTION: 'real',
        ADAPTER_CLASSIFICATION: 'real',
        APIFY_TOKEN: 'token-falso-no-se-debe-usar',
        ...supabaseEnv(),
      });
      const bus = createEventBus();
      const profiles = createProfilesModule({ adapter: 'real', bus, supabase: sb });
      ingestion = createIngestionModule({
        adapter: 'real',
        bus,
        apifyToken: env.APIFY_TOKEN,
        supabase: sb,
      });
      // Mock de embeddings: no descarga el modelo; el resto es el adaptador real (Supabase/pgvector).
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
    afterAll(() => world.cleanup(), SETUP_TIMEOUT_MS);

    /** Perfil del demo con snapshot, clasificación y embedding ya guardados en la BD. */
    async function seededProfile() {
      const profile = await world.newProfile('creator', demoUser.id);
      world.trackHandle(profile.handle);
      await sb.from('ig_snapshots').insert([
        { ig_handle: profile.handle, payload: { ...SNAP, handle: profile.handle }, source: 'mock' },
        { ig_handle: profile.handle, payload: { ...SNAP, handle: profile.handle }, source: 'mock' },
      ]);
      await classifications.save(profile.id, classification, embedding);
      return profile;
    }
    const rowsOf = async (table: string, column: string, value: string) =>
      (await sb.from(table).select('*').eq(column, value)).data ?? [];
    const removalPath = (handle: string) => api.requestRemoval.path.replace(':handle', handle);

    it('el dueño retira su ficha: handle bloqueado, snapshots/clasificación/embedding borrados y re-ingesta bloqueada', async () => {
      const profile = await seededProfile();
      expect(await rowsOf('ig_snapshots', 'ig_handle', profile.handle)).toHaveLength(
        SNAPSHOTS_SEEDED,
      );
      expect(await rowsOf('profile_classifications', 'profile_id', profile.id)).toHaveLength(1);
      expect(await rowsOf('profile_embeddings', 'profile_id', profile.id)).toHaveLength(1);

      const res = await call(app, 'post', removalPath(profile.handle), demoUser.id, {
        email: demoUser.email,
      });
      expect(res.status).toBe(HTTP_OK);
      expect((await rowsOf('profiles', 'id', profile.id))[0]).toMatchObject({ status: 'removed' });

      const cleaned = await waitFor(
        async () =>
          (await rowsOf('ingestion_blocklist', 'ig_handle', profile.handle)).length === 1 &&
          (await rowsOf('ig_snapshots', 'ig_handle', profile.handle)).length === 0 &&
          (await rowsOf('profile_classifications', 'profile_id', profile.id)).length === 0 &&
          (await rowsOf('profile_embeddings', 'profile_id', profile.id)).length === 0,
      );
      expect(cleaned).toBe(true);

      const again = await ingestion.api.ingestProfile(profile.handle);
      expect(!again.ok && again.error.code).toBe('FORBIDDEN');
      expect(await ingestion.api.getLatestSnapshot(profile.handle)).toBeNull();
      expect(await rowsOf('ig_snapshots', 'ig_handle', profile.handle)).toEqual([]);
    });

    it('un anónimo no borra nada: el pedido queda pendiente y los datos del titular siguen intactos', async () => {
      const profile = await seededProfile();
      const res = await call(app, 'post', removalPath(profile.handle), null, {
        email: 'x@atacante.pe',
      });
      expect(res.status).toBe(HTTP_OK);
      await sleep(SETTLE_MS);
      expect((await rowsOf('profiles', 'id', profile.id))[0]).toMatchObject({ status: 'verified' });
      expect(await rowsOf('ingestion_blocklist', 'ig_handle', profile.handle)).toEqual([]);
      expect(await rowsOf('ig_snapshots', 'ig_handle', profile.handle)).toHaveLength(
        SNAPSHOTS_SEEDED,
      );
      expect(await rowsOf('profile_classifications', 'profile_id', profile.id)).toHaveLength(1);
      expect(await rowsOf('profile_embeddings', 'profile_id', profile.id)).toHaveLength(1);
    });

    it('otro usuario autenticado que no es el dueño tampoco borra nada', async () => {
      const profile = await seededProfile();
      await call(app, 'post', removalPath(profile.handle), OTHER_USER.id, {
        email: OTHER_USER.email,
      });
      await sleep(SETTLE_MS);
      expect(await rowsOf('ingestion_blocklist', 'ig_handle', profile.handle)).toEqual([]);
      expect(await rowsOf('ig_snapshots', 'ig_handle', profile.handle)).toHaveLength(
        SNAPSHOTS_SEEDED,
      );
    });

    it('el retiro de un perfil no toca los datos de otro', async () => {
      const [gone, kept] = [await seededProfile(), await seededProfile()];
      await call(app, 'post', removalPath(gone.handle), demoUser.id, { email: demoUser.email });
      await waitFor(
        async () => (await rowsOf('ig_snapshots', 'ig_handle', gone.handle)).length === 0,
      );
      expect(await rowsOf('ig_snapshots', 'ig_handle', kept.handle)).toHaveLength(SNAPSHOTS_SEEDED);
      expect(await rowsOf('profile_classifications', 'profile_id', kept.id)).toHaveLength(1);
      expect(await rowsOf('ingestion_blocklist', 'ig_handle', kept.handle)).toEqual([]);
    });
  },
);
