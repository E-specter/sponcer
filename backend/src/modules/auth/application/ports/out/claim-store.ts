import type { ClaimRecord } from '../../../domain/claim';

export interface ClaimStore {
  save(claim: ClaimRecord): Promise<void>;
  findById(id: string): Promise<ClaimRecord | null>;
  markConsumed(id: string): Promise<void>;
  /**
   * Cuenta y registra un intento en un solo paso atómico (ventana de 1 h, máx. CLAIM_MAX_ATTEMPTS_PER_HOUR).
   * Devuelve `false` (sin registrar) si el usuario ya agotó el límite.
   */
  tryRecordAttempt(userId: string, now: Date): Promise<boolean>;
}
