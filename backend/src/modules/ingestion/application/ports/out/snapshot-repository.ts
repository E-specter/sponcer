import type { IgProfileSnapshot } from '@sponcer/contracts';

export interface StoredSnapshot {
  id: string;
  snapshot: IgProfileSnapshot;
}

export interface SnapshotRepository {
  save(snapshot: IgProfileSnapshot): Promise<StoredSnapshot>;
  latestByHandle(handle: string): Promise<StoredSnapshot | null>;
  /** Conserva solo los `keep` más recientes del handle (retención, RNF-05). */
  prune(handle: string, keep: number): Promise<void>;
  /** Borra todo el historial del handle (exclusión del titular, Ley 29733). */
  deleteByHandle(handle: string): Promise<void>;
}
