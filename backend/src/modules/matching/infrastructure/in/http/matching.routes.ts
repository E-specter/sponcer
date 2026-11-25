import { Router } from 'express';
import { api } from '@sponcer/contracts';
import { registerEndpoint } from '../../../../../shared/http/register-endpoint';
import type {
  GetFeed,
  Interact,
  ListMatches,
} from '../../../application/ports/in/matching-use-cases';

export interface MatchingUseCases {
  getFeed: GetFeed;
  interact: Interact;
  listMatches: ListMatches;
}

export function createMatchingRouter(uc: MatchingUseCases): Router {
  const router = Router();
  registerEndpoint(router, api.feed, ({ query, user }) => uc.getFeed(user.userId, query));
  registerEndpoint(router, api.interact, ({ body, user }) => uc.interact(user.userId, body));
  registerEndpoint(router, api.matches, ({ query, user }) =>
    uc.listMatches(user.userId, query.profileId),
  );
  return router;
}
