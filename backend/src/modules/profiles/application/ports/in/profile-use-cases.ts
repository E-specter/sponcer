import type { Declared, ProfileDetail, Service, ServiceInput } from '@sponcer/contracts';
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
