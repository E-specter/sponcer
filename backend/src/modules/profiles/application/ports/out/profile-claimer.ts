import type { ProfileRole } from '@sponcer/contracts';

export type ClaimOutcome =
  { status: 'claimed'; profileId: string } | { status: 'owned' | 'removed' };

/** Reclamo condicional y atómico: crea la ficha o la asigna solo si está libre y no fue retirada. */
export interface ProfileClaimer {
  claim(handle: string, userId: string, role: ProfileRole): Promise<ClaimOutcome>;
}
