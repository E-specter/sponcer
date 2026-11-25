import { describe, expect, it } from 'vitest';
import { DomainError } from '../../../../shared/errors';
import { createEventBus } from '../../../../shared/events/event-bus';
import { createWindowLimiter } from '../../../../shared/rate-limit';
import { err, ok } from '../../../../shared/result';
import { createProfilesMockAdapters } from '../../infrastructure/out/mock/mock-adapters';
import type { OnDemandIngester } from '../ports/out/on-demand-ingester';
import { createProfileAssembler } from '../profile-assembler';
import { makeGetProfile } from './get-profile';

const NEW = 'nuevo.handle';
const LIMIT = 1;
const WINDOW_MS = 1000;

type Mocks = ReturnType<typeof createProfilesMockAdapters>;
type Ingest = OnDemandIngester['ingest'];

const setup = (ingest: (handle: string, a: Mocks) => ReturnType<Ingest>) => {
  const a = createProfilesMockAdapters();
  const bus = createEventBus();
  const events: string[] = [];
  bus.subscribe('ProfileIngested', (e) => void events.push(e.igHandle));
  const assembler = createProfileAssembler({
    snapshots: a.snapshots,
    classifications: a.classifications,
    services: a.services,
    now: () => new Date(0),
  });
  const get = makeGetProfile({
    profiles: a.profiles,
    assembler,
    onDemand: {
      ingester: { ingest: (h) => ingest(h, a) },
      writer: a.profiles,
      bus,
      limiter: createWindowLimiter({ limit: LIMIT, windowMs: WINDOW_MS, now: () => new Date(0) }),
    },
  });
  return { a, get, events };
};

describe('getProfile con ingesta bajo demanda', () => {
  it('handle desconocido: crea ficha unclaimed/creator y publica ProfileIngested con el perfil ya creado', async () => {
    const { a, get, events } = setup(async () => ok({ snapshotId: 's' }));
    const r = await get(NEW, 'u');
    expect(r.ok).toBe(true);
    const created = await a.profiles.findByHandle(NEW);
    expect(created).toMatchObject({ role: 'creator', status: 'unclaimed', ownerUserId: null });
    expect(events).toEqual([NEW]);
  });

  it('privada/no profesional/bloqueada: NOT_FOUND sin crear nada', async () => {
    const { a, get } = setup(async () => err(new DomainError('FORBIDDEN', 'motivo interno')));
    const r = await get(NEW, 'u');
    expect(!r.ok && r.error.code).toBe('NOT_FOUND');
    expect(!r.ok && r.error.message).not.toContain('motivo');
    expect(await a.profiles.findByHandle(NEW)).toBeNull();
  });

  it('colisión de unique(ig_handle) al guardar: devuelve la ficha existente y no repite el evento', async () => {
    const { get, events } = setup(async (_h, a) => {
      // Otra petición gana la carrera justo mientras esta ingiere.
      await a.profiles.save({
        id: 'ganadora',
        handle: NEW,
        role: 'creator',
        status: 'unclaimed',
        ownerUserId: null,
        declared: null,
      });
      return ok({ snapshotId: 's' });
    });
    const r = await get(NEW, 'u');
    expect(r.ok && r.value.id).toBe('ganadora');
    expect(events).toEqual([]);
  });

  it('límite por usuario: la 2.ª ingesta es RATE_LIMITED', async () => {
    const { get } = setup(async () => err(new DomainError('FORBIDDEN', 'x')));
    await get('uno.mas', 'u');
    const r = await get('otro.mas', 'u');
    expect(!r.ok && r.error.code).toBe('RATE_LIMITED');
  });
});
