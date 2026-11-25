import type { EventBus } from '../../../../shared/events/event-bus';
import { DomainError } from '../../../../shared/errors';
import { err, ok } from '../../../../shared/result';
import type { ProfileAssembler } from '../profile-assembler';
import type { UpdateDeclaredData } from '../ports/in/profile-use-cases';
import type { ProfileReader } from '../ports/out/profile-reader';
import type { ProfileWriter } from '../ports/out/profile-writer';
import { loadOwnedProfile } from './load-owned-profile';

export const makeUpdateDeclared =
  (d: {
    reader: ProfileReader;
    writer: ProfileWriter;
    assembler: ProfileAssembler;
    bus: EventBus;
  }): UpdateDeclaredData =>
  async (userId, profileId, declared) => {
    const owned = await loadOwnedProfile(d.reader, profileId, userId);
    if (!owned.ok) return owned;
    if (declared.role !== owned.value.role) {
      return err(
        new DomainError('VALIDATION_ERROR', 'El rol de los datos no coincide con el del perfil'),
      );
    }
    const updated = { ...owned.value, declared };
    await d.writer.save(updated);
    d.bus.publish({ type: 'ProfileDeclaredDataChanged', profileId });
    return ok(await d.assembler.detail(updated, userId));
  };
