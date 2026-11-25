import type { InteractionRequest, Niche, Tier } from '@sponcer/contracts';
import { callBff } from '../../../lib/api/bff';

export interface FeedFilters {
  niches: Niche[];
  tiers: Tier[];
  minEngagement: string;
  maxPricePen: string;
  minBudgetPen: string;
}

const orUndefined = (s: string) => (s.trim() === '' ? undefined : s);

export const loadFeed = (profileId: string, f: FeedFilters, cursor?: string) =>
  callBff('feed', {
    query: {
      profileId,
      cursor,
      niches: f.niches.length ? f.niches.join(',') : undefined,
      tiers: f.tiers.length ? f.tiers.join(',') : undefined,
      minEngagement: orUndefined(f.minEngagement),
      maxPricePen: orUndefined(f.maxPricePen),
      minBudgetPen: orUndefined(f.minBudgetPen),
    },
  });

export const interact = (body: InteractionRequest) => callBff('interact', { body });
