import type { VerifyClaimResult } from '@sponcer/contracts';
import { DomainError } from '../../../../shared/errors';
import type { EventBus } from '../../../../shared/events/event-bus';
import { err, ok } from '../../../../shared/result';
import type { ProfilesApi } from '../../../profiles';
import { bioContainsCode, isExpired } from '../../domain/claim';
import { hashCode } from '../code-hash';
import type { ConfirmProfileClaim } from '../ports/in/auth-use-cases';
import type { ClaimStore } from '../ports/out/claim-store';
import type { LiveBioReader } from '../ports/out/live-bio-reader';

const done = (r: VerifyClaimResult) => ok(r);

export const makeConfirmProfileClaim =
  (d: {
    claims: ClaimStore;
    liveBio: LiveBioReader;
    profiles: ProfilesApi;
    bus: EventBus;
    now: () => Date;
  }): ConfirmProfileClaim =>
  async (userId, claimId) => {
    const claim = await d.claims.findById(claimId);
    if (!claim || claim.userId !== userId || claim.consumed) {
      return err(new DomainError('NOT_FOUND', 'Reclamo no encontrado'));
    }

    const now = d.now();
    // Atómico y ANTES de la lectura en vivo (que cuesta dinero): una ráfaga no supera el límite.
    if (!(await d.claims.tryRecordAttempt(userId, now))) {
      return err(
        new DomainError('RATE_LIMITED', 'Demasiados intentos de verificación, prueba en una hora'),
      );
    }

    if (isExpired(claim, now)) return done({ status: 'expired' });

    const bio = await d.liveBio.read(claim.handle);
    if (!bio.ok) return bio;
    if (bio.value.isPrivate) return done({ status: 'not_eligible', reason: 'private' });
    if (!bio.value.isBusiness) return done({ status: 'not_eligible', reason: 'not_professional' });
    if (!bioContainsCode(bio.value.biography, claim.codeHash, hashCode))
      return done({ status: 'code_not_found' });

    const claimed = await d.profiles.claimProfile(claim.handle, userId, claim.role);
    if (!claimed.ok) {
      if (claimed.error.code !== 'CONFLICT') return claimed;
      const removed =
        (claimed.error.details as { reason?: string } | undefined)?.reason === 'removed';
      return done(
        removed ? { status: 'not_eligible', reason: 'removed' } : { status: 'already_owned' },
      );
    }
    await d.claims.markConsumed(claim.id);
    d.bus.publish({ type: 'ProfileVerified', igHandle: claim.handle, userId, role: claim.role });
    return done({ status: 'verified', profileId: claimed.value.profileId });
  };
