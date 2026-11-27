import { CLAIM_TTL_MINUTES } from '@sponcer/contracts';
import { DomainError } from '../../../../shared/errors';
import { err, ok } from '../../../../shared/result';
import { generateClaimCode } from '../../domain/claim';
import { hashCode } from '../code-hash';
import type { StartProfileClaim } from '../ports/in/auth-use-cases';
import type { AccountStore } from '../ports/out/account-store';
import type { ClaimStore } from '../ports/out/claim-store';

const MS_PER_MINUTE = 60_000;

/** Una cuenta Empresa solo reclama marcas y una Influencer solo creadores (ADR-009). */
const ROLE_OF = { company: 'brand', influencer: 'creator' } as const;

export const makeStartProfileClaim =
  (d: {
    claims: ClaimStore;
    accounts: AccountStore;
    now: () => Date;
    randomIndex: (max: number) => number;
    newId: () => string;
  }): StartProfileClaim =>
  async (userId, { handle, role }) => {
    const { accountKind } = await d.accounts.get(userId);
    if (!accountKind)
      return err(
        new DomainError('FORBIDDEN', 'Completa tu registro antes de reclamar un perfil', {
          reason: 'registration_required',
        }),
      );
    if (ROLE_OF[accountKind] !== role)
      return err(
        new DomainError(
          'VALIDATION_ERROR',
          accountKind === 'company'
            ? 'Una cuenta Empresa solo reclama marcas'
            : 'Una cuenta Influencer solo reclama cuentas de creador',
          { reason: 'role_mismatch', expected: ROLE_OF[accountKind] },
        ),
      );
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
