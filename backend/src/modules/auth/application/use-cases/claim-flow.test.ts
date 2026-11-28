import { describe, expect, it } from 'vitest';
import { CLAIM_MAX_ATTEMPTS_PER_HOUR, CLAIM_TTL_MINUTES } from '@sponcer/contracts';
import {
  demoInfluencer,
  demoUser,
  fixtureProfiles,
  fixtureUsers,
} from '@sponcer/contracts/fixtures';
import { createEventBus } from '../../../../shared/events/event-bus';
import { ok } from '../../../../shared/result';
import { createProfilesModule } from '../../../profiles';
import {
  createInMemoryAccountStore,
  createInMemoryClaimStore,
} from '../../infrastructure/out/mock/mock-adapters';
import { makeConfirmProfileClaim } from './confirm-profile-claim';
import { makeStartProfileClaim } from './start-profile-claim';

const MINUTE_MS = 60_000;
const NEW_HANDLE = 'nuevo.perfil.demo';
// Otra Empresa distinta de la dueña de OWNED_BRAND.
const OTHER_USER = fixtureUsers.find((u) => u.accountKind === 'company' && u.id !== demoUser.id)!;
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
  const accounts = createInMemoryAccountStore();
  const now = () => clock;
  const bio = { text: '', isPrivate: false, isBusiness: true };
  const liveBio = {
    read: async () =>
      ok({ biography: bio.text, isPrivate: bio.isPrivate, isBusiness: bio.isBusiness }),
  };
  const start = makeStartProfileClaim({
    claims,
    accounts,
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
    const claim = await started(s, demoInfluencer.id, NEW_HANDLE, 'creator');
    s.bio.text = `mi bio ${claim.code}`;
    const r = await s.confirm(demoInfluencer.id, claim.claimId);
    expect(r.ok && r.value.status).toBe('verified');
    expect(s.events).toHaveLength(1);
    expect(await s.profiles.listByOwner(demoInfluencer.id)).toContainEqual(
      expect.objectContaining({ handle: NEW_HANDLE }),
    );
  });

  it('code_not_found si la bio no tiene el código', async () => {
    const s = setup();
    const claim = await started(s, demoInfluencer.id, NEW_HANDLE, 'creator');
    const r = await s.confirm(demoInfluencer.id, claim.claimId);
    expect(r).toEqual(ok({ status: 'code_not_found' }));
    expect(s.events).toHaveLength(0);
  });

  it('expired pasada la vigencia', async () => {
    const s = setup();
    const claim = await started(s, demoInfluencer.id, NEW_HANDLE, 'creator');
    s.bio.text = claim.code;
    s.advance(CLAIM_TTL_MINUTES + 1);
    expect(await s.confirm(demoInfluencer.id, claim.claimId)).toEqual(ok({ status: 'expired' }));
  });

  it('not_eligible si la cuenta es privada o no profesional', async () => {
    const s = setup();
    const claim = await started(s, demoInfluencer.id, NEW_HANDLE, 'creator');
    s.bio.isPrivate = true;
    expect(await s.confirm(demoInfluencer.id, claim.claimId)).toEqual(
      ok({ status: 'not_eligible', reason: 'private' }),
    );
    s.bio.isPrivate = false;
    s.bio.isBusiness = false;
    expect(await s.confirm(demoInfluencer.id, claim.claimId)).toEqual(
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
    const claim = await started(s, demoInfluencer.id, NEW_HANDLE, 'creator');
    const attempts = Array.from({ length: CLAIM_MAX_ATTEMPTS_PER_HOUR }, () => claim.claimId);
    await Promise.all(attempts.map((id) => s.confirm(demoInfluencer.id, id)));
    const blocked = await s.confirm(demoInfluencer.id, claim.claimId);
    expect(!blocked.ok && blocked.error.code).toBe('RATE_LIMITED');
  });

  it('un reclamo ajeno no existe para otro usuario', async () => {
    const s = setup();
    const claim = await started(s, demoInfluencer.id, NEW_HANDLE, 'creator');
    const r = await s.confirm(OTHER_USER.id, claim.claimId);
    expect(!r.ok && r.error.code).toBe('NOT_FOUND');
  });
});

describe('reglas por tipo de cuenta (ADR-009)', () => {
  it('una cuenta Empresa solo reclama marcas y una Influencer solo creadores', async () => {
    const s = setup();
    const company = await s.start(demoUser.id, { handle: NEW_HANDLE, role: 'creator' });
    const influencer = await s.start(demoInfluencer.id, { handle: NEW_HANDLE, role: 'brand' });
    expect([company, influencer].map((r) => !r.ok && [r.error.code, r.error.details])).toEqual([
      ['VALIDATION_ERROR', { reason: 'role_mismatch', expected: 'brand' }],
      ['VALIDATION_ERROR', { reason: 'role_mismatch', expected: 'creator' }],
    ]);
    expect((await s.start(demoUser.id, { handle: NEW_HANDLE, role: 'brand' })).ok).toBe(true);
  });

  it('un usuario sin registro no puede reclamar', async () => {
    const s = setup();
    const r = await s.start(crypto.randomUUID(), { handle: NEW_HANDLE, role: 'brand' });
    expect(!r.ok && [r.error.code, r.error.details]).toEqual([
      'FORBIDDEN',
      { reason: 'registration_required' },
    ]);
  });
});
