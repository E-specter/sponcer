import { randomUUID } from 'node:crypto';
import { describe } from 'vitest';
import { createMockNotificationRepository } from '../../../src/modules/notifications/infrastructure/out/mock/mock-adapters';
import { describeNotificationRepositoryContract } from './notification-repository.contract';

describe('notifications · adaptador mock', () => {
  describeNotificationRepositoryContract(() => ({
    repo: createMockNotificationRepository(),
    newUserId: async () => randomUUID(),
  }));
});
