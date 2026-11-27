import { adminEmailOf } from '../../../../shared/admin';
import { ok } from '../../../../shared/result';
import type { ProfilesApi } from '../../../profiles';
import type { GetCurrentUser } from '../ports/in/auth-use-cases';
import type { AccountStore } from '../ports/out/account-store';

export const makeGetCurrentUser =
  (d: {
    profiles: ProfilesApi;
    accounts: AccountStore;
    isAdmin?: (email: string) => Promise<boolean>;
  }): GetCurrentUser =>
  async (user) =>
    ok({
      userId: user.userId,
      email: user.email,
      account: await d.accounts.get(user.userId),
      profiles: await d.profiles.listByOwner(user.userId),
      isAdmin: (await d.isAdmin?.(adminEmailOf(user))) ?? false,
    });
