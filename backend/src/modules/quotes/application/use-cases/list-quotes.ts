import { DomainError } from '../../../../shared/errors';
import { err } from '../../../../shared/result';
import type { ProfilesApi } from '../../../profiles';
import { toQuoteViews } from '../quote-view';
import type { ListQuotes } from '../ports/in/quotes-use-cases';
import type { QuoteRepository } from '../ports/out/quote-repository';

export const makeListQuotes =
  (d: { quotes: QuoteRepository; profiles: ProfilesApi }): ListQuotes =>
  async (userId, profileId) =>
    (await d.profiles.isOwner(profileId, userId))
      ? toQuoteViews(d.profiles, await d.quotes.listByProfile(profileId))
      : err(new DomainError('FORBIDDEN', 'El perfil no es tuyo'));
