import type { ProfileCard, ProfileDetail, ProfileSummary } from '@sponcer/contracts';
import { type Profile, toCard, toIngested, toSummary } from '../domain/profile';
import type { ClassificationReader } from './ports/out/classification-reader';
import type { ServiceRepository } from './ports/out/service-repository';
import type { SnapshotReader } from './ports/out/snapshot-reader';

export interface ProfileAssembler {
  summary(p: Profile): Promise<ProfileSummary>;
  card(p: Profile): Promise<ProfileCard>;
  detail(p: Profile, viewerUserId: string | null): Promise<ProfileDetail>;
}

interface Deps {
  snapshots: SnapshotReader;
  classifications: ClassificationReader;
  services: ServiceRepository;
  now: () => Date;
}

/** Arma las vistas (resumen, tarjeta, ficha) juntando los puertos de lectura. */
export function createProfileAssembler(d: Deps): ProfileAssembler {
  const summary = async (p: Profile) => toSummary(p, await d.snapshots.getByHandle(p.handle));
  return {
    summary,
    async card(p) {
      const [s, classification, services] = await Promise.all([
        summary(p),
        d.classifications.getByProfileId(p.id),
        d.services.list(p.id),
      ]);
      return toCard(s, p.declared, classification, services);
    },
    async detail(p, viewerUserId) {
      const snap = await d.snapshots.getByHandle(p.handle);
      return {
        ...toSummary(p, snap),
        ingested: toIngested(snap, d.now()),
        declared: p.declared,
        classification: await d.classifications.getByProfileId(p.id),
        services: await d.services.list(p.id),
        isOwner: viewerUserId !== null && p.ownerUserId === viewerUserId,
      };
    },
  };
}
