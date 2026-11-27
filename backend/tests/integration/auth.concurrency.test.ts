import { describe, expect, it } from 'vitest';
import { CLAIM_MAX_ATTEMPTS_PER_HOUR } from '@sponcer/contracts';
import { demoInfluencer } from '@sponcer/contracts/fixtures';
import { makeConfirmProfileClaim } from '../../src/modules/auth/application/use-cases/confirm-profile-claim';
import { makeStartProfileClaim } from '../../src/modules/auth/application/use-cases/start-profile-claim';
import {
  createInMemoryAccountStore,
  createInMemoryClaimStore,
} from '../../src/modules/auth/infrastructure/out/mock/mock-adapters';
import { createEventBus } from '../../src/shared/events/event-bus';
import { ok } from '../../src/shared/result';
import { createProfilesModule } from '../../src/modules/profiles';

const BURST_SIZE = 20;
const NOW = new Date('2026-01-01T10:00:00Z');

describe('verifyClaim bajo concurrencia', () => {
  // M-1 (corregido en F1-A2): tryRecordAttempt cuenta y registra en un solo paso, antes de la lectura de pago.
  it('M-1: una ráfaga de verificaciones no supera los 5 intentos por hora', async () => {
    const bus = createEventBus();
    const claims = createInMemoryClaimStore();
    const profiles = createProfilesModule({ adapter: 'mock', bus }).api;
    let liveReads = 0;
    const liveBio = {
      read: async () => {
        liveReads += 1;
        return ok({ biography: '', isPrivate: false, isBusiness: true });
      },
    };
    const start = makeStartProfileClaim({
      claims,
      accounts: createInMemoryAccountStore(),
      now: () => NOW,
      randomIndex: () => 0,
      newId: () => crypto.randomUUID(),
    });
    const confirm = makeConfirmProfileClaim({ claims, liveBio, profiles, bus, now: () => NOW });
    const started = await start(demoInfluencer.id, { handle: 'handle.nuevo', role: 'creator' });
    if (!started.ok) throw started.error;
    await Promise.all(
      Array.from({ length: BURST_SIZE }, () => confirm(demoInfluencer.id, started.value.claimId)),
    );
    expect(liveReads).toBeLessThanOrEqual(CLAIM_MAX_ATTEMPTS_PER_HOUR);
  });

  it('el límite se cumple con llamadas secuenciales', async () => {
    const bus = createEventBus();
    const claims = createInMemoryClaimStore();
    const profiles = createProfilesModule({ adapter: 'mock', bus }).api;
    let liveReads = 0;
    const liveBio = {
      read: async () => {
        liveReads += 1;
        return ok({ biography: '', isPrivate: false, isBusiness: true });
      },
    };
    const start = makeStartProfileClaim({
      claims,
      accounts: createInMemoryAccountStore(),
      now: () => NOW,
      randomIndex: () => 0,
      newId: () => crypto.randomUUID(),
    });
    const confirm = makeConfirmProfileClaim({ claims, liveBio, profiles, bus, now: () => NOW });
    const started = await start(demoInfluencer.id, { handle: 'handle.nuevo', role: 'creator' });
    if (!started.ok) throw started.error;
    await Array.from({ length: BURST_SIZE }).reduce<Promise<unknown>>(
      (prev) => prev.then(() => confirm(demoInfluencer.id, started.value.claimId)),
      Promise.resolve(),
    );
    expect(liveReads).toBe(CLAIM_MAX_ATTEMPTS_PER_HOUR);
  });
});
