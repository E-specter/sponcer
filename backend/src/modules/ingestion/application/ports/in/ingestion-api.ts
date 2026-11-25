import type { IgProfileSnapshot } from '@sponcer/contracts';
import type { DomainError } from '../../../../../shared/errors';
import type { Result } from '../../../../../shared/result';

export interface LiveBio {
  biography: string;
  isPrivate: boolean;
  isBusiness: boolean;
}

export interface IngestResult {
  snapshotId: string;
  snapshot: IgProfileSnapshot;
  /** `true` si se sirvió el snapshot guardado (< 24 h) sin llamar al proveedor. */
  cached: boolean;
}

/** API pública del slice para auth, profiles y classification. */
export interface IngestionApi {
  ingestProfile(handle: string): Promise<Result<IngestResult, DomainError>>;
  /** Lectura en vivo sin caché ni persistencia (ADR-002). Compatible con `LiveBioReader.read` de auth. */
  fetchLiveBio(handle: string): Promise<Result<LiveBio, DomainError>>;
  getLatestSnapshot(handle: string): Promise<IgProfileSnapshot | null>;
}
