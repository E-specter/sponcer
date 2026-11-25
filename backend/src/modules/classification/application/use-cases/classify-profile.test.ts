import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '@sponcer/contracts';
import { fixtureProfiles } from '@sponcer/contracts/fixtures';
import { createEventBus } from '../../../../shared/events/event-bus';
import { createIngestionModule } from '../../../ingestion';
import { createProfilesModule } from '../../../profiles';
import { createClassificationModule } from '../../classification.module';
import { EMBEDDING_DIMENSION } from '../ports/out/embedding-provider';

const CLAIMED_CREATOR = fixtureProfiles.find((p) => p.role === 'creator' && p.declared)!;
const UNCLAIMED_CREATOR = fixtureProfiles.find((p) => p.role === 'creator' && !p.declared)!;
const UNIT_NORM_DIGITS = 6;

function setup() {
  const bus = createEventBus();
  const classified: DomainEvent[] = [];
  bus.subscribe('ProfileClassified', (e) => void classified.push(e));
  const profiles = createProfilesModule({ adapter: 'mock', bus });
  const ingestion = createIngestionModule({ adapter: 'mock', bus });
  const module = createClassificationModule({
    adapter: 'mock',
    bus,
    profiles: profiles.api,
    snapshots: ingestion.api,
  });
  return { api: module.api, classified };
}

describe('ClassifyProfile + classifyAll (mock)', () => {
  it('backfill: clasifica todos los fixtures y publica ProfileClassified', async () => {
    const s = setup();
    const r = await s.api.classifyAll();
    expect(r).toEqual({ classified: fixtureProfiles.length, failed: 0 });
    expect(s.classified).toHaveLength(fixtureProfiles.length);
  });

  it('perfil con nichos declarados: declarados primero con confianza 1', async () => {
    const s = setup();
    await s.api.classifyAll();
    const c = await s.api.getClassification(CLAIMED_CREATOR.id);
    const declared =
      CLAIMED_CREATOR.declared?.role === 'creator' ? CLAIMED_CREATOR.declared.niches : [];
    expect(
      c?.niches.slice(0, declared.length).map((n) => [n.niche, n.source, n.confidence]),
    ).toEqual(declared.map((n) => [n, 'declared', 1]));
  });

  it('perfil sin declarar: nichos por reglas (categoría + hashtags)', async () => {
    const s = setup();
    await s.api.classifyAll();
    const c = await s.api.getClassification(UNCLAIMED_CREATOR.id);
    expect(c?.niches[0]?.source).toBe('rules');
    expect(c?.niches[0]?.niche).toBe('belleza'); // diego.belleza.demo: Health/beauty + #makeup #skincare
  });

  it('embedding de 384 dimensiones y norma 1', async () => {
    const s = setup();
    await s.api.classifyAll();
    const e = await s.api.getEmbedding(CLAIMED_CREATOR.id);
    expect(e).toHaveLength(EMBEDDING_DIMENSION);
    expect(Math.sqrt((e ?? []).reduce((a, x) => a + x * x, 0))).toBeCloseTo(1, UNIT_NORM_DIGITS);
  });

  it('sin clasificar todavía: null', async () => {
    const s = setup();
    expect(await s.api.getClassification(CLAIMED_CREATOR.id)).toBeNull();
  });
});
