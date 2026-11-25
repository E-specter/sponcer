import type { DomainError } from '../../../../../shared/errors';
import type { Result } from '../../../../../shared/result';

/** Ingesta bajo demanda de un handle desconocido (RF-01). En integración se conecta a `IngestionApi.ingestProfile`. */
export interface OnDemandIngester {
  ingest(handle: string): Promise<Result<{ snapshotId: string }, DomainError>>;
}
