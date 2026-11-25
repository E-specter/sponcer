import type { RemovalRequestItem } from '@sponcer/contracts';
import { decodeCursor, encodeCursor } from '../../../../shared/cursor';
import { DomainError } from '../../../../shared/errors';
import type { EventBus } from '../../../../shared/events/event-bus';
import { err, ok } from '../../../../shared/result';
import { isRemoved } from '../../domain/profile';
import type { ProfileAssembler } from '../profile-assembler';
import type { AdminListRemovals, AdminReviewRemoval } from '../ports/in/profile-use-cases';
import type { ProfileReader } from '../ports/out/profile-reader';
import type { ProfileWriter } from '../ports/out/profile-writer';
import type { RemovalRequestStore, StoredRemovalRequest } from '../ports/out/removal-request-store';

/** `ProfileRemoved` exige `profileId`: sin ficha (handle nunca ingerido) se usa el uuid nulo; solo importa `igHandle`. */
const NO_PROFILE_ID = '00000000-0000-0000-0000-000000000000';

interface Deps {
  requests: RemovalRequestStore;
  reader: ProfileReader;
  assembler: ProfileAssembler;
}

const toItem = async (d: Deps, r: StoredRemovalRequest): Promise<RemovalRequestItem> => {
  const profile = await d.reader.findByHandle(r.handle);
  return {
    id: r.id,
    igHandle: r.handle,
    email: r.email,
    reason: r.reason,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    reviewNote: r.reviewNote,
    profile: profile ? await d.assembler.summary(profile) : null,
  };
};

/** La autorización (solo administradores) la aplica el borde HTTP antes de llamar a estos casos de uso. */
export const makeAdminListRemovals =
  (d: Deps): AdminListRemovals =>
  async (q) => {
    const parsed = decodeCursor(q.cursor);
    if (!parsed.ok) return parsed;
    const offset = parsed.value;
    const { items, total } = await d.requests.list({ status: q.status, offset, limit: q.limit });
    const next = offset + items.length;
    return ok({
      items: await Promise.all(items.map((r) => toItem(d, r))),
      nextCursor: next < total ? encodeCursor(next) : null,
    });
  };

export const makeAdminReviewRemoval =
  (d: Deps & { writer: ProfileWriter; bus: EventBus; now: () => Date }): AdminReviewRemoval =>
  async (adminUserId, requestId, req) => {
    const request = await d.requests.findById(requestId);
    if (!request) return err(new DomainError('NOT_FOUND', 'Pedido no encontrado'));
    // Se reserva la revisión primero (atómico): dos administradores no aplican el mismo pedido dos veces.
    const claimed = await d.requests.review(requestId, {
      status: req.decision === 'apply' ? 'applied' : 'rejected',
      at: d.now(),
      by: adminUserId,
      note: req.note,
    });
    if (!claimed) return err(new DomainError('CONFLICT', 'El pedido ya fue revisado'));

    if (req.decision === 'apply') {
      const profile = await d.reader.findByHandle(request.handle);
      if (profile && !isRemoved(profile)) await d.writer.save({ ...profile, status: 'removed' });
      // Aunque no haya ficha, el evento bloquea el handle en ingestion (y borra datos ingeridos).
      d.bus.publish({
        type: 'ProfileRemoved',
        profileId: profile?.id ?? NO_PROFILE_ID,
        igHandle: request.handle,
      });
    }
    return ok(await toItem(d, (await d.requests.findById(requestId)) as StoredRemovalRequest));
  };
