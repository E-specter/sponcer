import { Router } from 'express';
import { api } from '@sponcer/contracts';
import { registerEndpoint } from '../../../../../shared/http/register-endpoint';
import type {
  CreateQuote,
  ListQuotes,
  TransitionQuote,
} from '../../../application/ports/in/quotes-use-cases';

export interface QuotesUseCases {
  listQuotes: ListQuotes;
  createQuote: CreateQuote;
  transitionQuote: TransitionQuote;
}

export function createQuotesRouter(uc: QuotesUseCases): Router {
  const router = Router();
  registerEndpoint(router, api.listQuotes, ({ query, user }) =>
    uc.listQuotes(user.userId, query.profileId),
  );
  registerEndpoint(router, api.createQuote, ({ body, user }) => uc.createQuote(user.userId, body));
  registerEndpoint(router, api.transitionQuote, ({ params, body, user }) =>
    uc.transitionQuote(user.userId, params.quoteId, body),
  );
  return router;
}
