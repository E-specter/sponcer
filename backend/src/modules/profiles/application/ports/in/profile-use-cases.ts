import type {
  Declared,
  ProfileDetail,
  ProfileRole,
  RemovalRequestItem,
  RemovalStatus,
  ReviewRemovalRequest,
  Service,
  ServiceInput,
} from '@sponcer/contracts';
import type { DomainError } from '../../../../../shared/errors';
import type { Result } from '../../../../../shared/result';

type R<T> = Promise<Result<T, DomainError>>;

export type GetProfile = (handle: string, viewerUserId: string | null) => R<ProfileDetail>;
export type UpdateDeclaredData = (
  userId: string,
  profileId: string,
  declared: Declared,
) => R<ProfileDetail>;
export type ManageServices = (
  userId: string,
  profileId: string,
  services: ServiceInput[],
) => R<Service[]>;
export type RequestProfileRemoval = (
  handle: string,
  email: string,
  reason: string | undefined,
  viewerUserId: string | null,
) => R<{ ok: true }>;

export type AdminListRemovals = (q: {
  status?: RemovalStatus;
  cursor?: string;
  limit: number;
}) => R<{ items: RemovalRequestItem[]; nextCursor: string | null }>;
export type AdminReviewRemoval = (
  adminUserId: string,
  requestId: string,
  req: ReviewRemovalRequest,
) => R<RemovalRequestItem>;

export type AdminAddProfile = (
  adminEmail: string,
  handle: string,
  role: ProfileRole,
) => R<ProfileDetail>;
