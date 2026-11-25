import { decodeCursor, encodeCursor } from '../../../../shared/cursor';
import { DomainError } from '../../../../shared/errors';
import { err, ok } from '../../../../shared/result';
import type { ProfilesApi } from '../../../profiles';
import { participantsOf } from '../../domain/match-ref';
import type { ListMessages } from '../ports/in/chat-use-cases';
import type { MatchReader, MessageRepository } from '../ports/out/chat-ports';

export const makeListMessages =
  (d: { matches: MatchReader; messages: MessageRepository; profiles: ProfilesApi }): ListMessages =>
  async (userId, matchId, q) => {
    const match = await d.matches.findById(matchId);
    if (!match) return err(new DomainError('NOT_FOUND', 'Match no encontrado'));
    const owns = await Promise.all(
      participantsOf(match).map((id) => d.profiles.isOwner(id, userId)),
    );
    if (!owns.some(Boolean))
      return err(new DomainError('FORBIDDEN', 'No participas en este match'));

    const parsed = decodeCursor(q.cursor);
    if (!parsed.ok) return parsed;
    const offset = parsed.value;
    const { items, total } = await d.messages.listByMatch(matchId, offset, q.limit);
    const next = offset + items.length;
    return ok({ items, nextCursor: next < total ? encodeCursor(next) : null });
  };
