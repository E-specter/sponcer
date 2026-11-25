import { randomUUID } from 'node:crypto';
import { describe } from 'vitest';
import { createMockMessageRepository } from '../../../src/modules/chat/infrastructure/out/mock/mock-adapters';
import { describeMessageRepositoryContract } from './message-repository.contract';

describe('chat · adaptador mock', () => {
  describeMessageRepositoryContract(() => ({
    repo: createMockMessageRepository(),
    newMatch: async () => ({ matchId: randomUUID(), senderProfileId: randomUUID() }),
  }));
});
