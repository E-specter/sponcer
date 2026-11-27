import type { Account, RegisterRequest } from '@sponcer/contracts';

export interface AccountStore {
  /** Cuenta del usuario; `accountKind: null` si aún no se registró. */
  get(userId: string): Promise<Account>;
  /**
   * Crea cuenta, empresa o datos de influencer y consentimiento en una sola transacción.
   * Lanza `DomainError` CONFLICT si el usuario ya está registrado o el documento ya lo usa otra empresa.
   */
  register(userId: string, req: RegisterRequest): Promise<void>;
}
