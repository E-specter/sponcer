import type { IngestionBlocklist } from '../ports/out/ingestion-blocklist';
import type { SnapshotRepository } from '../ports/out/snapshot-repository';

/** Ley 29733: al retirar su ficha el titular, el handle se bloquea y se borran los datos ingeridos. */
export const makeHandleProfileRemoved =
  (d: { blocklist: IngestionBlocklist; snapshots: SnapshotRepository }) =>
  async (igHandle: string): Promise<void> => {
    // Primero el bloqueo: si el borrado falla, al menos no se vuelve a ingerir.
    await d.blocklist.add(igHandle);
    await d.snapshots.deleteByHandle(igHandle);
  };
