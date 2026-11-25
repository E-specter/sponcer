import { DomainError } from '../../../../shared/errors';
import { err, ok } from '../../../../shared/result';
import type { ProfilesApi } from '../ports/in/profiles-api';
import type { ProfileClaimer } from '../ports/out/profile-claimer';

/** Crea el perfil del handle o reclama el existente (sin duplicar la ficha, ADR-002). La atomicidad vive en el claimer. */
export const makeClaimProfile =
  (d: { claimer: ProfileClaimer }): ProfilesApi['claimProfile'] =>
  async (handle, userId, role) => {
    const r = await d.claimer.claim(handle, userId, role);
    if (r.status === 'claimed') return ok({ profileId: r.profileId });
    return err(
      r.status === 'removed'
        ? new DomainError('CONFLICT', 'La ficha fue retirada', { reason: 'removed' })
        : new DomainError('CONFLICT', 'El perfil ya tiene dueño', { reason: 'owned' }),
    );
  };
