import type { Router } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdapterMode } from '../../config/env';
import type { AdminDirectory } from '../../shared/admin';
import { createWindowLimiter } from '../../shared/rate-limit';
import { makeAdminUsers } from './application/use-cases/admin-users';
import { createAdminRouter } from './infrastructure/in/http/admin.routes';
import { createMockInvitationSender } from './infrastructure/out/mock/mock-invitation-sender';
import { createSupabaseInvitationSender } from './infrastructure/out/supabase/supabase-invitation-sender';

const INVITES_PER_HOUR = 20;

export interface AdminModule {
  router: Router;
}

export function createAdminModule(deps: {
  adapter: AdapterMode;
  admins: AdminDirectory;
  /** Requerido con `adapter: 'real'` (cliente service_role). */
  supabase?: SupabaseClient;
  /** Origen público del frontend: destino de los enlaces de invitación. */
  appUrl: string;
  now?: () => Date;
}): AdminModule {
  if (deps.adapter === 'real' && !deps.supabase)
    throw new Error('ADAPTER_AUTH=real requiere el cliente Supabase');
  const invites =
    deps.adapter === 'real' && deps.supabase
      ? createSupabaseInvitationSender(deps.supabase, deps.appUrl)
      : createMockInvitationSender();
  const now = deps.now ?? (() => new Date());
  return {
    router: createAdminRouter(
      makeAdminUsers({
        admins: deps.admins,
        invites,
        now,
        inviteLimiter: createWindowLimiter({ limit: INVITES_PER_HOUR, windowMs: 3_600_000, now }),
      }),
    ),
  };
}
