import { DomainError } from '../../../../shared/errors';
import { err, ok } from '../../../../shared/result';
import { isRemoved } from '../../domain/profile';
import type { ProfileAssembler } from '../profile-assembler';
import type { GetProfile } from '../ports/in/profile-use-cases';
import type { ProfileReader } from '../ports/out/profile-reader';

export const makeGetProfile =
  (d: { profiles: ProfileReader; assembler: ProfileAssembler }): GetProfile =>
  async (handle, viewerUserId) => {
    const profile = await d.profiles.findByHandle(handle);
    if (!profile || isRemoved(profile))
      return err(new DomainError('NOT_FOUND', 'Perfil no encontrado'));
    return ok(await d.assembler.detail(profile, viewerUserId));
  };
