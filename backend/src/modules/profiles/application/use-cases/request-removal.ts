import type { EventBus } from '../../../../shared/events/event-bus';
import { ok } from '../../../../shared/result';
import type { RequestProfileRemoval } from '../ports/in/profile-use-cases';
import type { ProfileReader } from '../ports/out/profile-reader';
import type { ProfileWriter } from '../ports/out/profile-writer';
import type { RemovalRequestStore } from '../ports/out/removal-request-store';

/**
 * Público (Ley 29733). Responde igual exista o no el perfil, para no revelar qué handles hay.
 * Solo el dueño verificado autenticado retira la ficha al instante; el resto queda `pending` (revisión manual).
 */
export const makeRequestRemoval =
  (d: {
    reader: ProfileReader;
    writer: ProfileWriter;
    requests: RemovalRequestStore;
    bus: EventBus;
    now: () => Date;
  }): RequestProfileRemoval =>
  async (handle, email, reason, viewerUserId) => {
    const profile = await d.reader.findByHandle(handle);
    const isOwner =
      !!profile &&
      viewerUserId !== null &&
      profile.ownerUserId === viewerUserId &&
      profile.status === 'verified';
    await d.requests.add({
      handle,
      email,
      reason,
      createdAt: d.now(),
      status: isOwner ? 'applied' : 'pending',
    });
    if (profile && isOwner) {
      await d.writer.save({ ...profile, status: 'removed' });
      d.bus.publish({ type: 'ProfileRemoved', profileId: profile.id, igHandle: profile.handle });
    }
    return ok({ ok: true });
  };
