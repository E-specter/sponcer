import { afterAll, beforeAll, describe } from 'vitest';
import { createWorld, hasSupabase, serviceClient } from '../../../../db/tests/support/supabase';
import { createSupabaseClaimStore } from '../../../src/modules/auth/infrastructure/out/supabase/supabase-adapters';
import { createSupabaseMessageRepository } from '../../../src/modules/chat/infrastructure/out/supabase/supabase-message-repository';
import { createSupabaseNotificationRepository } from '../../../src/modules/notifications/infrastructure/out/supabase/supabase-adapters';
import {
  createSupabaseRemovalStore,
  createSupabaseServiceRepository,
} from '../../../src/modules/profiles/infrastructure/out/supabase/supabase-adapters';
import {
  serviceFromRow,
  type ServiceRow,
} from '../../../src/modules/profiles/infrastructure/out/supabase/mappers';
import { createSupabaseQuoteRepository } from '../../../src/modules/quotes/infrastructure/out/supabase/supabase-adapters';
import { describeClaimStoreContract } from '../auth/claim-store.contract';
import { describeMessageRepositoryContract } from '../chat/message-repository.contract';
import { describeNotificationRepositoryContract } from '../notifications/notification-repository.contract';
import { describeServiceRepositoryContract } from '../profiles/service-repository.contract';
import { describeQuoteRepositoryContract } from '../quotes/quote-repository.contract';
import { describeRemovalRequestStoreContract } from '../profiles/removal-request-store.contract';

/**
 * Las MISMAS suites de contrato que corren contra los mocks, ahora contra los adaptadores reales y
 * Supabase local (Liskov). Cada test crea sus propios usuarios y perfiles (`zz.*`, `@audit.test`) y
 * se borran al terminar. Se salta si no hay Supabase local configurado.
 */
const SETUP_TIMEOUT_MS = 60_000;
const CATALOG_SIZE = 3;
const OTHER_CATALOG_SIZE = 2;
const positions = (n: number) => Array.from({ length: n }, (_, i) => i);
const BASE_PRICE = 100;

describe.skipIf(!hasSupabase)('adaptadores reales (Supabase local)', () => {
  const sb = serviceClient();
  const world = createWorld(sb);

  beforeAll(() => world.cleanup(), SETUP_TIMEOUT_MS);
  afterAll(() => world.cleanup(), SETUP_TIMEOUT_MS);

  const seedCatalog = async (profileId: string, positions: number[]) => {
    const rows = positions.map((position) => ({
      profile_id: profileId,
      type: 'canje',
      format: ['reel', 'post', 'story'][position] ?? 'combo',
      price_pen: BASE_PRICE + position,
      description: `servicio ${position}`,
      position,
    }));
    const res = await sb.from('creator_services').insert(rows).select('*').order('position');
    if (res.error) throw new Error(res.error.message);
    return (res.data as ServiceRow[]).map(serviceFromRow);
  };

  describe('auth · ClaimStore', () => {
    describeClaimStoreContract(
      async () => ({
        store: createSupabaseClaimStore(sb),
        userA: (await world.newUser()).id,
        userB: (await world.newUser()).id,
      }),
      { clockInjectable: false },
    );
  });

  describe('profiles · ServiceRepository', () => {
    describeServiceRepositoryContract(async () => {
      const [p1, p2, p3] = [
        await world.newProfile('creator'),
        await world.newProfile('creator'),
        await world.newProfile('creator'),
      ];
      return {
        repo: createSupabaseServiceRepository(sb),
        withServices: {
          profileId: p1.id,
          services: await seedCatalog(p1.id, positions(CATALOG_SIZE)),
        },
        otherWithServices: {
          profileId: p2.id,
          services: await seedCatalog(p2.id, positions(OTHER_CATALOG_SIZE)),
        },
        emptyProfileId: p3.id,
      };
    });
  });

  describe('profiles · RemovalRequestStore', () => {
    describeRemovalRequestStoreContract(() => {
      const handle = world.newHandle();
      return {
        store: createSupabaseRemovalStore(sb),
        handle,
        recorded: async () => {
          const res = await sb
            .from('profile_removal_requests')
            .select('*')
            .like('ig_handle', `${handle}%`)
            .order('created_at')
            .order('id');
          return (res.data ?? []).map((row) => ({
            handle: row.ig_handle,
            email: row.email,
            reason: row.reason ?? undefined,
            createdAt: new Date(row.created_at),
            status: row.status,
          }));
        },
      };
    });
  });

  describe('quotes · QuoteRepository', () => {
    describeQuoteRepositoryContract(() => ({
      repo: createSupabaseQuoteRepository(sb),
      newScenario: async () => {
        const [creator, requester, stranger] = [
          await world.newProfile('creator'),
          await world.newProfile('brand'),
          await world.newProfile('brand'),
        ];
        return {
          serviceId: await world.newService(creator.id),
          creatorProfileId: creator.id,
          requesterProfileId: requester.id,
          strangerProfileId: stranger.id,
        };
      },
    }));
  });

  describe('notifications · NotificationRepository', () => {
    describeNotificationRepositoryContract(() => ({
      repo: createSupabaseNotificationRepository(sb),
      newUserId: async () => (await world.newUser()).id,
    }));
  });

  describe('chat · MessageRepository', () => {
    describeMessageRepositoryContract(() => ({
      repo: createSupabaseMessageRepository(sb),
      newMatch: async () => {
        const [creator, brand] = [
          await world.newProfile('creator'),
          await world.newProfile('brand'),
        ];
        return { matchId: await world.newMatch(creator.id, brand.id), senderProfileId: creator.id };
      },
    }));
  });
});
