import { z } from 'zod';
import { Account } from './accounts';
import { ProfileRole } from './catalogs';
import { Id, IgHandle, IsoDate } from './common';
import { ProfileSummary } from './profiles';

/** `account.accountKind === null` = registro pendiente. Una cuenta Empresa solo tiene perfiles `brand`; una Influencer, solo `creator`. */
export const Me = z.object({
  userId: Id,
  email: z.email(),
  account: Account,
  profiles: z.array(ProfileSummary),
  /** Puede revisar pedidos de exclusión (ADMIN_EMAILS en el backend). */
  isAdmin: z.boolean(),
});
export type Me = z.infer<typeof Me>;

// Código que el usuario pega en su bio (ADR-002): "sponcer-" + 6 caracteres sin ambiguos (sin 0/O, 1/I/L).
// Acepta "sponcer-K7M2QX" (también dentro de una bio más larga); rechaza "sponcer-K0M2QX" (tiene 0).
// Probar: https://regex101.com/?regex=sponcer-%5BA-HJKMNP-Z2-9%5D%7B6%7D&testString=hola+sponcer-K7M2QX&flavor=javascript
export const CLAIM_CODE_REGEX = /sponcer-[A-HJKMNP-Z2-9]{6}/;
export const CLAIM_TTL_MINUTES = 30;
export const CLAIM_MAX_ATTEMPTS_PER_HOUR = 5;

export const StartClaimRequest = z.object({ handle: IgHandle, role: ProfileRole });
export type StartClaimRequest = z.infer<typeof StartClaimRequest>;

export const Claim = z.object({
  claimId: Id,
  handle: IgHandle,
  role: ProfileRole,
  code: z.string().regex(CLAIM_CODE_REGEX),
  expiresAt: IsoDate,
});
export type Claim = z.infer<typeof Claim>;

export const VerifyClaimResult = z.discriminatedUnion('status', [
  z.object({ status: z.literal('verified'), profileId: Id }),
  z.object({ status: z.literal('code_not_found') }),
  z.object({ status: z.literal('expired') }),
  z.object({
    status: z.literal('not_eligible'),
    reason: z.enum(['private', 'not_professional', 'removed']),
  }),
  z.object({ status: z.literal('already_owned') }),
]);
export type VerifyClaimResult = z.infer<typeof VerifyClaimResult>;
