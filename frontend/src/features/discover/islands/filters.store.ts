import { map } from 'nanostores';
import type { FeedFilters } from '../api/feed';

export const EMPTY_FILTERS: FeedFilters = {
  niches: [],
  tiers: [],
  minEngagement: '',
  maxPricePen: '',
  minBudgetPen: '',
};

/** Filtros compartidos entre la isla del panel de filtros y la del feed (Nano Stores). */
export const filters = map<FeedFilters>({ ...EMPTY_FILTERS });
