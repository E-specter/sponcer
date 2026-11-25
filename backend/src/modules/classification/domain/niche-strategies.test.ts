import { describe, expect, it } from 'vitest';
import { MAX_CLASSIFIED_NICHES, type IgProfileSnapshot } from '@sponcer/contracts';
import { fixtureProfiles } from '@sponcer/contracts/fixtures';
import { extractFeatures } from './features';
import { classifyNiches, rulesStrategy, type NicheInput } from './niche-strategies';

const snapshotOf = (handle: string): IgProfileSnapshot =>
  fixtureProfiles.find((f) => f.snapshot.handle === handle)!.snapshot;

const inputOf = (over: Partial<NicheInput>): NicheInput => ({
  declared: [],
  businessCategory: null,
  hashtags: [],
  text: '',
  similarities: {},
  ...over,
});

const PRECISION = 10;
const TOP_SIM = 0.9;
const NEAR_TOP_SIM = 0.89;
const LOW_SIM = 0.5;

describe('features', () => {
  it('tier, engagement promedio y hashtags únicos', () => {
    const snap = snapshotOf('sofi.moda.demo');
    const f = extractFeatures(snap, null);
    const expected =
      snap.posts.reduce((s, p) => s + (p.likes + p.comments) / snap.followers, 0) /
      snap.posts.length;
    expect(f.tier).toBe('nano');
    expect(f.engagementRate).toBeCloseTo(expected, PRECISION);
    expect(f.hashtags).toContain('moda');
    expect(new Set(f.hashtags).size).toBe(f.hashtags.length);
  });

  it('sin seguidores o sin posts: engagement 0', () => {
    const base = snapshotOf('sofi.moda.demo');
    expect(extractFeatures({ ...base, followers: 0 }, null).engagementRate).toBe(0);
    expect(extractFeatures({ ...base, posts: [] }, null).engagementRate).toBe(0);
  });
});

describe('estrategia de reglas', () => {
  it('usa categoría de negocio y hashtags en español (con tildes y mayúsculas)', () => {
    const out = rulesStrategy.classify(
      inputOf({
        businessCategory: 'Fashion Model',
        hashtags: ['Belleza', 'SKINCARE'],
        text: 'Rutina de maquillaje',
      }),
    );
    expect(out.map((s) => s.niche)).toEqual(expect.arrayContaining(['moda', 'belleza']));
    expect(out.every((s) => s.source === 'rules')).toBe(true);
  });
});

describe('prioridad declarado > reglas > embedding', () => {
  const similarities = { gaming: TOP_SIM, musica: NEAR_TOP_SIM, finanzas: LOW_SIM };

  it('los declarados van primero, luego reglas, luego embedding, sin repetir', () => {
    const out = classifyNiches(
      inputOf({
        declared: ['fitness'],
        hashtags: ['fitness', 'receta'],
        similarities: { ...similarities, fitness: LOW_SIM },
      }),
    );
    expect(out.map((s) => [s.niche, s.source])).toEqual([
      ['fitness', 'declared'],
      ['gastronomia', 'rules'],
      ['gaming', 'embedding'],
    ]);
  });

  it('sin declarados ni reglas, el embedding aporta los nichos más cercanos', () => {
    const out = classifyNiches(inputOf({ similarities }));
    expect(out.map((s) => s.niche)).toEqual(['gaming', 'musica']);
    expect(out.every((s) => s.source === 'embedding')).toBe(true);
  });

  it('nunca supera MAX_CLASSIFIED_NICHES', () => {
    const out = classifyNiches(inputOf({ declared: ['moda', 'belleza', 'fitness'], similarities }));
    expect(out).toHaveLength(MAX_CLASSIFIED_NICHES);
    expect(out.every((s) => s.source === 'declared')).toBe(true);
  });
});
