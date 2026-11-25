import { Router } from 'express';
import { api, IgHandle } from '@sponcer/contracts';
import { DomainError } from '../../../../../shared/errors';
import { err } from '../../../../../shared/result';
import { isAdminEmail } from '../../../../../shared/admin';
import { registerEndpoint } from '../../../../../shared/http/register-endpoint';
import type {
  GetProfile,
  ManageServices,
  AdminListRemovals,
  AdminReviewRemoval,
  RequestProfileRemoval,
  UpdateDeclaredData,
} from '../../../application/ports/in/profile-use-cases';

export interface ProfilesUseCases {
  getProfile: GetProfile;
  updateDeclared: UpdateDeclaredData;
  putServices: ManageServices;
  requestRemoval: RequestProfileRemoval;
  adminListRemovals: AdminListRemovals;
  adminReviewRemoval: AdminReviewRemoval;
  /** Correos administradores (`ADMIN_EMAILS`). */
  adminEmails: readonly string[];
}

const invalidHandle = () =>
  err(new DomainError('VALIDATION_ERROR', 'Handle de Instagram inválido'));

export function createProfilesRouter(uc: ProfilesUseCases): Router {
  const router = Router();
  registerEndpoint(router, api.getProfile, async ({ params, user }) => {
    const handle = IgHandle.safeParse(params.handle);
    return handle.success ? uc.getProfile(handle.data, user.userId) : invalidHandle();
  });
  registerEndpoint(router, api.updateDeclared, ({ params, body, user }) =>
    uc.updateDeclared(user.userId, params.profileId, body),
  );
  registerEndpoint(router, api.putServices, ({ params, body, user }) =>
    uc.putServices(user.userId, params.profileId, body.services),
  );
  registerEndpoint(router, api.requestRemoval, async ({ params, body, user }) => {
    const handle = IgHandle.safeParse(params.handle);
    return handle.success
      ? uc.requestRemoval(handle.data, body.email, body.reason, user?.userId ?? null)
      : invalidHandle();
  });
  const forbidden = () => err(new DomainError('FORBIDDEN', 'Solo administradores'));
  registerEndpoint(router, api.adminListRemovals, async ({ query, user }) =>
    isAdminEmail(uc.adminEmails, user.email) ? uc.adminListRemovals(query) : forbidden(),
  );
  registerEndpoint(router, api.adminReviewRemoval, async ({ params, body, user }) =>
    isAdminEmail(uc.adminEmails, user.email)
      ? uc.adminReviewRemoval(user.userId, params.requestId, body)
      : forbidden(),
  );
  return router;
}
