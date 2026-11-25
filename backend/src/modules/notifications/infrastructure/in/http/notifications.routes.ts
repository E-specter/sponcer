import { Router } from 'express';
import { api } from '@sponcer/contracts';
import { registerEndpoint } from '../../../../../shared/http/register-endpoint';
import type {
  ListNotifications,
  MarkAsRead,
} from '../../../application/ports/in/notification-use-cases';

export function createNotificationsRouter(uc: {
  list: ListNotifications;
  markRead: MarkAsRead;
}): Router {
  const router = Router();
  registerEndpoint(router, api.notifications, ({ query, user }) => uc.list(user.userId, query));
  registerEndpoint(router, api.markNotificationRead, ({ params, user }) =>
    uc.markRead(user.userId, params.notificationId),
  );
  return router;
}
