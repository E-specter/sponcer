import type { IgProfileSnapshot } from '@sponcer/contracts';
import type { DomainError } from '../../../../../shared/errors';
import type { Result } from '../../../../../shared/result';

/** Fuente de datos de Instagram (adaptadores: mock, apify). Siempre devuelve el modelo de dominio. */
export interface InstagramSource {
  fetchProfile(handle: string): Promise<Result<IgProfileSnapshot, DomainError>>;
  /** Lectura en vivo, sin caché, para la verificación (ADR-002). */
  fetchLiveBio(handle: string): Promise<Result<IgProfileSnapshot, DomainError>>;
}
