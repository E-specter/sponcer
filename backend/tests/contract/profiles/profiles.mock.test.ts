import { randomUUID } from 'node:crypto';
import { describe } from 'vitest';
import { fixtureProfiles } from '@sponcer/contracts/fixtures';
import { createProfilesMockAdapters } from '../../../src/modules/profiles/infrastructure/out/mock/mock-adapters';
import { describeProfileRepositoryContract } from './profile-repository.contract';
import {
  describeClassificationReaderContract,
  describeSnapshotReaderContract,
} from './readers.contract';
import { describeRemovalRequestStoreContract } from './removal-request-store.contract';
import { describeServiceRepositoryContract } from './service-repository.contract';
const MIN_CATALOG = 2;

// Los adaptadores Supabase (F2/F3) se enchufan aquí con la misma suite sobre una BD local sembrada.
describe('profiles · adaptadores mock', () => {
  describeProfileRepositoryContract(() => createProfilesMockAdapters().profiles);
  describeServiceRepositoryContract(
    () => {
      const repo = createProfilesMockAdapters().services;
      const catalogs = fixtureProfiles.filter((f) => f.services.length >= MIN_CATALOG);
      const empty = fixtureProfiles.find((f) => f.services.length === 0)!;
      return {
        repo,
        withServices: { profileId: catalogs[0]!.id, services: catalogs[0]!.services },
        otherWithServices: { profileId: catalogs[1]!.id, services: catalogs[1]!.services },
        emptyProfileId: empty.id,
      };
    },
    { stableIds: true },
  );
  describeSnapshotReaderContract(() => createProfilesMockAdapters().snapshots);
  describeClassificationReaderContract(() => createProfilesMockAdapters().classifications);
  describeRemovalRequestStoreContract(() => {
    const { removals } = createProfilesMockAdapters();
    const handle = 'quien.sea';
    return {
      store: removals,
      handle,
      adminId: randomUUID(),
      recorded: () => removals.all().filter((r) => r.handle.startsWith(handle)),
    };
  });
});
