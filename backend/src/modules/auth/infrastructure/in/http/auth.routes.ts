import { Router } from 'express';
import { api } from '@sponcer/contracts';
import { registerEndpoint } from '../../../../../shared/http/register-endpoint';
import type {
  ConfirmProfileClaim,
  GetCurrentUser,
  StartProfileClaim,
} from '../../../application/ports/in/auth-use-cases';

export interface AuthUseCases {
  getCurrentUser: GetCurrentUser;
  startClaim: StartProfileClaim;
  confirmClaim: ConfirmProfileClaim;
}

export function createAuthRouter(uc: AuthUseCases): Router {
  const router = Router();
  registerEndpoint(router, api.me, ({ user }) => uc.getCurrentUser(user));
  registerEndpoint(router, api.startClaim, ({ body, user }) => uc.startClaim(user.userId, body));
  registerEndpoint(router, api.verifyClaim, ({ params, user }) =>
    uc.confirmClaim(user.userId, params.claimId),
  );
  return router;
}
