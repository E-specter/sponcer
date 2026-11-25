import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdapterMode } from '../../config/env';
import type { EventBus } from '../../shared/events/event-bus';
import type { IngestionApi } from './application/ports/in/ingestion-api';
import type { InstagramSource } from './application/ports/out/instagram-source';
import { makeFetchLiveBio } from './application/use-cases/fetch-live-bio';
import { makeGetLatestSnapshot } from './application/use-cases/get-latest-snapshot';
import { makeHandleProfileRemoved } from './application/use-cases/handle-profile-removed';
import { makeIngestProfile } from './application/use-cases/ingest-profile';
import { createApifySource } from './infrastructure/out/apify/apify-source';
import {
  createSupabaseBlocklist,
  createSupabaseSnapshotRepository,
} from './infrastructure/out/supabase/supabase-repositories';
import {
  createInMemoryBlocklist,
  createInMemorySnapshotRepository,
  createMockInstagramSource,
} from './infrastructure/out/mock/mock-adapters';

export interface IngestionModule {
  api: IngestionApi;
  /** Solo con el adaptador mock: el reclamo de auth pega aquí su código en la bio "en vivo". */
  setPendingCode?: (handle: string, code: string) => void;
}

export function createIngestionModule(deps: {
  adapter: AdapterMode;
  bus: EventBus;
  /** Requerido con `adapter: 'real'` (APIFY_TOKEN). */
  apifyToken?: string;
  /** Requerido con `adapter: 'real'` (cliente service_role). */
  supabase?: SupabaseClient;
  now?: () => Date;
}): IngestionModule {
  const now = deps.now ?? (() => new Date());
  const real = deps.adapter === 'real';
  if (real && !deps.apifyToken) throw new Error('ADAPTER_INGESTION=real requiere APIFY_TOKEN');
  if (real && !deps.supabase)
    throw new Error('ADAPTER_INGESTION=real requiere un cliente Supabase');
  const snapshots = real
    ? createSupabaseSnapshotRepository(deps.supabase!)
    : createInMemorySnapshotRepository();
  const blocklist = real ? createSupabaseBlocklist(deps.supabase!) : createInMemoryBlocklist();
  const mock = real ? null : createMockInstagramSource(now);
  const source: InstagramSource =
    mock ?? createApifySource({ token: deps.apifyToken as string, now });

  const onRemoved = makeHandleProfileRemoved({ blocklist, snapshots });
  deps.bus.subscribe('ProfileRemoved', (e) => onRemoved(e.igHandle));

  return {
    api: {
      ingestProfile: makeIngestProfile({ source, snapshots, blocklist, bus: deps.bus, now }),
      fetchLiveBio: makeFetchLiveBio({ source }),
      getLatestSnapshot: makeGetLatestSnapshot({ snapshots }),
    },
    setPendingCode: mock?.setPendingCode,
  };
}
