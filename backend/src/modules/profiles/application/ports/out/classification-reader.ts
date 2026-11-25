import type { Classification } from '@sponcer/contracts';

/** En F2 lo implementa el slice classification. */
export interface ClassificationReader {
  getByProfileId(profileId: string): Promise<Classification | null>;
}
