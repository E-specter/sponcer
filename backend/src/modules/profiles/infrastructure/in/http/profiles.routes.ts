import { Router } from 'express';
import { api, IgHandle } from '@sponcer/contracts';
import { DomainError } from '../../../../../shared/errors';
import { err } from '../../../../../shared/result';
import { registerEndpoint } from '../../../../../shared/http/register-endpoint';
import type {
  GetProfile,
  ManageServices,
  AdminAddProfile,
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
  adminAddProfile: AdminAddProfile;
  /** ADMIN_EMAILS ∪ admin_users. */
  isAdmin: (email: string) => Promise<boolean>;
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
    (await uc.isAdmin(user.email)) ? uc.adminListRemovals(query) : forbidden(),
  );
  registerEndpoint(router, api.adminReviewRemoval, async ({ params, body, user }) =>
    (await uc.isAdmin(user.email))
      ? uc.adminReviewRemoval(user.userId, params.requestId, body)
      : forbidden(),
  );
  registerEndpoint(router, api.adminAddProfile, async ({ body, user }) =>
    (await uc.isAdmin(user.email))
      ? uc.adminAddProfile(user.email, body.handle, body.role)
      : forbidden(),
  );
  return router;
}
