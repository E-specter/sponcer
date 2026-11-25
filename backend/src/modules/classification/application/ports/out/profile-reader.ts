import type { Declared } from '@sponcer/contracts';

export interface ClassifiableProfile {
  id: string;
  handle: string;
  declared: Declared | null;
}

/** Perfiles a clasificar, leídos del slice profiles (vía su `ProfilesApi`). */
export interface ProfileReader {
  get(profileId: string): Promise<ClassifiableProfile | null>;
  findIdByHandle(handle: string): Promise<string | null>;
  listIds(): Promise<string[]>;
}
