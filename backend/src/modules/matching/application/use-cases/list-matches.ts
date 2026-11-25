import { DomainError } from '../../../../shared/errors';
import { err, ok } from '../../../../shared/result';
import type { ProfilesApi } from '../../../profiles';
import { decodeCursor, encodeCursor } from '../cursor';
import type { ListMatches } from '../ports/in/matching-use-cases';
import type { MatchRepository } from '../ports/out/match-repository';

export const makeListMatches =
  (d: {
    profiles: Pick<ProfilesApi, 'isOwner' | 'getCards'>;
    matches: MatchRepository;
  }): ListMatches =>
  async (userId, query) => {
    if (!(await d.profiles.isOwner(query.profileId, userId))) {
      return err(new DomainError('FORBIDDEN', 'El perfil no te pertenece'));
    }
    const offset = decodeCursor(query.cursor);
    if (offset === null) return err(new DomainError('VALIDATION_ERROR', 'Cursor inválido'));
    const records = await d.matches.listByProfile(query.profileId);
    const cards = await d.profiles.getCards(
      records.flatMap((m) => [m.creatorProfileId, m.brandProfileId]),
    );
    const byId = new Map(cards.map((c) => [c.id, c]));
    const all = records
      .map((m) => ({
        id: m.id,
        creator: byId.get(m.creatorProfileId),
        brand: byId.get(m.brandProfileId),
        createdAt: m.createdAt,
      }))
      // Un perfil removido deja de tener tarjeta: el match no se muestra.
      .flatMap((m) => (m.creator && m.brand ? [{ ...m, creator: m.creator, brand: m.brand }] : []))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
    const end = offset + query.limit;
    return ok({
      items: all.slice(offset, end),
      nextCursor: end < all.length ? encodeCursor(end) : null,
    });
  };
