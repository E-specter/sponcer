import { DomainError } from '../../../../shared/errors';
import type { EventBus } from '../../../../shared/events/event-bus';
import { err, ok } from '../../../../shared/result';
import { isFresh } from '../../domain/snapshot-freshness';
import { normalizeHandle } from '../normalize-handle';
import type { IngestionApi } from '../ports/in/ingestion-api';
import type { IngestionBlocklist } from '../ports/out/ingestion-blocklist';
import type { InstagramSource } from '../ports/out/instagram-source';
import type { SnapshotRepository } from '../ports/out/snapshot-repository';

export const makeIngestProfile =
  (d: {
    source: InstagramSource;
    snapshots: SnapshotRepository;
    blocklist: IngestionBlocklist;
    bus: EventBus;
    now: () => Date;
  }): IngestionApi['ingestProfile'] =>
  async (rawHandle) => {
    const handle = normalizeHandle(rawHandle);
    if (!handle.ok) return handle;
    if (await d.blocklist.isBlocked(handle.value)) {
      return err(new DomainError('FORBIDDEN', 'Perfil excluido a pedido del titular'));
    }
    const stored = await d.snapshots.latestByHandle(handle.value);
    const cached = stored && isFresh(stored.snapshot.fetchedAt, d.now()) ? stored : null;
    const fetched = cached ? ok(cached.snapshot) : await d.source.fetchProfile(handle.value);
    if (!fetched.ok) return fetched;
    // RF-01 / RNF-05: solo cuentas profesionales y públicas; las demás ni se guardan.
    if (fetched.value.isPrivate || !fetched.value.isBusiness) {
      return err(new DomainError('FORBIDDEN', 'Solo se ingieren cuentas públicas y profesionales'));
    }
    if (cached) return ok({ snapshotId: cached.id, snapshot: cached.snapshot, cached: true });
    const saved = await d.snapshots.save(fetched.value);
    d.bus.publish({ type: 'ProfileIngested', igHandle: handle.value, snapshotId: saved.id });
    return ok({ snapshotId: saved.id, snapshot: saved.snapshot, cached: false });
  };
