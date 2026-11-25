import type { Profile } from '../../../domain/profile';

export interface ProfileWriter {
  /** Crea o reemplaza el perfil (por id). */
  save(profile: Profile): Promise<void>;
}
