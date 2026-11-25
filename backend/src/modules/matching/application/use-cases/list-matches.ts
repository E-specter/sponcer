import { DomainError } from '../../../../shared/errors';
import { err, ok } from '../../../../shared/result';
import type { ProfilesApi } from '../../../profiles';
import type { ListMatches } from '../ports/in/matching-use-cases';
import type { MatchRepository } from '../ports/out/match-repository';

export const makeListMatches =
  (d: {
    profiles: Pick<ProfilesApi, 'isOwner' | 'getCards'>;
    matches: MatchRepository;
  }): ListMatches =>
  async (userId, profileId) => {
    if (!(await d.profiles.isOwner(profileId, userId))) {
      return err(new DomainError('FORBIDDEN', 'El perfil no te pertenece'));
    }
    const records = await d.matches.listByProfile(profileId);
    const cards = await d.profiles.getCards(
      records.flatMap((m) => [m.creatorProfileId, m.brandProfileId]),
    );
    const byId = new Map(cards.map((c) => [c.id, c]));
    return ok(
      records
        .map((m) => ({
          id: m.id,
          creator: byId.get(m.creatorProfileId),
          brand: byId.get(m.brandProfileId),
          createdAt: m.createdAt,
        }))
        // Un perfil removido deja de tener tarjeta: el match no se muestra.
        .flatMap((m) =>
          m.creator && m.brand ? [{ ...m, creator: m.creator, brand: m.brand }] : [],
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  };
