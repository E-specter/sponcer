import type { Router } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdapterMode } from '../../config/env';
import type { EventBus } from '../../shared/events/event-bus';
import type { ProfilesApi } from '../profiles';
import type { QuotesApi } from './application/ports/in/quotes-use-cases';
import { makeCreateQuote } from './application/use-cases/create-quote';
import { makeListQuotes } from './application/use-cases/list-quotes';
import { makeTransitionQuote } from './application/use-cases/transition-quote';
import { createQuotesRouter } from './infrastructure/in/http/quotes.routes';
import { createMockQuoteRepository } from './infrastructure/out/mock/mock-adapters';
import { createSupabaseQuoteRepository } from './infrastructure/out/supabase/supabase-adapters';

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
  const quotes =
    deps.adapter === 'real' && deps.supabase
      ? createSupabaseQuoteRepository(deps.supabase)
      : createMockQuoteRepository();
  const d = { quotes, profiles: deps.profiles, bus: deps.bus, now };
  return {
    api: { getQuote: (id) => quotes.findById(id) },
    router: createQuotesRouter({
      listQuotes: makeListQuotes(d),
      createQuote: makeCreateQuote(d),
      transitionQuote: makeTransitionQuote(d),
    }),
  };
}
