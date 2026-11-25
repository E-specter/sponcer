import { DomainError } from '../../../../shared/errors';
import { err, ok } from '../../../../shared/result';
import type { ProfilesApi } from '../../../profiles';
import { participantsOf } from '../../domain/match-ref';
import type { ListMessages } from '../ports/in/chat-use-cases';
import type { MatchReader, MessageRepository } from '../ports/out/chat-ports';

const DECIMAL = 10;
// shortcut: cursor = offset numérico; si llegan mensajes nuevos entre páginas se desplaza, pasar a cursor por (createdAt,id) con la BD real.
const parseOffset = (cursor: string | undefined): number => {
  const n = Number.parseInt(cursor ?? '', DECIMAL);
  return Number.isNaN(n) || n < 0 ? 0 : n;
};

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

    const offset = parseOffset(q.cursor);
    const { items, total } = await d.messages.listByMatch(matchId, offset, q.limit);
    const next = offset + items.length;
    return ok({ items, nextCursor: next < total ? String(next) : null });
  };
