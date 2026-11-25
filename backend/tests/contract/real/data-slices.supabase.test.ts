import { afterAll, beforeAll, describe } from 'vitest';
import { createWorld, hasSupabase, serviceClient } from '../../../../db/tests/support/supabase';
import { createSupabaseClassificationRepository } from '../../../src/modules/classification/infrastructure/out/supabase/supabase-classification-repository';
import {
  createSupabaseBlocklist,
  createSupabaseSnapshotRepository,
} from '../../../src/modules/ingestion/infrastructure/out/supabase/supabase-repositories';
import {
  createSupabaseCandidateSearch,
  createSupabaseInteractionRepository,
  createSupabaseMatchRepository,
} from '../../../src/modules/matching/infrastructure/out/supabase/supabase-repositories';
import { createProfilesModule } from '../../../src/modules/profiles';
import { createEventBus } from '../../../src/shared/events/event-bus';
import { describeClassificationRepositoryContract } from '../classification/classification-repository.contract';
import {
  describeIngestionBlocklistContract,
  describeSnapshotRepositoryContract,
} from '../ingestion/ingestion-repositories.contract';
import { describeCandidateSearchContract } from '../matching/candidate-search.contract';
import {
  describeInteractionRepositoryContract,
  describeMatchRepositoryContract,
} from '../matching/matching-repositories.contract';

/**
 * Las MISMAS suites que corren contra los mocks de ingestion/classification/matching, ahora contra los
 * adaptadores Supabase (Liskov). Datos propios `zz.*` que se borran al terminar.
 */
const SETUP_TIMEOUT_MS = 60_000;
const EMBEDDING_DIMENSIONS = 384;
const basis = (k: number) =>
  Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === k ? 1 : 0));
const classification = {
  niches: [],
  tier: 'nano' as const,
  followers: 0,
  engagementRate: 0,
  classifiedAt: '2026-01-01T10:00:00.000Z',
};

describe.skipIf(!hasSupabase)('ingestion · matching · classification · adaptadores reales', () => {
  const sb = serviceClient();
  const world = createWorld(sb);
  const classifications = createSupabaseClassificationRepository(sb);

  beforeAll(() => world.cleanup(), SETUP_TIMEOUT_MS);
  afterAll(() => world.cleanup(), SETUP_TIMEOUT_MS);

  const trio = async () => ({
    creatorId: (await world.newProfile('creator')).id,
    brandId: (await world.newProfile('brand')).id,
    otherId: (await world.newProfile('creator')).id,
  });

  describeInteractionRepositoryContract(() => ({
    repo: createSupabaseInteractionRepository(sb),
    newTrio: trio,
  }));
  describeMatchRepositoryContract(() => ({
    repo: createSupabaseMatchRepository(sb),
    newTrio: trio,
  }));
  describeSnapshotRepositoryContract(() => ({
    repo: createSupabaseSnapshotRepository(sb),
    newHandle: () => world.newHandle(),
  }));
  describeIngestionBlocklistContract(() => ({
    blocklist: createSupabaseBlocklist(sb),
    newHandle: () => world.newHandle(),
  }));
  describeClassificationRepositoryContract(() => ({
    repo: classifications,
    newProfileId: async () => (await world.newProfile('creator')).id,
  }));

  describeCandidateSearchContract(async () => {
    const profiles = createProfilesModule({
      adapter: 'real',
      bus: createEventBus(),
      supabase: sb,
    }).api;
    const [viewer, close, far, unclassified, removed] = [
      await world.newProfile('creator'),
      await world.newProfile('brand'),
      await world.newProfile('brand'),
      await world.newProfile('creator'),
      await world.newProfile('brand'),
    ];
    await sb.from('profiles').update({ status: 'removed' }).eq('id', removed.id);
    await classifications.save(viewer.id, classification, basis(0));
    await classifications.save(close.id, classification, basis(0));
    await classifications.save(far.id, classification, basis(1));
    await classifications.save(removed.id, classification, basis(0));
    return {
      search: createSupabaseCandidateSearch({
        db: sb,
        profiles,
        classification: { getEmbedding: (id) => classifications.getEmbedding(id) },
      }),
      viewerId: viewer.id,
      closeId: close.id,
      farId: far.id,
      unclassifiedViewerId: unclassified.id,
      removedId: removed.id,
    };
  });
});
