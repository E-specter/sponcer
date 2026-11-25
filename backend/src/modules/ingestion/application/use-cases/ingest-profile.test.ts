import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '@sponcer/contracts';
import { createEventBus } from '../../../../shared/events/event-bus';
import { createIngestionModule } from '../../ingestion.module';

const HOUR_MS = 3_600_000;
const BEFORE_TTL_HOURS = 23;
const AFTER_TTL_HOURS = 25;
const NEW_HANDLE = 'nuevo.perfil.demo';

function setup() {
  let clock = new Date('2026-11-25T10:00:00Z');
  const bus = createEventBus();
  const events: DomainEvent[] = [];
  bus.subscribe('ProfileIngested', (e) => void events.push(e));
  const mod = createIngestionModule({ adapter: 'mock', bus, now: () => clock });
  return { mod, events, advance: (h: number) => (clock = new Date(clock.getTime() + h * HOUR_MS)) };
}

describe('IngestProfile', () => {
  it('ingiere un handle desconocido (perfil genérico determinista) y publica ProfileIngested', async () => {
    const s = setup();
    const a = await s.mod.api.ingestProfile(`@${NEW_HANDLE}`);
    expect(a.ok && a.value.cached).toBe(false);
    expect(s.events).toHaveLength(1);
    expect(await s.mod.api.getLatestSnapshot(NEW_HANDLE)).not.toBeNull();
  });

  it('no reingiere antes de 24 h y sí después', async () => {
    const s = setup();
    await s.mod.api.ingestProfile(NEW_HANDLE);
    s.advance(BEFORE_TTL_HOURS);
    const cached = await s.mod.api.ingestProfile(NEW_HANDLE);
    expect(cached.ok && cached.value.cached).toBe(true);
    expect(s.events).toHaveLength(1);
    s.advance(AFTER_TTL_HOURS - BEFORE_TTL_HOURS);
    const fresh = await s.mod.api.ingestProfile(NEW_HANDLE);
    expect(fresh.ok && fresh.value.cached).toBe(false);
    expect(s.events).toHaveLength(2);
  });

  it('handle inválido: VALIDATION_ERROR', async () => {
    const r = await setup().mod.api.ingestProfile('Nombre Inválido');
    expect(!r.ok && r.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('FetchLiveBio (mock)', () => {
  it('devuelve la bio sin cachear y añade el código pendiente', async () => {
    const s = setup();
    const before = await s.mod.api.fetchLiveBio(NEW_HANDLE);
    s.mod.setPendingCode?.(NEW_HANDLE, 'SPN-1234');
    const after = await s.mod.api.fetchLiveBio(NEW_HANDLE);
    expect(before.ok && before.value.biography).not.toContain('SPN-1234');
    expect(after.ok && after.value.biography).toContain('SPN-1234');
    expect(s.events).toHaveLength(0);
  });
});
