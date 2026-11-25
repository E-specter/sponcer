import { fixtureProfiles } from '@sponcer/contracts/fixtures';
import { describe, expect, it } from 'vitest';
import { rowToStored, snapshotToRow, type SnapshotRow } from './snapshot-mappers';

const snapshot = fixtureProfiles[0]!.snapshot;

describe('snapshot mappers', () => {
  it('fila ↔ dominio sin pérdida', () => {
    const row = { id: 'x', ...snapshotToRow(snapshot) } as SnapshotRow;
    expect(row.ig_handle).toBe(snapshot.handle);
    expect(rowToStored(row)).toEqual({ id: 'x', snapshot });
  });

  it('payload inválido se trata como ausente', () => {
    expect(
      rowToStored({
        id: 'x',
        ig_handle: 'a',
        fetched_at: '',
        payload: { nope: 1 },
        source: 'mock',
      }),
    ).toBeNull();
  });
});
