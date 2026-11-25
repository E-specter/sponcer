import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Router } from 'express';
import type { AdapterMode } from '../../config/env';
import type { EventBus } from '../../shared/events/event-bus';
import type { ClassificationApi } from '../classification';
import type { ProfilesApi } from '../profiles';
import type { MatchingApi } from './application/ports/in/matching-api';
import { makeGetFeed } from './application/use-cases/get-feed';
import { makeInteract } from './application/use-cases/interact';
import { makeListMatches } from './application/use-cases/list-matches';
import { makeMatchingQueries } from './application/use-cases/matching-queries';
import { weightedScore } from './domain/weighted-score';
import { createMatchingRouter } from './infrastructure/in/http/matching.routes';
import {
  createSupabaseCandidateSearch,
  createSupabaseInteractionRepository,
  createSupabaseMatchRepository,
} from './infrastructure/out/supabase/supabase-repositories';
import {
  createInMemoryInteractionRepository,
  createInMemoryMatchRepository,
  createMockCandidateSearch,
} from './infrastructure/out/mock/mock-adapters';

export interface MatchingModule {
  api: MatchingApi;
  router: Router;
}

export function createMatchingModule(deps: {
  adapter: AdapterMode;
  bus: EventBus;
  profiles: ProfilesApi;
  classification: ClassificationApi;
  /** `env.MATCH_WEIGHTS`: similitud, nichos, presupuesto, engagement. */
  weights: readonly number[];
  /** Requerido con `adapter: 'real'` (cliente service_role). */
  supabase?: SupabaseClient;
  now?: () => Date;
  newId?: () => string;
}): MatchingModule {
  const db = deps.adapter === 'real' ? deps.supabase : undefined;
  if (deps.adapter === 'real' && !db)
    throw new Error('ADAPTER_MATCHING=real requiere un cliente Supabase');
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? randomUUID;
  const search = db
    ? createSupabaseCandidateSearch({
        db,
        profiles: deps.profiles,
        classification: deps.classification,
      })
    : createMockCandidateSearch({ profiles: deps.profiles, classification: deps.classification });
  const interactions = db
    ? createSupabaseInteractionRepository(db)
    : createInMemoryInteractionRepository();
  const matches = db ? createSupabaseMatchRepository(db) : createInMemoryMatchRepository();

  return {
    api: makeMatchingQueries({ matches, profiles: deps.profiles }),
    router: createMatchingRouter({
      getFeed: makeGetFeed({
        profiles: deps.profiles,
        search,
        interactions,
        scoring: weightedScore(deps.weights),
      }),
      interact: makeInteract({
        profiles: deps.profiles,
        interactions,
        matches,
        bus: deps.bus,
        now,
        newId,
      }),
      listMatches: makeListMatches({ profiles: deps.profiles, matches }),
    }),
  };
}
