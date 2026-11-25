import { Router } from 'express';
import { api } from '@sponcer/contracts';
import { registerEndpoint } from '../../../../../shared/http/register-endpoint';
import type { makeAdminUsers } from '../../../application/use-cases/admin-users';

export function createAdminRouter(uc: ReturnType<typeof makeAdminUsers>): Router {
  const router = Router();
  registerEndpoint(router, api.adminListAdmins, ({ user }) => uc.list(user.email));
  registerEndpoint(router, api.adminGrantAdmin, ({ body, user }) =>
    uc.grant(user.email, body.email),
  );
  registerEndpoint(router, api.adminRevokeAdmin, ({ body, user }) =>
    uc.revoke(user.email, body.email),
  );
  registerEndpoint(router, api.adminInviteUser, ({ body, user }) =>
    uc.invite(user.email, body.email),
  );
  return router;
}
