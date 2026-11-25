import { randomUUID } from 'node:crypto';
import type { EventBus } from '../../../shared/events/event-bus';
import type { ChatApi } from '../../chat';
import type { ProfilesApi } from '../../profiles';
import type { QuotesApi } from '../../quotes';
import type {
  NotificationRepository,
  StoredNotification,
} from './ports/out/notification-repository';

export interface ObserverDeps {
  bus: EventBus;
  repo: NotificationRepository;
  profiles: ProfilesApi;
  quotes: QuotesApi;
  chat: ChatApi;
  now: () => Date;
  newId?: () => string;
}

/** Observer: reacciona a eventos de dominio y crea notificaciones para los dueños de los perfiles destinatarios. */
export function subscribeNotificationObservers(d: ObserverDeps): void {
  const notifyProfile = async (
    profileId: string,
    kind: StoredNotification['kind'],
    payload: Record<string, string>,
  ): Promise<void> => {
    const userId = await d.profiles.getOwnerUserId(profileId);
    if (!userId) return; // perfil sin reclamar: nadie a quien avisar
    await d.repo.add({
      id: (d.newId ?? randomUUID)(),
      userId,
      kind,
      payload,
      readAt: null,
      createdAt: d.now().toISOString(),
    });
  };

  d.bus.subscribe('MatchCreated', async (e) => {
    await Promise.all([
      notifyProfile(e.creatorProfileId, 'match_created', {
        matchId: e.matchId,
        profileId: e.brandProfileId,
      }),
      notifyProfile(e.brandProfileId, 'match_created', {
        matchId: e.matchId,
        profileId: e.creatorProfileId,
      }),
    ]);
  });

  d.bus.subscribe('QuoteStatusChanged', async (e) => {
    if (e.to === 'draft') return; // un borrador aún no concierne a la contraparte
    const quote = await d.quotes.getQuote(e.quoteId);
    const actor = quote?.history.at(-1)?.actorProfileId;
    if (!quote || !actor) return;
    const counterpart =
      actor === quote.requesterProfileId ? quote.creatorProfileId : quote.requesterProfileId;
    await notifyProfile(counterpart, 'quote_status_changed', { quoteId: e.quoteId, to: e.to });
  });

  d.bus.subscribe('MessageSent', async (e) => {
    const match = await d.chat.getMatch(e.matchId);
    if (!match) return;
    const counterpart =
      e.senderProfileId === match.creatorProfileId ? match.brandProfileId : match.creatorProfileId;
    await notifyProfile(counterpart, 'message_received', {
      matchId: e.matchId,
      messageId: e.messageId,
    });
  });
}
