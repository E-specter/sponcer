import type { DomainError } from '../../../../../shared/errors';
import type { Result } from '../../../../../shared/result';

export interface LiveBio {
  biography: string;
  isPrivate: boolean;
  isBusiness: boolean;
}

/** Lectura en vivo, sin caché (ADR-002). En F2 la implementa ingestion (`FetchLiveBio`). */
export interface LiveBioReader {
  read(handle: string): Promise<Result<LiveBio, DomainError>>;
}
