import { randomUUID } from 'node:crypto';
import { DomainError } from '../../../../shared/errors';
import type { EventBus } from '../../../../shared/events/event-bus';
import type { WindowLimiter } from '../../../../shared/rate-limit';
import { err, ok } from '../../../../shared/result';
import { isRemoved, type Profile } from '../../domain/profile';
import type { ProfileAssembler } from '../profile-assembler';
import type { GetProfile } from '../ports/in/profile-use-cases';
import type { OnDemandIngester } from '../ports/out/on-demand-ingester';
import type { ProfileReader } from '../ports/out/profile-reader';
import type { ProfileWriter } from '../ports/out/profile-writer';

const notFound = () => err(new DomainError('NOT_FOUND', 'Perfil no encontrado'));

export interface OnDemand {
  ingester: OnDemandIngester;
  writer: ProfileWriter;
  bus: EventBus;
  /** Cada ingesta cuesta crédito del proveedor: se limita por usuario. */
  limiter: WindowLimiter;
  newId?: () => string;
}

/**
 * RF-01: un handle desconocido se ingiere bajo demanda y se crea una ficha `unclaimed` (rol inicial `creator`; el
 * dueño la reclama con su rol real). Cuenta privada, no profesional o bloqueada: NOT_FOUND idéntico a un handle inexistente.
 */
export const makeGetProfile =
  (d: { profiles: ProfileReader; assembler: ProfileAssembler; onDemand?: OnDemand }): GetProfile =>
  async (handle, viewerUserId) => {
    const found = await d.profiles.findByHandle(handle);
    if (found) {
      return isRemoved(found) ? notFound() : ok(await d.assembler.detail(found, viewerUserId));
    }
    const od = d.onDemand;
    if (!od) return notFound();
    if (!od.limiter.tryTake(viewerUserId ?? 'anonymous')) {
      return err(
        new DomainError(
          'RATE_LIMITED',
          'Demasiadas consultas de perfiles nuevos, prueba más tarde',
        ),
      );
    }
    const ingested = await od.ingester.ingest(handle);
    if (!ingested.ok) {
      // El proveedor caído es un fallo real; el resto (privada, no profesional, bloqueada) no revela el motivo.
      return ingested.error.code === 'UPSTREAM_ERROR' ? ingested : notFound();
    }
    const created: Profile = {
      id: (od.newId ?? randomUUID)(),
      handle,
      role: 'creator',
      status: 'unclaimed',
      ownerUserId: null,
      declared: null,
    };
    try {
      await od.writer.save(created);
    } catch (e) {
      // Carrera: otra petición creó la misma ficha entre el findByHandle y el save (unique ig_handle). Respuesta
      // idempotente con la ficha existente y sin repetir el evento (ya lo publicó la ganadora).
      if (!(e instanceof DomainError && e.code === 'CONFLICT')) throw e;
      const winner = await d.profiles.findByHandle(handle);
      return winner && !isRemoved(winner)
        ? ok(await d.assembler.detail(winner, viewerUserId))
        : notFound();
    }
    // Se publica con el perfil ya creado: `ProfileIngested` de ingestion llegó antes y classification lo ignoró.
    od.bus.publish({
      type: 'ProfileIngested',
      igHandle: handle,
      snapshotId: ingested.value.snapshotId,
    });
    return ok(await d.assembler.detail(created, viewerUserId));
  };
