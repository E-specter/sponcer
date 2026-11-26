import { describe, expect, it } from 'vitest';
import { DomainError } from '../../../../shared/errors';
import { createEventBus } from '../../../../shared/events/event-bus';
import { err, ok } from '../../../../shared/result';
import { createProfilesMockAdapters } from '../../infrastructure/out/mock/mock-adapters';
import type { OnDemandIngester } from '../ports/out/on-demand-ingester';
import { createProfileAssembler } from '../profile-assembler';
import { makeAdminAddProfile } from './admin-add-profile';

const BURST = 15;
const NEW = 'nuevo.handle';
const setup = (ingest: OnDemandIngester['ingest']) => {
  const a = createProfilesMockAdapters();
  const bus = createEventBus();
  const events: string[] = [];
  bus.subscribe('ProfileIngested', (e) => void events.push(e.igHandle));
  const add = makeAdminAddProfile({
    profiles: a.profiles,
    writer: a.profiles,
    ingester: { ingest },
    bus,
    assembler: createProfileAssembler({
      snapshots: a.snapshots,
      classifications: a.classifications,
      services: a.services,
      now: () => new Date(0),
    }),
  });
  return { a, add, events };
};

describe('adminAddProfile', () => {
  it('crea la ficha sin dueno con el rol pedido y publica ProfileIngested', async () => {
    const { a, add, events } = setup(async () => ok({ snapshotId: 's' }));
    const r = await add('admin@x.pe', NEW, 'brand');
    expect(r.ok && r.value).toMatchObject({ handle: NEW, role: 'brand', status: 'unclaimed' });
    expect(await a.profiles.findByHandle(NEW)).toMatchObject({ ownerUserId: null, role: 'brand' });
    expect(events).toEqual([NEW]);
  });

  it('sin limite por usuario: varias altas seguidas funcionan', async () => {
    const { add } = setup(async () => ok({ snapshotId: 's' }));
    const rs = await Promise.all(
      Array.from({ length: BURST }, (_, i) => add('a@x.pe', `h.${i}`, 'creator')),
    );
    expect(rs.every((r) => r.ok)).toBe(true);
  });

  it('ficha existente: CONFLICT sin llamar a la ingesta', async () => {
    let calls = 0;
    const { add } = setup(async () => {
      calls++;
      return ok({ snapshotId: 's' });
    });
    await add('a@x.pe', NEW, 'creator');
    const again = await add('a@x.pe', NEW, 'creator');
    expect(!again.ok && again.error.code).toBe('CONFLICT');
    expect(calls).toBe(1);
  });

  it('cuenta bloqueada/privada: propaga el error y no crea nada', async () => {
    const { a, add } = setup(async () => err(new DomainError('FORBIDDEN', 'Perfil excluido')));
    const r = await add('a@x.pe', NEW, 'creator');
    expect(!r.ok && r.error.code).toBe('FORBIDDEN');
    expect(await a.profiles.findByHandle(NEW)).toBeNull();
  });
});
