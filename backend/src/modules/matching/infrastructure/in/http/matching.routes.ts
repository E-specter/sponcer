import { Router } from 'express';
import { api } from '@sponcer/contracts';
import { registerEndpoint } from '../../../../../shared/http/register-endpoint';
import type {
  GetFeed,
  Interact,
  ListMatches,
} from '../../../application/ports/in/matching-use-cases';
import type {
  GetVisibilitySummary,
  ListVisibility,
  RecordProfileView,
} from '../../../application/ports/in/visibility-use-cases';

export interface MatchingUseCases {
  getFeed: GetFeed;
  interact: Interact;
  listMatches: ListMatches;
  visibilitySummary: GetVisibilitySummary;
  listVisibility: ListVisibility;
  recordProfileView: RecordProfileView;
}

export function createMatchingRouter(uc: MatchingUseCases): Router {
  const router = Router();
  registerEndpoint(router, api.feed, ({ query, user }) => uc.getFeed(user.userId, query));
  registerEndpoint(router, api.interact, ({ body, user }) => uc.interact(user.userId, body));
  registerEndpoint(router, api.matches, ({ query, user }) => uc.listMatches(user.userId, query));
  registerEndpoint(router, api.visibilitySummary, ({ query, user }) =>
    uc.visibilitySummary(user.userId, query),
  );
  registerEndpoint(router, api.visibility, ({ query, user }) =>
    uc.listVisibility(user.userId, query),
  );
  registerEndpoint(router, api.recordProfileView, ({ params, body, user }) =>
    uc.recordProfileView(user, params.profileId, body),
  );
  return router;
}
