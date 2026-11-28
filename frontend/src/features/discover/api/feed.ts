import { CITIES, type InteractionRequest, type Niche, type Tier } from '@sponcer/contracts';
import { callBff } from '../../../lib/api/bff';

export interface FeedFilters {
  niches: Niche[];
  tiers: Tier[];
  minEngagement: string;
  maxPricePen: string;
  minBudgetPen: string;
  /** Ciudad del catálogo; vacío = todas. */
  city: string;
}

const orUndefined = (s: string) => (s.trim() === '' ? undefined : s);

export const loadFeed = (
  profileId: string,
  f: FeedFilters,
  q: string,
  cursor?: string,
  includeInteracted?: boolean,
) =>
  callBff('feed', {
    query: {
      profileId,
      cursor,
      q: orUndefined(q),
      includeInteracted: includeInteracted ? 'true' : undefined,
      city: CITIES.find((c) => c === f.city),
      niches: f.niches.length ? f.niches.join(',') : undefined,
      tiers: f.tiers.length ? f.tiers.join(',') : undefined,
      minEngagement: orUndefined(f.minEngagement),
      maxPricePen: orUndefined(f.maxPricePen),
      minBudgetPen: orUndefined(f.minBudgetPen),
    },
  });

export const interact = (body: InteractionRequest) => callBff('interact', { body });
