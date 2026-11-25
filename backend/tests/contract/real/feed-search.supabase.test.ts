import { beforeAll, describe } from 'vitest';
import { hasSupabase, supabaseEnv } from '../../../../db/tests/support/supabase';
import { composeApp } from '../../../src/compose';
import { loadEnv } from '../../../src/config/env';
import { describeFeedSearch, type FeedWorld } from '../../support/feed-scenarios';

/**
 * Los MISMOS escenarios de búsqueda `q` y `city` del mock, con el adaptador real de profiles (Supabase local, seed de
 * los fixtures): `declared.city` sale del jsonb de la BD y las tarjetas de `listCandidates` real.
 */
const SETUP_TIMEOUT_MS = 60_000;

describe.skipIf(!hasSupabase)('feed · adaptador real de profiles', () => {
  let world: FeedWorld;
  beforeAll(async () => {
    const { app, backfill } = composeApp(loadEnv({ ADAPTER_PROFILES: 'real', ...supabaseEnv() }));
    await backfill;
    world = { app, exact: false };
  }, SETUP_TIMEOUT_MS);

  describeFeedSearch('adaptador real de profiles (Supabase local)', () => world);
});
