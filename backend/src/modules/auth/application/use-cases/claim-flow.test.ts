import { describe, expect, it } from 'vitest';
import { CLAIM_MAX_ATTEMPTS_PER_HOUR, CLAIM_TTL_MINUTES } from '@sponcer/contracts';
import { demoUser, fixtureProfiles, fixtureUsers } from '@sponcer/contracts/fixtures';
import { createEventBus } from '../../../../shared/events/event-bus';
import { ok } from '../../../../shared/result';
import { createProfilesModule } from '../../../profiles';
import { createInMemoryClaimStore } from '../../infrastructure/out/mock/mock-adapters';
import { makeConfirmProfileClaim } from './confirm-profile-claim';
import { makeStartProfileClaim } from './start-profile-claim';

const MINUTE_MS = 60_000;
const NEW_HANDLE = 'nuevo.perfil.demo';
const OTHER_USER = fixtureUsers.find((u) => u.id !== demoUser.id)!;
const OWNED_BRAND = fixtureProfiles.find(
  (p) => p.ownerUserId === demoUser.id && p.role === 'brand',
)!;

function setup() {
  let clock = new Date('2026-01-01T10:00:00Z');
  const bus = createEventBus();
  const events: unknown[] = [];
  bus.subscribe('ProfileVerified', (e) => void events.push(e));
  const profiles = createProfilesModule({ adapter: 'mock', bus }).api;
  const claims = createInMemoryClaimStore();
  const now = () => clock;
  const bio = { text: '', isPrivate: false, isBusiness: true };
  const liveBio = {
    read: async () =>
      ok({ biography: bio.text, isPrivate: bio.isPrivate, isBusiness: bio.isBusiness }),
  };
  const start = makeStartProfileClaim({
    claims,
    now,
    randomIndex: () => 0,
    newId: () => crypto.randomUUID(),
  });
  const confirm = makeConfirmProfileClaim({ claims, liveBio, profiles, bus, now });
  return {
    start,
    confirm,
    bio,
    events,
    profiles,
    advance: (min: number) => (clock = new Date(clock.getTime() + min * MINUTE_MS)),
  };
}

async function started(
  s: ReturnType<typeof setup>,
  userId: string,
  handle: string,
  role: 'creator' | 'brand',
) {
  const r = await s.start(userId, { handle, role });
  if (!r.ok) throw r.error;
  return r.value;
}

describe('flujo de reclamo', () => {
  it('verifica cuando la bio contiene el código y publica ProfileVerified', async () => {
    const s = setup();
    const claim = await started(s, demoUser.id, NEW_HANDLE, 'creator');
    s.bio.text = `mi bio ${claim.code}`;
    const r = await s.confirm(demoUser.id, claim.claimId);
    expect(r.ok && r.value.status).toBe('verified');
    expect(s.events).toHaveLength(1);
    expect(await s.profiles.listByOwner(demoUser.id)).toContainEqual(
      expect.objectContaining({ handle: NEW_HANDLE }),
    );
  });

  it('code_not_found si la bio no tiene el código', async () => {
    const s = setup();
    const claim = await started(s, demoUser.id, NEW_HANDLE, 'creator');
    const r = await s.confirm(demoUser.id, claim.claimId);
    expect(r).toEqual(ok({ status: 'code_not_found' }));
    expect(s.events).toHaveLength(0);
  });

  it('expired pasada la vigencia', async () => {
    const s = setup();
    const claim = await started(s, demoUser.id, NEW_HANDLE, 'creator');
    s.bio.text = claim.code;
    s.advance(CLAIM_TTL_MINUTES + 1);
    expect(await s.confirm(demoUser.id, claim.claimId)).toEqual(ok({ status: 'expired' }));
  });

  it('not_eligible si la cuenta es privada o no profesional', async () => {
    const s = setup();
    const claim = await started(s, demoUser.id, NEW_HANDLE, 'creator');
    s.bio.isPrivate = true;
    expect(await s.confirm(demoUser.id, claim.claimId)).toEqual(
      ok({ status: 'not_eligible', reason: 'private' }),
    );
    s.bio.isPrivate = false;
    s.bio.isBusiness = false;
    expect(await s.confirm(demoUser.id, claim.claimId)).toEqual(
      ok({ status: 'not_eligible', reason: 'not_professional' }),
    );
  });

  it('already_owned si el perfil tiene otro dueño', async () => {
    const s = setup();
    const claim = await started(s, OTHER_USER.id, OWNED_BRAND.snapshot.handle, 'brand');
    s.bio.text = claim.code;
    expect(await s.confirm(OTHER_USER.id, claim.claimId)).toEqual(ok({ status: 'already_owned' }));
  });

  it('limita los intentos por hora y usuario', async () => {
    const s = setup();
    const claim = await started(s, demoUser.id, NEW_HANDLE, 'creator');
    const attempts = Array.from({ length: CLAIM_MAX_ATTEMPTS_PER_HOUR }, () => claim.claimId);
    await Promise.all(attempts.map((id) => s.confirm(demoUser.id, id)));
    const blocked = await s.confirm(demoUser.id, claim.claimId);
    expect(!blocked.ok && blocked.error.code).toBe('RATE_LIMITED');
  });

  it('un reclamo ajeno no existe para otro usuario', async () => {
    const s = setup();
    const claim = await started(s, demoUser.id, NEW_HANDLE, 'creator');
    const r = await s.confirm(OTHER_USER.id, claim.claimId);
    expect(!r.ok && r.error.code).toBe('NOT_FOUND');
  });
});
