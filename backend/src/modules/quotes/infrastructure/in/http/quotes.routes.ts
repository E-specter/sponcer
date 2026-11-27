import { Router } from 'express';
import { api } from '@sponcer/contracts';
import { registerEndpoint } from '../../../../../shared/http/register-endpoint';
import type {
  CreateCampaign,
  CreateQuote,
  GetCampaign,
  ListCampaigns,
  ListQuotes,
  TransitionQuote,
  UpdateCampaign,
} from '../../../application/ports/in/quotes-use-cases';

export interface QuotesUseCases {
  listQuotes: ListQuotes;
  createQuote: CreateQuote;
  transitionQuote: TransitionQuote;
  listCampaigns: ListCampaigns;
  getCampaign: GetCampaign;
  createCampaign: CreateCampaign;
  updateCampaign: UpdateCampaign;
}

export function createQuotesRouter(uc: QuotesUseCases): Router {
  const router = Router();
  registerEndpoint(router, api.listQuotes, ({ query, user }) =>
    uc.listQuotes(user.userId, query.profileId, query),
  );
  registerEndpoint(router, api.createQuote, ({ body, user }) => uc.createQuote(user.userId, body));
  registerEndpoint(router, api.transitionQuote, ({ params, body, user }) =>
    uc.transitionQuote(user.userId, params.quoteId, body),
  );
  registerEndpoint(router, api.listCampaigns, ({ query, user }) =>
    uc.listCampaigns(user.userId, query.profileId, query),
  );
  registerEndpoint(router, api.getCampaign, ({ params, query, user }) =>
    uc.getCampaign(user.userId, query.profileId, params.campaignId),
  );
  registerEndpoint(router, api.createCampaign, ({ body, user }) =>
    uc.createCampaign(user.userId, body),
  );
  registerEndpoint(router, api.updateCampaign, ({ params, body, user }) =>
    uc.updateCampaign(user.userId, params.campaignId, body),
  );
  return router;
}
