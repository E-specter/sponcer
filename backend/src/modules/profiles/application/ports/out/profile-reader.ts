import type { ProfileRole } from '@sponcer/contracts';
import type { Profile } from '../../../domain/profile';

export interface ProfileReader {
  findById(id: string): Promise<Profile | null>;
  findByHandle(handle: string): Promise<Profile | null>;
  listByOwner(userId: string): Promise<Profile[]>;
  listByRole(role: ProfileRole): Promise<Profile[]>;
}
