import type {
  RecordViewRequest,
  VisibilityItem,
  VisibilityQuery,
  VisibilitySummary,
} from '@sponcer/contracts';
import type { DomainError } from '../../../../../shared/errors';
import type { AuthUser } from '../../../../../shared/http/types';
import type { Result } from '../../../../../shared/result';

export type GetVisibilitySummary = (
  userId: string,
  query: { profileId: string },
) => Promise<Result<VisibilitySummary, DomainError>>;

export type ListVisibility = (
  userId: string,
  query: VisibilityQuery,
) => Promise<Result<{ items: VisibilityItem[]; nextCursor: string | null }, DomainError>>;

export type RecordProfileView = (
  user: AuthUser,
  viewedProfileId: string,
  req: RecordViewRequest,
) => Promise<Result<{ recorded: boolean }, DomainError>>;
