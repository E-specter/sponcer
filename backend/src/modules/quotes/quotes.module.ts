import type { Router } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { QUOTES_PER_BRAND_PER_HOUR } from '@sponcer/contracts';
import type { AdapterMode } from '../../config/env';
import type { EventBus } from '../../shared/events/event-bus';
import { createWindowLimiter } from '../../shared/rate-limit';
import type { ProfilesApi } from '../profiles';
import type { QuotesApi } from './application/ports/in/quotes-use-cases';
import {
  makeCreateCampaign,
  makeGetCampaign,
  makeListCampaigns,
  makeUpdateCampaign,
} from './application/use-cases/campaign-use-cases';
import { makeCreateQuote } from './application/use-cases/create-quote';
import { makeListQuotes } from './application/use-cases/list-quotes';
import { makeTransitionQuote } from './application/use-cases/transition-quote';
import { createQuotesRouter } from './infrastructure/in/http/quotes.routes';
import {
  createMockCampaignRepository,
  createMockQuoteRepository,
} from './infrastructure/out/mock/mock-adapters';
import {
  createSupabaseCampaignRepository,
  createSupabaseQuoteRepository,
} from './infrastructure/out/supabase/supabase-adapters';

const HOUR_MS = 3_600_000;

export interface QuotesModule {
  api: QuotesApi;
  router: Router;
}

export function createQuotesModule(deps: {
  adapter: AdapterMode;
  bus: EventBus;
  profiles: ProfilesApi;
  /** Requerido con `adapter: 'real'` (cliente service_role). */
  supabase?: SupabaseClient;
  now?: () => Date;
}): QuotesModule {
  if (deps.adapter === 'real' && !deps.supabase)
    throw new Error('ADAPTER_QUOTES=real requiere el cliente Supabase');
  const now = deps.now ?? (() => new Date());
  const real = deps.adapter === 'real' && deps.supabase;
  const quotes = real ? createSupabaseQuoteRepository(real) : createMockQuoteRepository();
  const campaigns = real ? createSupabaseCampaignRepository(real) : createMockCampaignRepository();
  const limiter = createWindowLimiter({ limit: QUOTES_PER_BRAND_PER_HOUR, windowMs: HOUR_MS, now });
  const d = { quotes, campaigns, profiles: deps.profiles, bus: deps.bus, now, limiter };
  return {
    api: { getQuote: (id) => quotes.findById(id) },
    router: createQuotesRouter({
      listQuotes: makeListQuotes(d),
      createQuote: makeCreateQuote(d),
      transitionQuote: makeTransitionQuote(d),
      listCampaigns: makeListCampaigns(d),
      getCampaign: makeGetCampaign(d),
      createCampaign: makeCreateCampaign(d),
      updateCampaign: makeUpdateCampaign(d),
    }),
  };
}
