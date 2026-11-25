import type { MatchRecord } from '../../../domain/candidate';

/** API pública del slice para chat (y quotes si lo necesita). */
export interface MatchingApi {
  getMatch(matchId: string): Promise<MatchRecord | null>;
  /** `true` si `userId` es dueño de alguno de los dos perfiles del match. */
  isParticipant(matchId: string, userId: string): Promise<boolean>;
}
