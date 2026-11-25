import { describe, expect, it } from 'vitest';
import { fixtureProfiles, fixtureSocial } from '@sponcer/contracts/fixtures';
import { createEventBus } from '../../shared/events/event-bus';
import { createChatModule } from '../chat';
import { createProfilesModule } from '../profiles';
import { createQuotesModule } from '../quotes';
import {
  makeListNotifications,
  makeMarkAsRead,
} from './application/use-cases/notification-queries';
import { createMockNotificationRepository } from './infrastructure/out/mock/mock-adapters';
import { subscribeNotificationObservers } from './application/event-handlers';

const NEW_MATCH = '00000000-0000-4000-8000-0000000000aa';
const NEW_MESSAGE = '00000000-0000-4000-8000-0000000000bb';
const STRANGER = '00000000-0000-4000-8000-000000000000';
const FIRST_PAGE = 1;
const LARGE_PAGE = 50;
const NOW = new Date('2026-11-25T10:00:00Z');
const quote = fixtureSocial.quotes[0]!;
const match = fixtureSocial.matches[0]!;
const ownerOf = (profileId: string) =>
  fixtureProfiles.find((p) => p.id === profileId)!.ownerUserId!;
const flush = () => new Promise((r) => setTimeout(r, 0));

function setup() {
  const bus = createEventBus();
  const profiles = createProfilesModule({ adapter: 'mock', bus }).api;
  const quotes = createQuotesModule({ adapter: 'mock', bus, profiles }).api;
  const chat = createChatModule({ adapter: 'mock', bus, profiles }).api;
  const repo = createMockNotificationRepository();
  subscribeNotificationObservers({ bus, repo, profiles, quotes, chat, now: () => NOW });
  const listFor = async (userId: string) => {
    await flush();
    const r = await makeListNotifications({ repo })(userId, { limit: LARGE_PAGE });
    return r.ok ? r.value.items : [];
  };
  return { bus, repo, listFor };
}

describe('observers', () => {
  it('MatchCreated notifica a los dueños de ambos perfiles', async () => {
    const { bus, listFor } = setup();
    bus.publish({
      type: 'MatchCreated',
      matchId: NEW_MATCH,
      creatorProfileId: match.creatorProfileId,
      brandProfileId: match.brandProfileId,
    });
    const [forCreator, forBrand] = await Promise.all([
      listFor(ownerOf(match.creatorProfileId)),
      listFor(ownerOf(match.brandProfileId)),
    ]);
    expect(
      forCreator.some(
        (n) =>
          n.kind === 'match_created' &&
          n.payload.matchId === NEW_MATCH &&
          n.payload.profileId === match.brandProfileId,
      ),
    ).toBe(true);
    expect(
      forBrand.some(
        (n) =>
          n.kind === 'match_created' &&
          n.payload.matchId === NEW_MATCH &&
          n.payload.profileId === match.creatorProfileId,
      ),
    ).toBe(true);
  });

  it('QuoteStatusChanged notifica a la contraparte del actor (el creador, tras la solicitud de la marca)', async () => {
    const { bus, repo } = setup();
    bus.publish({ type: 'QuoteStatusChanged', quoteId: quote.id, from: 'draft', to: 'sent' });
    await flush();
    const mine = await repo.listByUser(ownerOf(quote.creatorProfileId), 0, LARGE_PAGE);
    expect(
      mine.items.filter(
        (n) =>
          n.kind === 'quote_status_changed' &&
          n.payload.to === 'sent' &&
          n.createdAt === NOW.toISOString(),
      ),
    ).toHaveLength(1);
  });

  it('QuoteStatusChanged a draft no notifica', async () => {
    const { bus, repo } = setup();
    const before = (await repo.listByUser(ownerOf(quote.creatorProfileId), 0, LARGE_PAGE)).total;
    bus.publish({ type: 'QuoteStatusChanged', quoteId: quote.id, from: null, to: 'draft' });
    await flush();
    expect((await repo.listByUser(ownerOf(quote.creatorProfileId), 0, LARGE_PAGE)).total).toBe(
      before,
    );
  });

  it('MessageSent notifica a la contraparte, no al remitente', async () => {
    const { bus, repo } = setup();
    const creatorOwner = ownerOf(match.creatorProfileId);
    bus.publish({
      type: 'MessageSent',
      messageId: NEW_MESSAGE,
      matchId: match.id,
      senderProfileId: match.brandProfileId,
    });
    await flush();
    const got = await repo.listByUser(creatorOwner, 0, LARGE_PAGE);
    expect(
      got.items.some((n) => n.kind === 'message_received' && n.payload.messageId === NEW_MESSAGE),
    ).toBe(true);
    expect(
      await repo.findById(got.items.find((n) => n.payload.messageId === NEW_MESSAGE)!.id),
    ).toMatchObject({ userId: creatorOwner });
  });
});

describe('queries', () => {
  it('lista paginada, más reciente primero, solo las propias', async () => {
    const repo = createMockNotificationRepository();
    const owner = fixtureSocial.notifications[0]!.userId;
    const list = makeListNotifications({ repo });
    const first = await list(owner, { limit: FIRST_PAGE });
    if (!first.ok) throw new Error('setup');
    expect(first.value.items).toHaveLength(FIRST_PAGE);
    expect(first.value.nextCursor).not.toBeNull();
    const all = await list(owner, { limit: LARGE_PAGE });
    const dates = all.ok ? all.value.items.map((n) => n.createdAt) : [];
    expect(dates).toEqual([...dates].sort().reverse());
    const none = await list(STRANGER, { limit: LARGE_PAGE });
    expect(none.ok && none.value.items).toEqual([]);
  });

  it('markRead marca las propias y rechaza las ajenas', async () => {
    const repo = createMockNotificationRepository();
    const target = fixtureSocial.notifications.find((n) => n.readAt === null)!;
    const mark = makeMarkAsRead({ repo, now: () => NOW });
    const other = await mark(STRANGER, target.id);
    expect(!other.ok && other.error.code).toBe('NOT_FOUND');
    const mine = await mark(target.userId, target.id);
    expect(mine.ok && mine.value.readAt).toBe(NOW.toISOString());
  });
});
