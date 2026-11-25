import { describe, expect, it, vi } from 'vitest';
import { demoUser, fixtureProfiles } from '@sponcer/contracts/fixtures';
import { makeGetProfile } from '../../src/modules/profiles/application/use-cases/get-profile';
import type { ProfileAssembler } from '../../src/modules/profiles/application/profile-assembler';
import { DomainError } from '../../src/shared/errors';
import { createEventBus } from '../../src/shared/events/event-bus';
import { createWindowLimiter } from '../../src/shared/rate-limit';
import { err, ok } from '../../src/shared/result';

/**
 * Matriz de privacidad de la ingesta bajo demanda (RF-01, RNF-05) con un ingester simulado: los motivos por los que
 * un handle no se ficha (privada, no profesional, bloqueada, inválida) NO se distinguen hacia el cliente.
 */
const HANDLE = 'cuenta.desconocida';
const SNAPSHOT_ID = '11111111-1111-4111-8111-111111111111';
const LIMIT = 2;
const HOUR_MS = 3_600_000;
const REFERENCE = fixtureProfiles[0]!;

const REJECTIONS: Array<[string, DomainError]> = [
  ['cuenta privada', new DomainError('FORBIDDEN', 'Solo se ingieren cuentas públicas')],
  ['cuenta no profesional', new DomainError('FORBIDDEN', 'Solo se ingieren cuentas profesionales')],
  [
    'handle bloqueado a pedido del titular',
    new DomainError('FORBIDDEN', 'Perfil excluido a pedido del titular'),
  ],
  ['handle inválido', new DomainError('VALIDATION_ERROR', 'Handle de Instagram inválido')],
  ['inexistente en el proveedor', new DomainError('NOT_FOUND', 'Perfil @x no encontrado')],
];

function setup(ingestResult: ReturnType<typeof ok> | ReturnType<typeof err>) {
  const save = vi.fn(async () => true);
  const ingest = vi.fn(async () => ingestResult as never);
  const assembler = {
    detail: async (p: { id: string; handle: string }) => ({ id: p.id, handle: p.handle }),
  } as unknown as ProfileAssembler;
  const clock = { now: new Date('2026-01-01T10:00:00Z') };
  const get = makeGetProfile({
    profiles: { findByHandle: async () => null } as never,
    assembler,
    onDemand: {
      ingester: { ingest },
      writer: { save },
      bus: createEventBus(),
      limiter: createWindowLimiter({ limit: LIMIT, windowMs: HOUR_MS, now: () => clock.now }),
    },
  });
  return { get, save, ingest, clock };
}

describe('getProfile bajo demanda · privacidad', () => {
  it.each(REJECTIONS)('%s: NOT_FOUND, sin crear ficha', async (_motivo, error) => {
    const { get, save } = setup(err(error));
    const r = await get(HANDLE, demoUser.id);
    expect(!r.ok && r.error.code).toBe('NOT_FOUND');
    expect(save).not.toHaveBeenCalled();
  });

  it('todos los motivos de rechazo devuelven EXACTAMENTE el mismo error (no revela por qué)', async () => {
    const bodies = await Promise.all(
      REJECTIONS.map(async ([, error]) => {
        const r = await setup(err(error)).get(HANDLE, demoUser.id);
        return !r.ok
          ? { code: r.error.code, message: r.error.message, details: r.error.details }
          : null;
      }),
    );
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
  });

  it('un fallo del proveedor sí se informa (UPSTREAM_ERROR), no se disfraza de "no existe"', async () => {
    const { get } = setup(
      err(new DomainError('UPSTREAM_ERROR', 'Falló la ingesta en el proveedor')),
    );
    const r = await get(HANDLE, demoUser.id);
    expect(!r.ok && r.error.code).toBe('UPSTREAM_ERROR');
  });

  it('el límite corta ANTES de llamar al proveedor (cada llamada cuesta crédito)', async () => {
    const { get, ingest } = setup(ok({ snapshotId: SNAPSHOT_ID }));
    await Promise.all(Array.from({ length: LIMIT }, (_, n) => get(`${HANDLE}.${n}`, demoUser.id)));
    const blocked = await get(`${HANDLE}.x`, demoUser.id);
    expect(!blocked.ok && blocked.error.code).toBe('RATE_LIMITED');
    expect(ingest).toHaveBeenCalledTimes(LIMIT);
  });

  it('una colisión del unique(ig_handle) al crear no revienta: re-lee y responde la ficha ganadora', async () => {
    const winner = { id: REFERENCE.id, handle: HANDLE, status: 'unclaimed' };
    let reads = 0;
    const get = makeGetProfile({
      profiles: { findByHandle: async () => (reads++ === 0 ? null : winner) } as never,
      assembler: {
        detail: async (p: { id: string }) => ({ id: p.id }),
      } as unknown as ProfileAssembler,
      onDemand: {
        ingester: { ingest: async () => ok({ snapshotId: SNAPSHOT_ID }) },
        writer: {
          save: async () => {
            throw new DomainError('CONFLICT', 'Ya existe un registro con esos datos');
          },
        },
        bus: createEventBus(),
        limiter: createWindowLimiter({ limit: LIMIT, windowMs: HOUR_MS, now: () => new Date() }),
      },
    });
    const r = await get(HANDLE, demoUser.id);
    expect(r.ok && r.value).toEqual({ id: REFERENCE.id });
  });
});
