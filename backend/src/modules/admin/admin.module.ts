import type { Router } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdapterMode } from '../../config/env';
import type { AdminDirectory } from '../../shared/admin';
import { makeAdminUsers } from './application/use-cases/admin-users';
import { createAdminRouter } from './infrastructure/in/http/admin.routes';
import { createMockInvitationSender } from './infrastructure/out/mock/mock-invitation-sender';
import { createSupabaseInvitationSender } from './infrastructure/out/supabase/supabase-invitation-sender';

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
  return {
    router: createAdminRouter(
      makeAdminUsers({ admins: deps.admins, invites, now: deps.now ?? (() => new Date()) }),
    ),
  };
}
