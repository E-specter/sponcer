import type { AuthUser } from '../../../../../shared/http/types';

export interface IdentityProvider {
  /** Resuelve el usuario del header `Authorization`; null si no hay sesión válida. */
  authenticate(authorizationHeader: string | undefined): Promise<AuthUser | null>;
}
