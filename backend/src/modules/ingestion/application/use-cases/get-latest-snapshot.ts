import { normalizeHandle } from '../normalize-handle';
import type { IngestionApi } from '../ports/in/ingestion-api';
import type { SnapshotRepository } from '../ports/out/snapshot-repository';

export const makeGetLatestSnapshot =
  (d: { snapshots: SnapshotRepository }): IngestionApi['getLatestSnapshot'] =>
  async (rawHandle) => {
    const handle = normalizeHandle(rawHandle);
    return handle.ok ? ((await d.snapshots.latestByHandle(handle.value))?.snapshot ?? null) : null;
  };
