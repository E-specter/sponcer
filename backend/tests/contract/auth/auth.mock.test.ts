import { describe, expect, it } from 'vitest';
import { demoUser, fixtureProfiles, fixtureUsers } from '@sponcer/contracts/fixtures';
import {
  createInMemoryClaimStore,
  createMockIdentityProvider,
  createMockLiveBioReader,
} from '../../../src/modules/auth/infrastructure/out/mock/mock-adapters';
import { describeClaimStoreContract } from './claim-store.contract';
import { describeIdentityProviderContract } from './identity-provider.contract';
import { describeLiveBioReaderContract } from './live-bio-reader.contract';

// Los adaptadores reales (Supabase, ingestion.FetchLiveBio) entran aquí en F2 con la misma suite.
const KNOWN = fixtureProfiles[0]!.snapshot;

describe('auth · adaptadores mock', () => {
  describeClaimStoreContract(() => ({
    store: createInMemoryClaimStore(),
    userA: demoUser.id,
    userB: fixtureUsers[1]!.id,
  }));

  describeIdentityProviderContract(createMockIdentityProvider, {
    validHeader: `Bearer mock:${demoUser.id}`,
    expectedUser: { userId: demoUser.id, email: demoUser.email },
  });

  describeLiveBioReaderContract(() => createMockLiveBioReader(new Map()), {
    knownHandle: KNOWN.handle,
  });

  describe('LiveBioReader mock (ADR-002)', () => {
    it('devuelve la bio semilla del fixture con el código pendiente añadido', async () => {
      const reader = createMockLiveBioReader(new Map([[KNOWN.handle, 'sponcer-ABC234']]));
      const r = await reader.read(KNOWN.handle);
      expect(r.ok && r.value.biography).toBe(`${KNOWN.biography} sponcer-ABC234`.trim());
    });

    it('un handle fuera de fixtures es una cuenta profesional pública', async () => {
      const r = await createMockLiveBioReader(new Map()).read('handle.nuevo');
      expect(r).toEqual({ ok: true, value: { biography: '', isPrivate: false, isBusiness: true } });
    });
  });
});
