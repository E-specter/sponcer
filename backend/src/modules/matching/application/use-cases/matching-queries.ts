import type { ProfilesApi } from '../../../profiles';
import type { MatchingApi } from '../ports/in/matching-api';
import type { MatchRepository } from '../ports/out/match-repository';

export const makeMatchingQueries = (d: {
  matches: MatchRepository;
  profiles: Pick<ProfilesApi, 'isOwner'>;
}): MatchingApi => ({
  getMatch: (matchId) => d.matches.getById(matchId),
  async isParticipant(matchId, userId) {
    const m = await d.matches.getById(matchId);
    if (!m) return false;
    const owners = await Promise.all(
      [m.creatorProfileId, m.brandProfileId].map((id) => d.profiles.isOwner(id, userId)),
    );
    return owners.some(Boolean);
  },
});
