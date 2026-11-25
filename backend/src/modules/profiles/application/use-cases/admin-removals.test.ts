import { describe, expect, it } from 'vitest';
import { demoUser, fixtureProfiles } from '@sponcer/contracts/fixtures';
import { createEventBus } from '../../../../shared/events/event-bus';
import { createProfilesMockAdapters } from '../../infrastructure/out/mock/mock-adapters';
import { createProfileAssembler } from '../profile-assembler';
import { makeAdminListRemovals, makeAdminReviewRemoval } from './admin-removals';

const ADMIN = 'admin-user';
const LIMIT = 20;
const target = fixtureProfiles.find((p) => p.status === 'verified')!;

const setup = async (handle = target.snapshot.handle) => {
  const a = createProfilesMockAdapters();
  const bus = createEventBus();
  const removed: Array<{ profileId: string; igHandle: string }> = [];
  bus.subscribe(
    'ProfileRemoved',
    (e) => void removed.push({ profileId: e.profileId, igHandle: e.igHandle }),
  );
  const assembler = createProfileAssembler({
    snapshots: a.snapshots,
    classifications: a.classifications,
    services: a.services,
    now: () => new Date(0),
  });
  const base = { requests: a.removals, reader: a.profiles, assembler };
  await a.removals.add({ handle, email: 'x@y.pe', createdAt: new Date(0), status: 'pending' });
  const id = (await a.removals.list({ offset: 0, limit: LIMIT })).items[0]!.id;
  return {
    a,
    removed,
    id,
    list: makeAdminListRemovals(base),
    review: makeAdminReviewRemoval({ ...base, writer: a.profiles, bus, now: () => new Date(0) }),
  };
};

describe('admin: pedidos de exclusión', () => {
  it('lista los pendientes con la ficha afectada', async () => {
    const { list } = await setup();
    const r = await list({ status: 'pending', limit: LIMIT });
    expect(r.ok && r.value.items[0]).toMatchObject({
      igHandle: target.snapshot.handle,
      status: 'pending',
    });
    expect(r.ok && r.value.items[0]!.profile?.id).toBe(target.id);
  });

  it('apply: retira la ficha, publica ProfileRemoved y marca applied', async () => {
    const { a, review, id, removed } = await setup();
    const r = await review(demoUser.id, id, { decision: 'apply' });
    expect(r.ok && r.value.status).toBe('applied');
    expect((await a.profiles.findById(target.id))?.status).toBe('removed');
    expect(removed).toEqual([{ profileId: target.id, igHandle: target.snapshot.handle }]);
  });

  it('apply sin ficha: igual publica ProfileRemoved para bloquear el handle', async () => {
    const { review, id, removed } = await setup('handle.sin.ficha');
    expect((await review(ADMIN, id, { decision: 'apply' })).ok).toBe(true);
    expect(removed.map((e) => e.igHandle)).toEqual(['handle.sin.ficha']);
  });

  it('reject: solo marca el pedido; la ficha sigue y no hay evento', async () => {
    const { a, review, id, removed } = await setup();
    const r = await review(ADMIN, id, { decision: 'reject', note: 'no es el titular' });
    expect(r.ok && r.value).toMatchObject({ status: 'rejected', reviewNote: 'no es el titular' });
    expect((await a.profiles.findById(target.id))?.status).toBe('verified');
    expect(removed).toEqual([]);
  });

  it('inexistente: NOT_FOUND; ya revisado: CONFLICT', async () => {
    const { review, id } = await setup();
    const missing = await review(ADMIN, '00000000-0000-4000-8000-000000000000', {
      decision: 'reject',
    });
    expect(!missing.ok && missing.error.code).toBe('NOT_FOUND');
    await review(ADMIN, id, { decision: 'reject' });
    const again = await review(ADMIN, id, { decision: 'apply' });
    expect(!again.ok && again.error.code).toBe('CONFLICT');
  });
});

describe('ProfileWriter.save no revive una ficha retirada', () => {
  it('guardar una ficha active sobre una removed no escribe y devuelve false', async () => {
    const a = createProfilesMockAdapters();
    const p = (await a.profiles.findById(target.id))!;
    expect(await a.profiles.save({ ...p, status: 'removed' })).toBe(true);
    expect(await a.profiles.save({ ...p, status: 'verified' })).toBe(false);
    expect((await a.profiles.findById(target.id))?.status).toBe('removed');
  });
});
