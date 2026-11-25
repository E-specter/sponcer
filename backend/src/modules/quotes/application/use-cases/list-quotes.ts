import { decodeCursor, encodeCursor } from '../../../../shared/cursor';
import { DomainError } from '../../../../shared/errors';
import { err, ok } from '../../../../shared/result';
import type { ProfilesApi } from '../../../profiles';
import { toQuoteViews } from '../quote-view';
import type { ListQuotes } from '../ports/in/quotes-use-cases';
import type { QuoteRepository } from '../ports/out/quote-repository';

/** Más reciente primero (por creación, desempate por id para un orden estable). */
export const makeListQuotes =
  (d: { quotes: QuoteRepository; profiles: ProfilesApi }): ListQuotes =>
  async (userId, profileId, pageQuery) => {
    if (!(await d.profiles.isOwner(profileId, userId))) {
      return err(new DomainError('FORBIDDEN', 'El perfil no es tuyo'));
    }
    const all = (await d.quotes.listByProfile(profileId)).sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
    );
    const parsed = decodeCursor(pageQuery.cursor);
    if (!parsed.ok) return parsed;
    const offset = parsed.value;
    const slice = all.slice(offset, offset + pageQuery.limit);
    const views = await toQuoteViews(d.profiles, slice);
    if (!views.ok) return views;
    const next = offset + slice.length;
    return ok({ items: views.value, nextCursor: next < all.length ? encodeCursor(next) : null });
  };
