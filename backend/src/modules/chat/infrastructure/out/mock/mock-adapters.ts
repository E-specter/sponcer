import type { Message } from '@sponcer/contracts';
import { fixtureSocial } from '@sponcer/contracts/fixtures';
import { logger } from '../../../../../shared/logger';
import type { MatchRef } from '../../../domain/match-ref';
import type {
  MatchReader,
  MessageRepository,
  RealtimeGateway,
} from '../../../application/ports/out/chat-ports';

/** Matches sembrados desde fixtures; `register` los añade al llegar `MatchCreated`. */
export function createMockMatchReader(): MatchReader & { register(match: MatchRef): void } {
  const byId = new Map<string, MatchRef>(
    fixtureSocial.matches.map((m) => [
      m.id,
      { id: m.id, creatorProfileId: m.creatorProfileId, brandProfileId: m.brandProfileId },
    ]),
  );
  return {
    findById: async (id) => byId.get(id) ?? null,
    register: (m) => void byId.set(m.id, m),
  };
}

export function createMockMessageRepository(): MessageRepository {
  const all: Message[] = [...fixtureSocial.messages];
  return {
    add: async (m) => void all.push(m),
    async listByMatch(matchId, offset, limit) {
      const sorted = all
        .filter((m) => m.matchId === matchId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { items: sorted.slice(offset, offset + limit), total: sorted.length };
    },
  };
}

/** Mock: solo registra. */
export const createMockRealtimeGateway = (): RealtimeGateway => ({
  publish: async (m) =>
    void logger.info('realtime(mock) mensaje', { id: m.id, matchId: m.matchId }),
});
