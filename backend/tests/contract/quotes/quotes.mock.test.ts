import { randomUUID } from 'node:crypto';
import { describe } from 'vitest';
import { createMockQuoteRepository } from '../../../src/modules/quotes/infrastructure/out/mock/mock-adapters';
import { describeQuoteRepositoryContract } from './quote-repository.contract';

describe('quotes · adaptador mock', () => {
  describeQuoteRepositoryContract(() => ({
    repo: createMockQuoteRepository(),
    newScenario: async () => ({
      campaignId: randomUUID(),
      serviceId: randomUUID(),
      creatorProfileId: randomUUID(),
      requesterProfileId: randomUUID(),
      strangerProfileId: randomUUID(),
    }),
  }));
});
