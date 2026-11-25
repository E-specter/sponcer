import type {
  ProfileCard,
  ProfileDetail,
  ProfileRole,
  ProfileSummary,
  Service,
} from '@sponcer/contracts';
import type { DomainError } from '../../../../../shared/errors';
import type { Result } from '../../../../../shared/result';

/** API pública del slice para otros slices (auth, matching, quotes...). */
export interface ProfilesApi {
  getById(id: string, viewerUserId?: string | null): Promise<Result<ProfileDetail, DomainError>>;
  getCards(ids: string[]): Promise<ProfileCard[]>;
  listByOwner(userId: string): Promise<ProfileSummary[]>;
  isOwner(profileId: string, userId: string): Promise<boolean>;
  /** Usuario dueño del perfil (null si no existe o no está reclamado). */
  getOwnerUserId(profileId: string): Promise<string | null>;
  /** Servicio y el perfil creador al que pertenece. */
  getService(serviceId: string): Promise<{ service: Service; creatorProfileId: string } | null>;
  /** Crea o reclama el perfil del handle. CONFLICT si ya tiene otro dueño. */
  claimProfile(
    handle: string,
    userId: string,
    role: ProfileRole,
  ): Promise<Result<{ profileId: string }, DomainError>>;
  /** Perfiles no removidos de un rol, para el matching. */
  listCandidates(role: ProfileRole): Promise<ProfileCard[]>;
}
