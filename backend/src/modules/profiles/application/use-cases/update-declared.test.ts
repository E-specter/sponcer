import { describe, expect, it } from 'vitest';
import { demoInfluencer, demoUser, fixtureProfiles } from '@sponcer/contracts/fixtures';
import type { Declared } from '@sponcer/contracts';
import { createEventBus } from '../../../../shared/events/event-bus';
import { createProfilesMockAdapters } from '../../infrastructure/out/mock/mock-adapters';
import { createProfileAssembler } from '../profile-assembler';
import { makeUpdateDeclared } from './update-declared';

const STRANGER = '00000000-0000-4000-8000-000000000000';
// La Influencer demo es dueña del creador; la Empresa demo, de las marcas (ADR-009).
const ownerOf = { creator: demoInfluencer, brand: demoUser };
const owned = (role: 'creator' | 'brand') =>
  fixtureProfiles.find((p) => p.ownerUserId === ownerOf[role].id && p.role === role)!;
const creatorDeclared: Declared = { role: 'creator', niches: ['moda'], accountType: 'creator' };

function setup() {
  const bus = createEventBus();
  const events: unknown[] = [];
  bus.subscribe('ProfileDeclaredDataChanged', (e) => void events.push(e));
  const a = createProfilesMockAdapters();
  const assembler = createProfileAssembler({ ...a, now: () => new Date() });
  return {
    events,
    update: makeUpdateDeclared({ reader: a.profiles, writer: a.profiles, assembler, bus }),
  };
}

describe('updateDeclared', () => {
  it('el dueño actualiza y se publica el evento', async () => {
    const { update, events } = setup();
    const r = await update(demoInfluencer.id, owned('creator').id, creatorDeclared);
    expect(r.ok && r.value.declared).toEqual(creatorDeclared);
    expect(events).toHaveLength(1);
  });

  it('un tercero recibe FORBIDDEN', async () => {
    const { update, events } = setup();
    const r = await update(STRANGER, owned('creator').id, creatorDeclared);
    expect(!r.ok && r.error.code).toBe('FORBIDDEN');
    expect(events).toHaveLength(0);
  });

  it('el rol del body debe coincidir con el del perfil', async () => {
    const { update, events } = setup();
    const r = await update(demoInfluencer.id, owned('creator').id, owned('brand').declared!);
    expect(!r.ok && r.error.code).toBe('VALIDATION_ERROR');
    expect(events).toHaveLength(0);
  });
});
