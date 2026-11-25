import { randomUUID } from 'node:crypto';
import { MAX_CLASSIFIED_NICHES, tierFor, type Niche, type Service } from '@sponcer/contracts';
import { fixtureProfiles } from '@sponcer/contracts/fixtures';
import type { Profile } from '../../../domain/profile';
import type { ClassificationReader } from '../../../application/ports/out/classification-reader';
import { planServiceReplace } from '../../../domain/service-plan';
import type { ProfileClaimer } from '../../../application/ports/out/profile-claimer';
import type { ProfileReader } from '../../../application/ports/out/profile-reader';
import type { ProfileWriter } from '../../../application/ports/out/profile-writer';
import type {
  RemovalRequestRecord,
  RemovalRequestStore,
} from '../../../application/ports/out/removal-request-store';
import type { ServiceRepository } from '../../../application/ports/out/service-repository';
import type { SnapshotReader } from '../../../application/ports/out/snapshot-reader';

/** Adaptadores en memoria sembrados desde `contracts/fixtures`. */
export interface ProfilesMockAdapters {
  profiles: ProfileReader & ProfileWriter;
  services: ServiceRepository;
  snapshots: SnapshotReader;
  classifications: ClassificationReader;
  removals: RemovalRequestStore & { all(): RemovalRequestRecord[] };
  claimer: ProfileClaimer;
}

const average = (xs: number[]): number =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

function declaredNiches(declared: Profile['declared']): Niche[] {
  if (declared?.role === 'creator') return declared.niches;
  if (declared?.role === 'brand') return declared.targetNiches;
  return [];
}

export function createProfilesMockAdapters(): ProfilesMockAdapters {
  const byId = new Map<string, Profile>(
    fixtureProfiles.map((f) => [
      f.id,
      {
        id: f.id,
        handle: f.snapshot.handle,
        role: f.role,
        status: f.status,
        ownerUserId: f.ownerUserId,
        declared: f.declared,
      },
    ]),
  );
  const servicesByProfile = new Map<string, Service[]>(
    fixtureProfiles.map((f) => [f.id, f.services]),
  );
  const snapshotsByHandle = new Map(fixtureProfiles.map((f) => [f.snapshot.handle, f.snapshot]));
  const removalLog: RemovalRequestRecord[] = [];
  const all = () => [...byId.values()];

  const profiles: ProfileReader & ProfileWriter = {
    findById: async (id) => byId.get(id) ?? null,
    findByHandle: async (handle) => all().find((p) => p.handle === handle) ?? null,
    listByOwner: async (userId) => all().filter((p) => p.ownerUserId === userId),
    listByRole: async (role) => all().filter((p) => p.role === role),
    save: async (p) => void byId.set(p.id, p),
  };

  const snapshots: SnapshotReader = { getByHandle: async (h) => snapshotsByHandle.get(h) ?? null };

  const classifications: ClassificationReader = {
    async getByProfileId(profileId) {
      const profile = byId.get(profileId);
      const snap = profile && snapshotsByHandle.get(profile.handle);
      if (!profile || !snap) return null;
      const niches = declaredNiches(profile.declared);
      return {
        niches: niches
          .slice(0, MAX_CLASSIFIED_NICHES)
          .map((niche) => ({ niche, confidence: 1, source: 'declared' as const })),
        tier: tierFor(snap.followers),
        followers: snap.followers,
        engagementRate: snap.followers
          ? average(snap.posts.map((p) => (p.likes + p.comments) / snap.followers))
          : 0,
        classifiedAt: snap.fetchedAt,
      };
    },
  };

  const services: ServiceRepository = {
    list: async (profileId) => servicesByProfile.get(profileId) ?? [],
    async findById(serviceId) {
      const hit = [...servicesByProfile.entries()]
        .flatMap(([profileId, list]) => list.map((service) => ({ service, profileId })))
        .find((x) => x.service.id === serviceId);
      return hit ?? null;
    },
    async replace(profileId, inputs) {
      // Como el real: las filas idénticas (y las sobrantes, por orden) conservan su id.
      const plan = planServiceReplace(servicesByProfile.get(profileId) ?? [], inputs);
      const created = inputs.map((s, i) => ({ ...s, id: plan.assign[i] ?? randomUUID() }));
      servicesByProfile.set(profileId, created);
      return created;
    },
  };

  const removals = {
    add: async (r: RemovalRequestRecord) => void removalLog.push(r),
    all: () => removalLog,
  };

  // Mismas reglas que la RPC `claim_profile` (node es mono-hilo: no hay carrera en memoria).
  const claimer: ProfileClaimer = {
    async claim(handle, userId, role) {
      const existing = all().find((p) => p.handle === handle);
      if (existing?.status === 'removed') return { status: 'removed' };
      if (existing && existing.ownerUserId !== null && existing.ownerUserId !== userId)
        return { status: 'owned' };
      const claimed: Profile = {
        id: randomUUID(),
        handle,
        declared: null,
        ...existing,
        ...(existing && existing.role !== role ? { declared: null } : {}),
        role,
        status: 'verified',
        ownerUserId: userId,
      };
      byId.set(claimed.id, claimed);
      return { status: 'claimed', profileId: claimed.id };
    },
  };

  return { profiles, services, snapshots, classifications, removals, claimer };
}
