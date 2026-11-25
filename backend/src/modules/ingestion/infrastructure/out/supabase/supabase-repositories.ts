import type { SupabaseClient } from '@supabase/supabase-js';
import type { IngestionBlocklist } from '../../../application/ports/out/ingestion-blocklist';
import type { SnapshotRepository } from '../../../application/ports/out/snapshot-repository';
import { rowToStored, snapshotToRow, type SnapshotRow } from './snapshot-mappers';

/** Tope por pasada; como se poda tras cada ingesta, nunca hay más que unos pocos sobrantes. */
const PRUNE_BATCH = 100;

const fail = (op: string, message: string): never => {
  throw new Error(`ingestion/supabase ${op}: ${message}`);
};

export function createSupabaseSnapshotRepository(db: SupabaseClient): SnapshotRepository {
  return {
    async save(snapshot) {
      const { data, error } = await db
        .from('ig_snapshots')
        .insert(snapshotToRow(snapshot))
        .select()
        .single();
      if (error) return fail('save', error.message);
      return rowToStored(data as SnapshotRow) ?? { id: (data as SnapshotRow).id, snapshot };
    },
    async latestByHandle(handle) {
      const { data, error } = await db
        .from('ig_snapshots')
        .select()
        .eq('ig_handle', handle)
        .order('fetched_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return fail('latestByHandle', error.message);
      return data ? rowToStored(data as SnapshotRow) : null;
    },
    async prune(handle, keep) {
      const old = await db
        .from('ig_snapshots')
        .select('id')
        .eq('ig_handle', handle)
        .order('fetched_at', { ascending: false })
        .range(keep, keep + PRUNE_BATCH);
      if (old.error) return fail('prune/select', old.error.message);
      if (!old.data.length) return;
      const { error } = await db
        .from('ig_snapshots')
        .delete()
        .in(
          'id',
          old.data.map((r) => (r as { id: string }).id),
        );
      if (error) fail('prune/delete', error.message);
    },
    async deleteByHandle(handle) {
      const { error } = await db.from('ig_snapshots').delete().eq('ig_handle', handle);
      if (error) fail('deleteByHandle', error.message);
    },
  };
}

export function createSupabaseBlocklist(db: SupabaseClient): IngestionBlocklist {
  return {
    async isBlocked(handle) {
      const { count, error } = await db
        .from('ingestion_blocklist')
        .select('id', { count: 'exact', head: true })
        .eq('ig_handle', handle);
      if (error) return fail('isBlocked', error.message);
      return (count ?? 0) > 0;
    },
    async add(handle) {
      const { error } = await db
        .from('ingestion_blocklist')
        .upsert(
          { ig_handle: handle, reason: 'exclusion del titular' },
          { onConflict: 'ig_handle', ignoreDuplicates: true },
        );
      if (error) fail('add', error.message);
    },
  };
}
