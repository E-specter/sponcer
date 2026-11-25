import type { Router } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdapterMode } from '../../config/env';
import type { EventBus } from '../../shared/events/event-bus';
import type { ProfilesApi } from '../profiles';
import type { ChatApi } from './application/ports/in/chat-use-cases';
import type { MatchReader } from './application/ports/out/chat-ports';
import { makeListMessages } from './application/use-cases/list-messages';
import { makeSendMessage } from './application/use-cases/send-message';
import { createChatRouter } from './infrastructure/in/http/chat.routes';
import {
  createMockMatchReader,
  createMockMessageRepository,
  createMockRealtimeGateway,
} from './infrastructure/out/mock/mock-adapters';
import { createSupabaseRealtimeGateway } from './infrastructure/out/supabase-realtime-gateway';
import { createSupabaseMessageRepository } from './infrastructure/out/supabase/supabase-message-repository';

export interface ChatModule {
  api: ChatApi;
  router: Router;
}

export function createChatModule(deps: {
  adapter: AdapterMode;
  bus: EventBus;
  profiles: ProfilesApi;
  /** Integración: adaptador sobre `MatchingApi`. Si falta, se usa el mock alimentado por `MatchCreated`. */
  matches?: MatchReader;
  /** Requerido con `adapter: 'real'` (cliente service_role). */
  supabase?: SupabaseClient;
  now?: () => Date;
}): ChatModule {
  const supabase = deps.adapter === 'real' ? deps.supabase : undefined;
  if (deps.adapter === 'real' && !supabase)
    throw new Error('ADAPTER_CHAT=real requiere el cliente Supabase');
  const now = deps.now ?? (() => new Date());
  const mockMatches = createMockMatchReader();
  const matches = deps.matches ?? mockMatches;
  if (!deps.matches) {
    deps.bus.subscribe('MatchCreated', (e) =>
      mockMatches.register({
        id: e.matchId,
        creatorProfileId: e.creatorProfileId,
        brandProfileId: e.brandProfileId,
      }),
    );
  }
  const messages = supabase
    ? createSupabaseMessageRepository(supabase)
    : createMockMessageRepository();
  const d = { matches, messages, profiles: deps.profiles };
  return {
    api: { getMatch: (id) => matches.findById(id) },
    router: createChatRouter({
      listMessages: makeListMessages(d),
      sendMessage: makeSendMessage({
        ...d,
        realtime: supabase ? createSupabaseRealtimeGateway() : createMockRealtimeGateway(),
        bus: deps.bus,
        now,
      }),
    }),
  };
}
