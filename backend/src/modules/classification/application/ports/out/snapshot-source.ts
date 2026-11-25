import type { IgProfileSnapshot } from '@sponcer/contracts';

/** Último snapshot de Instagram por handle (en el cableado: `IngestionApi.getLatestSnapshot`). */
export interface SnapshotSource {
  getLatestSnapshot(handle: string): Promise<IgProfileSnapshot | null>;
}
