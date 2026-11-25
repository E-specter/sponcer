import { DomainError } from '../../../../shared/errors';
import { err, ok, type Result } from '../../../../shared/result';
import { isRemoved, type Profile } from '../../domain/profile';
import type { ProfileReader } from '../ports/out/profile-reader';

/** Carga un perfil existente y exige que `userId` sea su dueño. */
export async function loadOwnedProfile(
  profiles: ProfileReader,
  profileId: string,
  userId: string,
): Promise<Result<Profile, DomainError>> {
  const profile = await profiles.findById(profileId);
  if (!profile || isRemoved(profile))
    return err(new DomainError('NOT_FOUND', 'Perfil no encontrado'));
  if (profile.ownerUserId !== userId) {
    return err(new DomainError('FORBIDDEN', 'Solo el dueño puede modificar este perfil'));
  }
  return ok(profile);
}
