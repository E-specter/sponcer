import { Router } from 'express';
import { api } from '@sponcer/contracts';
import { registerEndpoint } from '../../../../../shared/http/register-endpoint';
import { adminEmailOf } from '../../../../../shared/admin';
import type { makeAdminUsers } from '../../../application/use-cases/admin-users';

export function createAdminRouter(uc: ReturnType<typeof makeAdminUsers>): Router {
  const router = Router();
  registerEndpoint(router, api.adminListAdmins, ({ user }) => uc.list(adminEmailOf(user)));
  registerEndpoint(router, api.adminGrantAdmin, ({ body, user }) =>
    uc.grant(adminEmailOf(user), body.email),
  );
  registerEndpoint(router, api.adminRevokeAdmin, ({ body, user }) =>
    uc.revoke(adminEmailOf(user), body.email),
  );
  registerEndpoint(router, api.adminInviteUser, ({ body, user }) =>
    uc.invite(adminEmailOf(user), body.email),
  );
  return router;
}
