import { randomUUID } from 'node:crypto';
import { describe } from 'vitest';
import { fixtureProfiles } from '@sponcer/contracts/fixtures';
import { createInMemoryClassificationRepository } from '../../src/modules/classification/infrastructure/out/mock/mock-adapters';
import {
  createInMemoryBlocklist,
  createInMemorySnapshotRepository,
} from '../../src/modules/ingestion/infrastructure/out/mock/mock-adapters';
import {
  createInMemoryInteractionRepository,
  createInMemoryMatchRepository,
  createMockCandidateSearch,
} from '../../src/modules/matching/infrastructure/out/mock/mock-adapters';
import { createProfilesModule } from '../../src/modules/profiles';
import { createEventBus } from '../../src/shared/events/event-bus';
import { describeClassificationRepositoryContract } from './classification/classification-repository.contract';
import {
  describeIngestionBlocklistContract,
  describeSnapshotRepositoryContract,
} from './ingestion/ingestion-repositories.contract';
import { describeCandidateSearchContract } from './matching/candidate-search.contract';
import {
  describeInteractionRepositoryContract,
  describeMatchRepositoryContract,
} from './matching/matching-repositories.contract';

const DIMENSIONS = 8;
const HANDLE_TAG = 8;
const basis = (k: number) => Array.from({ length: DIMENSIONS }, (_, i) => (i === k ? 1 : 0));
const trio = async () => ({
  creatorId: randomUUID(),
  brandId: randomUUID(),
  otherId: randomUUID(),
});
const handle = () => `zz.${randomUUID().slice(0, HANDLE_TAG)}`;

describe('ingestion · matching · classification · adaptadores mock', () => {
  describeInteractionRepositoryContract(() => ({
    repo: createInMemoryInteractionRepository(),
    newTrio: trio,
  }));
  describeMatchRepositoryContract(() => ({ repo: createInMemoryMatchRepository(), newTrio: trio }));
  describeSnapshotRepositoryContract(() => ({
    repo: createInMemorySnapshotRepository(),
    newHandle: handle,
  }));
  describeIngestionBlocklistContract(() => {
    const blocklist = createInMemoryBlocklist();
    return { blocklist, newHandle: handle };
  });
  describeClassificationRepositoryContract(() => ({
    repo: createInMemoryClassificationRepository(),
    newProfileId: async () => randomUUID(),
  }));

  describeCandidateSearchContract(() => {
    const profiles = createProfilesModule({ adapter: 'mock', bus: createEventBus() }).api;
    const creators = fixtureProfiles.filter((f) => f.role === 'creator').map((f) => f.id);
    const brands = fixtureProfiles.filter((f) => f.role === 'brand').map((f) => f.id);
    const [viewerId, unclassifiedViewerId] = creators as [string, string];
    const [closeId, farId] = brands as [string, string];
    const embeddings = new Map([
      [viewerId, basis(0)],
      [closeId, basis(0)],
      [farId, basis(1)],
    ]);
    const classification = {
      getEmbedding: async (id: string) => embeddings.get(id) ?? null,
      getEmbeddings: async (ids: string[]) =>
        new Map(
          ids.flatMap((id) => (embeddings.has(id) ? [[id, embeddings.get(id)!] as const] : [])),
        ),
    };
    return {
      search: createMockCandidateSearch({ profiles, classification }),
      viewerId,
      closeId,
      farId,
      unclassifiedViewerId,
    };
  });
});
