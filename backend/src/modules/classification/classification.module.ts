import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdapterMode } from '../../config/env';
import type { EventBus } from '../../shared/events/event-bus';
import { logger } from '../../shared/logger';
import type { ProfilesApi } from '../profiles';
import { createNicheIndex } from './application/niche-index';
import type { ClassificationApi } from './application/ports/in/classification-api';
import type { EmbeddingProvider } from './application/ports/out/embedding-provider';
import type { SnapshotSource } from './application/ports/out/snapshot-source';
import { makeClassifyAll } from './application/use-cases/classify-all';
import { makeClassifyProfile } from './application/use-cases/classify-profile';
import {
  createInMemoryClassificationRepository,
  createMockEmbeddingProvider,
} from './infrastructure/out/mock/mock-adapters';
import { createSupabaseClassificationRepository } from './infrastructure/out/supabase/supabase-classification-repository';
import { createProfilesApiReader } from './infrastructure/out/profiles/profiles-api-reader';
import { createTransformersEmbeddingProvider } from './infrastructure/out/transformers/transformers-embedding-provider';

export interface ClassificationModule {
  api: ClassificationApi;
}

export function createClassificationModule(deps: {
  adapter: AdapterMode;
  bus: EventBus;
  profiles: ProfilesApi;
  /** `IngestionApi` (solo se usa `getLatestSnapshot`). */
  snapshots: SnapshotSource;
  /** Requerido con `adapter: 'real'` (cliente service_role). */
  supabase?: SupabaseClient;
  now?: () => Date;
  /** Para tests: sustituye al proveedor elegido por `adapter`. */
  embeddings?: EmbeddingProvider;
}): ClassificationModule {
  const now = deps.now ?? (() => new Date());
  // `real` = embeddings reales (transformers.js) y repositorio en Supabase/pgvector.
  if (deps.adapter === 'real' && !deps.supabase)
    throw new Error('ADAPTER_CLASSIFICATION=real requiere un cliente Supabase');
  const embeddings =
    deps.embeddings ??
    (deps.adapter === 'real'
      ? createTransformersEmbeddingProvider()
      : createMockEmbeddingProvider());
  const repository =
    deps.adapter === 'real'
      ? createSupabaseClassificationRepository(deps.supabase!)
      : createInMemoryClassificationRepository();
  const reader = createProfilesApiReader(deps.profiles);

  const classify = makeClassifyProfile({
    profiles: reader,
    snapshots: deps.snapshots,
    embeddings,
    nicheVectors: createNicheIndex(embeddings),
    repository,
    bus: deps.bus,
    now,
  });
  const logFailure = (profileId: string, r: Awaited<ReturnType<typeof classify>>) =>
    r.ok ? undefined : logger.warn(`no se pudo clasificar ${profileId}`, r.error.message);

  deps.bus.subscribe('ProfileRemoved', (e) => repository.deleteByProfile(e.profileId));
  deps.bus.subscribe('ProfileIngested', async (e) => {
    const profileId = await reader.findIdByHandle(e.igHandle);
    if (profileId) logFailure(profileId, await classify(profileId));
  });
  deps.bus.subscribe('ProfileDeclaredDataChanged', async (e) =>
    logFailure(e.profileId, await classify(e.profileId)),
  );

  return {
    api: {
      getClassification: repository.getClassification,
      getEmbedding: repository.getEmbedding,
      getEmbeddings: repository.getEmbeddings,
      classifyAll: makeClassifyAll({ profiles: reader, classify }),
    },
  };
}
