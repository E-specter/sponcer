import { describe, expect, it } from 'vitest';
import { fixtureProfiles, fixtureSocial } from '@sponcer/contracts/fixtures';
import type { DomainEvent, Message } from '@sponcer/contracts';
import { createEventBus } from '../../../../shared/events/event-bus';
import { createProfilesModule } from '../../../profiles';
import { createChatModule } from '../../chat.module';
import {
  createMockMatchReader,
  createMockMessageRepository,
} from '../../infrastructure/out/mock/mock-adapters';
import { makeListMessages } from './list-messages';
import { makeSendMessage } from './send-message';

const STRANGER = '00000000-0000-4000-8000-000000000000';
const MISSING = '00000000-0000-4000-8000-000000000001';
const SMALL_PAGE = 1;
const match = fixtureSocial.matches[0]!;
const ownerOf = (profileId: string) =>
  fixtureProfiles.find((p) => p.id === profileId)!.ownerUserId!;
const brandOwner = ownerOf(match.brandProfileId);

function setup() {
  const bus = createEventBus();
  const events: DomainEvent[] = [];
  bus.subscribe('MessageSent', (e) => void events.push(e));
  const published: Message[] = [];
  const profiles = createProfilesModule({ adapter: 'mock', bus }).api;
  const d = {
    matches: createMockMatchReader(),
    messages: createMockMessageRepository(),
    profiles,
    realtime: { publish: async (m: Message) => void published.push(m) },
    bus,
    now: () => new Date('2026-11-25T10:00:00Z'),
  };
  return { events, published, send: makeSendMessage(d), list: makeListMessages(d) };
}

describe('SendMessage', () => {
  it('un participante envía: persiste, publica en el gateway y emite MessageSent', async () => {
    const { send, list, events, published } = setup();
    const r = await send(brandOwner, match.id, {
      senderProfileId: match.brandProfileId,
      body: 'hola',
    });
    expect(r.ok && r.value.body).toBe('hola');
    expect(events).toHaveLength(1);
    expect(published).toHaveLength(1);
    const page = await list(brandOwner, match.id, { limit: SMALL_PAGE });
    expect(page.ok && page.value.items[0]?.body).toBe('hola');
  });

  it('rechaza a no participantes, perfiles ajenos y matches inexistentes', async () => {
    const { send, events } = setup();
    const outsider = fixtureProfiles.find(
      (p) => p.ownerUserId && p.id !== match.brandProfileId && p.id !== match.creatorProfileId,
    )!;
    const body = 'x';
    const codes = await Promise.all([
      send(ownerOf(outsider.id), match.id, { senderProfileId: outsider.id, body }),
      send(STRANGER, match.id, { senderProfileId: match.brandProfileId, body }),
      send(brandOwner, MISSING, { senderProfileId: match.brandProfileId, body }),
    ]);
    expect(codes.map((r) => !r.ok && r.error.code)).toEqual([
      'FORBIDDEN',
      'FORBIDDEN',
      'NOT_FOUND',
    ]);
    expect(events).toHaveLength(0);
  });
});

describe('ListMessages', () => {
  it('pagina por cursor, más reciente primero', async () => {
    const { list } = setup();
    const first = await list(brandOwner, match.id, { limit: SMALL_PAGE });
    if (!first.ok) throw new Error('setup');
    expect(first.value.nextCursor).not.toBeNull();
    const second = await list(brandOwner, match.id, {
      limit: SMALL_PAGE,
      cursor: first.value.nextCursor!,
    });
    expect(second.ok && second.value.items[0]!.createdAt < first.value.items[0]!.createdAt).toBe(
      true,
    );
  });

  it('rechaza a no participantes', async () => {
    const { list } = setup();
    const r = await list(STRANGER, match.id, { limit: SMALL_PAGE });
    expect(!r.ok && r.error.code).toBe('FORBIDDEN');
  });
});

describe('ListMessages · cursor', () => {
  it('un cursor corrupto es VALIDATION_ERROR, no la primera página', async () => {
    const { list } = setup();
    const r = await list(brandOwner, match.id, { limit: SMALL_PAGE, cursor: '-5' });
    expect(!r.ok && r.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('módulo chat', () => {
  it('registra matches nuevos desde MatchCreated', async () => {
    const bus = createEventBus();
    const profiles = createProfilesModule({ adapter: 'mock', bus }).api;
    const chat = createChatModule({ adapter: 'mock', bus, profiles });
    bus.publish({
      type: 'MatchCreated',
      matchId: MISSING,
      creatorProfileId: match.creatorProfileId,
      brandProfileId: match.brandProfileId,
    });
    expect(await chat.api.getMatch(MISSING)).toMatchObject({ id: MISSING });
  });
});
