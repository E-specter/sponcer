/** Lo mínimo que chat necesita saber de un match (lo provee matching). */
export interface MatchRef {
  id: string;
  creatorProfileId: string;
  brandProfileId: string;
}

export const participantsOf = (m: MatchRef): string[] => [m.creatorProfileId, m.brandProfileId];

export const isParticipant = (m: MatchRef, profileId: string): boolean =>
  participantsOf(m).includes(profileId);
