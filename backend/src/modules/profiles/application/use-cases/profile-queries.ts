import { DomainError } from '../../../../shared/errors';
import { err, ok } from '../../../../shared/result';
import { isRemoved, type Profile } from '../../domain/profile';
import type { ProfilesApi } from '../ports/in/profiles-api';
import type { ProfileAssembler } from '../profile-assembler';
import type { ProfileReader } from '../ports/out/profile-reader';
import type { ServiceRepository } from '../ports/out/service-repository';

type Queries = Pick<
  ProfilesApi,
  | 'getById'
  | 'getCards'
  | 'listByOwner'
  | 'isOwner'
  | 'listCandidates'
  | 'getOwnerUserId'
  | 'getService'
>;

const visible = (ps: Array<Profile | null>): Profile[] =>
  ps.filter((p): p is Profile => p !== null && !isRemoved(p));

/** Lecturas que otros slices consumen vía `ProfilesApi`. */
export const makeProfileQueries = (d: {
  reader: ProfileReader;
  services: ServiceRepository;
  assembler: ProfileAssembler;
}): Queries => ({
  async getById(id, viewerUserId = null) {
    const [profile] = visible([await d.reader.findById(id)]);
    return profile
      ? ok(await d.assembler.detail(profile, viewerUserId))
      : err(new DomainError('NOT_FOUND', 'Perfil no encontrado'));
  },
  async getCards(ids) {
    const profiles = visible(await Promise.all(ids.map((id) => d.reader.findById(id))));
    return Promise.all(profiles.map((p) => d.assembler.card(p)));
  },
  async listByOwner(userId) {
    const profiles = visible(await d.reader.listByOwner(userId));
    return Promise.all(profiles.map((p) => d.assembler.summary(p)));
  },
  async isOwner(profileId, userId) {
    return (await d.reader.findById(profileId))?.ownerUserId === userId;
  },
  async getOwnerUserId(profileId) {
    return (await d.reader.findById(profileId))?.ownerUserId ?? null;
  },
  async getService(serviceId) {
    const found = await d.services.findById(serviceId);
    return found ? { service: found.service, creatorProfileId: found.profileId } : null;
  },
  async listCandidates(role) {
    const profiles = visible(await d.reader.listByRole(role));
    return Promise.all(profiles.map((p) => d.assembler.card(p)));
  },
});
