import { ok } from '../../../../shared/result';
import type { ProfilesApi } from '../../../profiles';
import type { GetCurrentUser } from '../ports/in/auth-use-cases';

export const makeGetCurrentUser =
  (d: { profiles: ProfilesApi }): GetCurrentUser =>
  async (user) =>
    ok({
      userId: user.userId,
      email: user.email,
      profiles: await d.profiles.listByOwner(user.userId),
    });
