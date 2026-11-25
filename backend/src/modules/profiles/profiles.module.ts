import type { Router } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdapterMode } from '../../config/env';
import { createWindowLimiter } from '../../shared/rate-limit';
import type { OnDemandIngester } from './application/ports/out/on-demand-ingester';
import type { EventBus } from '../../shared/events/event-bus';
import type { ProfilesApi } from './application/ports/in/profiles-api';
import type { ClassificationReader } from './application/ports/out/classification-reader';
import type { SnapshotReader } from './application/ports/out/snapshot-reader';
import { createProfileAssembler } from './application/profile-assembler';
import {
  makeAdminListRemovals,
  makeAdminReviewRemoval,
} from './application/use-cases/admin-removals';
import { makeClaimProfile } from './application/use-cases/claim-profile';
import { makeGetProfile } from './application/use-cases/get-profile';
import { makeProfileQueries } from './application/use-cases/profile-queries';
import { makePutServices } from './application/use-cases/put-services';
import { makeRequestRemoval } from './application/use-cases/request-removal';
import { makeUpdateDeclared } from './application/use-cases/update-declared';
import { createProfilesRouter } from './infrastructure/in/http/profiles.routes';
import { createProfilesMockAdapters } from './infrastructure/out/mock/mock-adapters';
import {
  createSupabaseProfileClaimer,
  createSupabaseProfileRepository,
  createSupabaseRemovalStore,
  createSupabaseServiceRepository,
} from './infrastructure/out/supabase/supabase-adapters';

const ON_DEMAND_INGESTS_PER_HOUR = 10;
const HOUR_MS = 3_600_000;

export interface ProfilesModule {
  api: ProfilesApi;
  router: Router;
}

export function createProfilesModule(deps: {
  adapter: AdapterMode;
  bus: EventBus;
  /** Integración: lector sobre `IngestionApi.getLatestSnapshot`. Por defecto, mock de fixtures. */
  snapshots?: SnapshotReader;
  /** Integración: ingesta bajo demanda de handles desconocidos (RF-01). Sin él, un handle desconocido es NOT_FOUND. */
  ingester?: OnDemandIngester;
  /** Integración: lector sobre `ClassificationApi.getClassification`. Por defecto, mock de fixtures. */
  classifications?: ClassificationReader;
  /** Requerido con `adapter: 'real'` (cliente service_role). */
  supabase?: SupabaseClient;
  /** `env.ADMIN_EMAILS`: pueden revisar pedidos de exclusión. */
  adminEmails?: readonly string[];
  now?: () => Date;
}): ProfilesModule {
  const now = deps.now ?? (() => new Date());
  const mock = createProfilesMockAdapters();
  if (deps.adapter === 'real' && !deps.supabase)
    throw new Error('ADAPTER_PROFILES=real requiere el cliente Supabase');
  // Real: tablas en Supabase; snapshots y clasificación vienen de ingestion/classification (`deps`), no del mock.
  const a =
    deps.adapter === 'real' && deps.supabase
      ? {
          ...mock,
          profiles: createSupabaseProfileRepository(deps.supabase, now),
          services: createSupabaseServiceRepository(deps.supabase),
          removals: createSupabaseRemovalStore(deps.supabase),
          claimer: createSupabaseProfileClaimer(deps.supabase),
        }
      : mock;
  const assembler = createProfileAssembler({
    snapshots: deps.snapshots ?? a.snapshots,
    classifications: deps.classifications ?? a.classifications,
    services: a.services,
    now,
  });

  return {
    api: {
      ...makeProfileQueries({ reader: a.profiles, services: a.services, assembler }),
      claimProfile: makeClaimProfile({ claimer: a.claimer }),
    },
    router: createProfilesRouter({
      adminEmails: deps.adminEmails ?? [],
      adminListRemovals: makeAdminListRemovals({
        requests: a.removals,
        reader: a.profiles,
        assembler,
      }),
      adminReviewRemoval: makeAdminReviewRemoval({
        requests: a.removals,
        reader: a.profiles,
        writer: a.profiles,
        assembler,
        bus: deps.bus,
        now,
      }),
      getProfile: makeGetProfile({
        profiles: a.profiles,
        assembler,
        onDemand: deps.ingester && {
          ingester: deps.ingester,
          writer: a.profiles,
          bus: deps.bus,
          limiter: createWindowLimiter({
            limit: ON_DEMAND_INGESTS_PER_HOUR,
            windowMs: HOUR_MS,
            now,
          }),
        },
      }),
      updateDeclared: makeUpdateDeclared({
        reader: a.profiles,
        writer: a.profiles,
        assembler,
        bus: deps.bus,
      }),
      putServices: makePutServices({ reader: a.profiles, services: a.services }),
      requestRemoval: makeRequestRemoval({
        reader: a.profiles,
        writer: a.profiles,
        requests: a.removals,
        bus: deps.bus,
        now,
      }),
    }),
  };
}
