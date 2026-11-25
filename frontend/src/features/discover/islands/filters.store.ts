import { atom, map } from 'nanostores';
import type { FeedFilters } from '../api/feed';

export const EMPTY_FILTERS: FeedFilters = {
  niches: [],
  tiers: [],
  minEngagement: '',
  maxPricePen: '',
  minBudgetPen: '',
  city: '',
};

/** Filtros compartidos entre la isla del panel de filtros y la del feed (Nano Stores). */
export const filters = map<FeedFilters>({ ...EMPTY_FILTERS });

/** Búsqueda por nombre o interés: se aplica en el cliente sobre las tarjetas ya cargadas. */
export const searchQuery = atom('');
