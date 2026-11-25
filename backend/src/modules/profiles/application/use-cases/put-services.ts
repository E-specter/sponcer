import { DomainError } from '../../../../shared/errors';
import { err, ok } from '../../../../shared/result';
import type { ManageServices } from '../ports/in/profile-use-cases';
import type { ProfileReader } from '../ports/out/profile-reader';
import type { ServiceRepository } from '../ports/out/service-repository';
import { loadOwnedProfile } from './load-owned-profile';

export const makePutServices =
  (d: { reader: ProfileReader; services: ServiceRepository }): ManageServices =>
  async (userId, profileId, services) => {
    const owned = await loadOwnedProfile(d.reader, profileId, userId);
    if (!owned.ok) return owned;
    if (owned.value.role !== 'creator') {
      return err(new DomainError('FORBIDDEN', 'Solo los creadores tienen catálogo de servicios'));
    }
    return ok(await d.services.replace(profileId, services));
  };
