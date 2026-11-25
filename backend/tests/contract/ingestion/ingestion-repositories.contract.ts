import { describe, expect, it } from 'vitest';
import type { IgProfileSnapshot } from '@sponcer/contracts';
import { fixtureProfiles } from '@sponcer/contracts/fixtures';
import type { IngestionBlocklist } from '../../../src/modules/ingestion/application/ports/out/ingestion-blocklist';
import type { SnapshotRepository } from '../../../src/modules/ingestion/application/ports/out/snapshot-repository';

export interface SnapshotHarness {
  repo: SnapshotRepository;
  /** Un handle que no tiene snapshots; cada llamada, uno distinto. */
  newHandle: () => string;
}

export interface BlocklistHarness {
  blocklist: IngestionBlocklist;
  newHandle: () => string;
}

const T0 = Date.parse('2026-01-01T10:00:00.000Z');
const DAY_MS = 86_400_000;
const TWO = 2;
const BASE = fixtureProfiles.find((f) => f.snapshot.posts.length > 0)!.snapshot;

const snapshot = (handle: string, dayOffset: number): IgProfileSnapshot => ({
  ...BASE,
  handle,
  fetchedAt: new Date(T0 + dayOffset * DAY_MS).toISOString(),
});

/** Suite de `SnapshotRepository`: historial por handle; `latestByHandle` es el de `fetchedAt` más reciente. */
export function describeSnapshotRepositoryContract(
  factory: () => SnapshotHarness | Promise<SnapshotHarness>,
): void {
  describe('SnapshotRepository (contrato del puerto)', () => {
    it('latestByHandle devuelve null si no hay snapshots', async () => {
      const { repo, newHandle } = await factory();
      expect(await repo.latestByHandle(newHandle())).toBeNull();
    });

    it('save devuelve id y snapshot; latestByHandle lo recupera idéntico (posts, nulos, fechas)', async () => {
      const { repo, newHandle } = await factory();
      const s = snapshot(newHandle(), 0);
      const saved = await repo.save(s);
      expect(saved.snapshot).toEqual(s);
      expect(saved.id).toEqual(expect.any(String));
      expect(await repo.latestByHandle(s.handle)).toEqual(saved);
    });

    it('latestByHandle devuelve el de fetchedAt más reciente, aunque se guarde antes', async () => {
      const { repo, newHandle } = await factory();
      const handle = newHandle();
      const newest = await repo.save(snapshot(handle, TWO));
      await repo.save(snapshot(handle, 0));
      await repo.save(snapshot(handle, 1));
      expect((await repo.latestByHandle(handle))?.id).toBe(newest.id);
    });

    it('guardar el mismo handle dos veces conserva ambas versiones con ids distintos', async () => {
      const { repo, newHandle } = await factory();
      const handle = newHandle();
      const [a, b] = [await repo.save(snapshot(handle, 0)), await repo.save(snapshot(handle, 1))];
      expect(a.id).not.toBe(b.id);
    });

    it('deleteByHandle borra todo el historial del handle y solo ese (Ley 29733)', async () => {
      const { repo, newHandle } = await factory();
      const [gone, kept] = [newHandle(), newHandle()];
      await repo.save(snapshot(gone, 0));
      await repo.save(snapshot(gone, 1));
      const survivor = await repo.save(snapshot(kept, 0));
      await repo.deleteByHandle(gone);
      expect(await repo.latestByHandle(gone)).toBeNull();
      expect((await repo.latestByHandle(kept))?.id).toBe(survivor.id);
    });

    it('deleteByHandle de un handle sin snapshots no falla', async () => {
      const { repo, newHandle } = await factory();
      await expect(repo.deleteByHandle(newHandle())).resolves.toBeUndefined();
    });

    it('no mezcla handles (ACL por handle)', async () => {
      const { repo, newHandle } = await factory();
      const [one, two] = [newHandle(), newHandle()];
      const mine = await repo.save(snapshot(one, 0));
      await repo.save(snapshot(two, 1));
      expect((await repo.latestByHandle(one))?.id).toBe(mine.id);
    });
  });
}

/** Suite de `IngestionBlocklist`: el alta es idempotente y solo bloquea ese handle. */
export function describeIngestionBlocklistContract(
  factory: () => BlocklistHarness | Promise<BlocklistHarness>,
): void {
  describe('IngestionBlocklist (contrato del puerto)', () => {
    it('un handle sin bloquear no está bloqueado', async () => {
      const { blocklist, newHandle } = await factory();
      expect(await blocklist.isBlocked(newHandle())).toBe(false);
    });

    it('add es idempotente: bloquear dos veces no falla ni duplica', async () => {
      const { blocklist, newHandle } = await factory();
      const handle = newHandle();
      await blocklist.add(handle);
      await expect(blocklist.add(handle)).resolves.toBeUndefined();
      expect(await blocklist.isBlocked(handle)).toBe(true);
    });

    it('un handle bloqueado lo está, y solo él', async () => {
      const { blocklist, newHandle } = await factory();
      const [blocked, free] = [newHandle(), newHandle()];
      await blocklist.add(blocked);
      expect(await blocklist.isBlocked(blocked)).toBe(true);
      expect(await blocklist.isBlocked(free)).toBe(false);
    });
  });
}
