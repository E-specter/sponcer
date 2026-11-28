import { DomainError } from '../../../../shared/errors';
import { err } from '../../../../shared/result';
import type { GetCurrentUser, RegisterAccount } from '../ports/in/auth-use-cases';
import type { AccountStore } from '../ports/out/account-store';

/** Registro completo (ADR-009). El conflicto (ya registrada, documento repetido) lo lanza el store con mensaje claro. */
export const makeRegisterAccount =
  (d: { accounts: AccountStore; getCurrentUser: GetCurrentUser }): RegisterAccount =>
  async (user, req) => {
    try {
      await d.accounts.register(user.userId, req);
    } catch (e) {
      if (e instanceof DomainError) return err(e);
      throw e;
    }
    return d.getCurrentUser(user);
  };
