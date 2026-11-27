import { randomInt, randomUUID } from 'node:crypto';
import type { RequestHandler, Router } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdapterMode } from '../../config/env';
import type { EventBus } from '../../shared/events/event-bus';
import type { ProfilesApi } from '../profiles';
import type { LiveBioReader } from './application/ports/out/live-bio-reader';
import { makeConfirmProfileClaim } from './application/use-cases/confirm-profile-claim';
import { makeGetCurrentUser } from './application/use-cases/get-current-user';
import { makeStartProfileClaim } from './application/use-cases/start-profile-claim';
import { createAuthMiddleware } from './infrastructure/in/http/auth.middleware';
import { createAuthRouter } from './infrastructure/in/http/auth.routes';
import {
  createInMemoryClaimStore,
  createMockIdentityProvider,
  createMockLiveBioReader,
} from './infrastructure/out/mock/mock-adapters';
import {
  createSupabaseClaimStore,
  createSupabaseIdentityProvider,
} from './infrastructure/out/supabase/supabase-adapters';

export interface AuthModule {
  router: Router;
  /** Debe montarse antes de los routers de los demás slices. */
  middleware: RequestHandler;
}

export function createAuthModule(deps: {
  adapter: AdapterMode;
  bus: EventBus;
  profiles: ProfilesApi;
  /** Integración: lector sobre `IngestionApi.fetchLiveBio`. Si falta, mock con códigos propios. */
  liveBio?: LiveBioReader;
  /** Requerido con `adapter: 'real'` (cliente service_role). */
  supabase?: SupabaseClient;
  /** Integración: avisa al origen de la bio del código emitido (solo ingestion mock lo necesita). */
  onClaimStarted?: (handle: string, code: string) => void;
  /** ADMIN_EMAILS ∪ admin_users: usuarios con `isAdmin` en `/me`. */
  isAdmin?: (email: string) => Promise<boolean>;
  now?: () => Date;
}): AuthModule {
  const real = deps.adapter === 'real';
  if (real && !deps.supabase) throw new Error('ADAPTER_AUTH=real requiere el cliente Supabase');
  const now = deps.now ?? (() => new Date());
  const claims = real
    ? createSupabaseClaimStore(deps.supabase as SupabaseClient)
    : createInMemoryClaimStore();
  const identity = real
    ? createSupabaseIdentityProvider(deps.supabase as SupabaseClient)
    : createMockIdentityProvider();
  const pendingCodes = new Map<string, string>();
  const liveBio = deps.liveBio ?? createMockLiveBioReader(pendingCodes);

  const startClaim = makeStartProfileClaim({
    claims,
    now,
    randomIndex: randomInt,
    newId: randomUUID,
  });

  return {
    middleware: createAuthMiddleware(identity),
    router: createAuthRouter({
      getCurrentUser: makeGetCurrentUser({
        profiles: deps.profiles,
        isAdmin: deps.isAdmin,
      }),
      // Mock: el código en claro se "pega" en la bio en vivo (mock propio o el de ingestion).
      startClaim: async (userId, req) => {
        const result = await startClaim(userId, req);
        if (result.ok) {
          pendingCodes.set(req.handle, result.value.code);
          deps.onClaimStarted?.(req.handle, result.value.code);
        }
        return result;
      },
      confirmClaim: makeConfirmProfileClaim({
        claims,
        liveBio,
        profiles: deps.profiles,
        bus: deps.bus,
        now,
      }),
    }),
  };
}
