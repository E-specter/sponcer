import { Router } from 'express';
import { api } from '@sponcer/contracts';
import { registerEndpoint } from '../../../../../shared/http/register-endpoint';
import type { ListMessages, SendMessage } from '../../../application/ports/in/chat-use-cases';

export function createChatRouter(uc: {
  listMessages: ListMessages;
  sendMessage: SendMessage;
}): Router {
  const router = Router();
  registerEndpoint(router, api.listMessages, ({ params, query, user }) =>
    uc.listMessages(user.userId, params.matchId, query),
  );
  registerEndpoint(router, api.sendMessage, ({ params, body, user }) =>
    uc.sendMessage(user.userId, params.matchId, body),
  );
  return router;
}
