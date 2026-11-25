import { CLAIM_TTL_MINUTES } from '@sponcer/contracts';
import { ok } from '../../../../shared/result';
import { generateClaimCode } from '../../domain/claim';
import { hashCode } from '../code-hash';
import type { StartProfileClaim } from '../ports/in/auth-use-cases';
import type { ClaimStore } from '../ports/out/claim-store';

const MS_PER_MINUTE = 60_000;

export const makeStartProfileClaim =
  (d: {
    claims: ClaimStore;
    now: () => Date;
    randomIndex: (max: number) => number;
    newId: () => string;
  }): StartProfileClaim =>
  async (userId, { handle, role }) => {
    const code = generateClaimCode(d.randomIndex);
    const expiresAt = new Date(d.now().getTime() + CLAIM_TTL_MINUTES * MS_PER_MINUTE);
    const id = d.newId();
    await d.claims.save({
      id,
      userId,
      handle,
      role,
      codeHash: hashCode(code),
      expiresAt,
      consumed: false,
    });
    return ok({ claimId: id, handle, role, code, expiresAt: expiresAt.toISOString() });
  };
