import type { IgProfileSnapshot } from '@sponcer/contracts';

/** En F2 lo implementa el slice ingestion. */
export interface SnapshotReader {
  getByHandle(handle: string): Promise<IgProfileSnapshot | null>;
}
