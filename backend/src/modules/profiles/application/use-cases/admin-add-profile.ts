import { randomUUID } from 'node:crypto';
import { DomainError } from '../../../../shared/errors';
import type { EventBus } from '../../../../shared/events/event-bus';
import { logger } from '../../../../shared/logger';
import { err, ok } from '../../../../shared/result';
import { isRemoved, type Profile } from '../../domain/profile';
import type { ProfileAssembler } from '../profile-assembler';
import type { AdminAddProfile } from '../ports/in/profile-use-cases';
import type { OnDemandIngester } from '../ports/out/on-demand-ingester';
import type { ProfileReader } from '../ports/out/profile-reader';
import type { ProfileWriter } from '../ports/out/profile-writer';

const exists = () => err(new DomainError('CONFLICT', 'Ya existe una ficha para ese handle'));

/**
 * Alta manual de una ficha previa sin dueño (ADR-008). Reutiliza la ingesta bajo demanda (que ya respeta la lista
 * de exclusión ARCO y exige cuenta pública profesional), sin el límite por usuario. A diferencia de la búsqueda,
 * al administrador sí se le dice por qué se rechazó el handle.
 */
export const makeAdminAddProfile =
  (d: {
    profiles: ProfileReader;
    writer: ProfileWriter;
    assembler: ProfileAssembler;
    ingester: OnDemandIngester;
    bus: EventBus;
    newId?: () => string;
  }): AdminAddProfile =>
  async (adminEmail, handle, role) => {
    const found = await d.profiles.findByHandle(handle);
    if (found)
      return isRemoved(found) ? err(new DomainError('FORBIDDEN', 'Ficha retirada')) : exists();
    const ingested = await d.ingester.ingest(handle);
    if (!ingested.ok) return ingested;
    const created: Profile = {
      id: (d.newId ?? randomUUID)(),
      handle,
      role,
      status: 'unclaimed',
      ownerUserId: null,
      declared: null,
    };
    try {
      await d.writer.save(created);
    } catch (e) {
      if (e instanceof DomainError && e.code === 'CONFLICT') return exists();
      throw e;
    }
    // Se publica con el perfil ya creado: `ProfileIngested` de ingestion llegó antes y classification lo ignoró.
    d.bus.publish({
      type: 'ProfileIngested',
      igHandle: handle,
      snapshotId: ingested.value.snapshotId,
    });
    logger.info('admin.action', { admin: adminEmail, action: 'add-profile', target: handle });
    return ok(await d.assembler.detail(created, null));
  };
