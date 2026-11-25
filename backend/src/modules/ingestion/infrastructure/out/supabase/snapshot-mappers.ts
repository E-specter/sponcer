import { IgProfileSnapshot } from '@sponcer/contracts';
import type { StoredSnapshot } from '../../../application/ports/out/snapshot-repository';

/** Fila de `ig_snapshots`: no sale de este adaptador. */
export interface SnapshotRow {
  id: string;
  ig_handle: string;
  fetched_at: string;
  payload: unknown;
  source: 'mock' | 'apify';
}

export const snapshotToRow = (s: IgProfileSnapshot) => ({
  ig_handle: s.handle,
  fetched_at: s.fetchedAt,
  payload: s,
  source: s.source,
});

/** El payload se revalida: si el esquema evolucionó, una fila vieja inválida cuenta como "sin caché". */
export const rowToStored = (row: SnapshotRow): StoredSnapshot | null => {
  const parsed = IgProfileSnapshot.safeParse(row.payload);
  return parsed.success ? { id: row.id, snapshot: parsed.data } : null;
};
