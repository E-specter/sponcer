import type {
  Claim,
  Me,
  RegisterRequest,
  StartClaimRequest,
  VerifyClaimResult,
} from '@sponcer/contracts';
import type { DomainError } from '../../../../../shared/errors';
import type { AuthUser } from '../../../../../shared/http/types';
import type { Result } from '../../../../../shared/result';

type R<T> = Promise<Result<T, DomainError>>;

export type GetCurrentUser = (user: AuthUser) => R<Me>;
export type RegisterAccount = (user: AuthUser, req: RegisterRequest) => R<Me>;
export type StartProfileClaim = (userId: string, req: StartClaimRequest) => R<Claim>;
export type ConfirmProfileClaim = (userId: string, claimId: string) => R<VerifyClaimResult>;
