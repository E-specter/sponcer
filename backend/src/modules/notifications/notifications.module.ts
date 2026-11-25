import type { Router } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdapterMode } from '../../config/env';
import type { EventBus } from '../../shared/events/event-bus';
import type { ChatApi } from '../chat';
import type { ProfilesApi } from '../profiles';
import type { QuotesApi } from '../quotes';
import { subscribeNotificationObservers } from './application/event-handlers';
import {
  makeListNotifications,
  makeMarkAsRead,
} from './application/use-cases/notification-queries';
import { createNotificationsRouter } from './infrastructure/in/http/notifications.routes';
import { createMockNotificationRepository } from './infrastructure/out/mock/mock-adapters';
import { createSupabaseNotificationRepository } from './infrastructure/out/supabase/supabase-adapters';

export interface NotificationsModule {
  router: Router;
}

export function createNotificationsModule(deps: {
  adapter: AdapterMode;
  bus: EventBus;
  profiles: ProfilesApi;
  quotes: QuotesApi;
  chat: ChatApi;
  /** Requerido con `adapter: 'real'` (cliente service_role). */
  supabase?: SupabaseClient;
  now?: () => Date;
}): NotificationsModule {
  // Real: tabla `notifications`; el frontend las recibe por Supabase Realtime.
  if (deps.adapter === 'real' && !deps.supabase)
    throw new Error('ADAPTER_NOTIFICATIONS=real requiere el cliente Supabase');
  const now = deps.now ?? (() => new Date());
  const repo =
    deps.adapter === 'real' && deps.supabase
      ? createSupabaseNotificationRepository(deps.supabase)
      : createMockNotificationRepository();
  subscribeNotificationObservers({
    bus: deps.bus,
    repo,
    profiles: deps.profiles,
    quotes: deps.quotes,
    chat: deps.chat,
    now,
  });
  return {
    router: createNotificationsRouter({
      list: makeListNotifications({ repo }),
      markRead: makeMarkAsRead({ repo, now }),
    }),
  };
}
