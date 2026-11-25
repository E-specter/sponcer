import { describe, expect, it } from 'vitest';
import type { ProfileCard } from '@sponcer/contracts';
import type { Candidate } from './candidate';
import {
  ENGAGEMENT_CAP,
  UNKNOWN_BUDGET_FIT,
  budgetFit,
  jaccard,
  weightedScore,
} from './weighted-score';

const W_SIMILARITY = 0.5;
const W_NICHES = 0.25;
const W_BUDGET = 0.15;
const W_ENGAGEMENT = 0.1;
const WEIGHTS = [W_SIMILARITY, W_NICHES, W_BUDGET, W_ENGAGEMENT];
const FOLLOWERS = 1000;
const THIRD = 1 / 3;
const TWICE = 2;
const HEAVY = 5;
const PRECISION = 8;
const PRICE = 400;
const BUDGET = 800;
const HALF = 0.5;

const base: ProfileCard = {
  id: '00000000-0000-4000-8000-000000000001',
  handle: 'x.demo',
  role: 'creator',
  fullName: 'X',
  profilePicUrl: null,
  status: 'verified',
  niches: ['moda', 'belleza'],
  tier: 'micro',
  followers: FOLLOWERS,
  engagementRate: 0,
  sector: null,
  minServicePricePen: PRICE,
  budgetMaxPen: null,
  bio: null,
  bioSource: null,
};
const cand = (card: Partial<ProfileCard>, embedding: number[] | null): Candidate => ({
  card: { ...base, ...card },
  embedding,
});

const creator = (embedding: number[] | null, over: Partial<ProfileCard> = {}) =>
  cand(over, embedding);
const brand = (embedding: number[] | null, over: Partial<ProfileCard> = {}) =>
  cand({ role: 'brand', minServicePricePen: null, budgetMaxPen: BUDGET, ...over }, embedding);

describe('componentes', () => {
  it('jaccard', () => {
    expect(jaccard(['moda', 'belleza'], ['belleza', 'viajes'])).toBeCloseTo(THIRD, PRECISION);
    expect(jaccard([], [])).toBe(0);
  });

  it('budgetFit: dentro 1, fuera decae, desconocido neutro', () => {
    expect(budgetFit(PRICE, BUDGET)).toBe(1);
    expect(budgetFit(BUDGET * TWICE, BUDGET)).toBe(HALF);
    expect(budgetFit(null, BUDGET)).toBe(UNKNOWN_BUDGET_FIT);
    expect(budgetFit(PRICE, null)).toBe(UNKNOWN_BUDGET_FIT);
  });
});

describe('WeightedScore', () => {
  it('combina los 4 componentes con los pesos', () => {
    const v = [1, 0];
    const viewer = brand(v, { niches: ['moda', 'belleza'] });
    const other = creator(v, { niches: ['moda', 'belleza'], engagementRate: ENGAGEMENT_CAP });
    const r = weightedScore(WEIGHTS).score(viewer, other);
    expect(r.components).toEqual({ similarity: 1, niches: 1, budget: 1, engagement: 1 });
    expect(r.score).toBeCloseTo(1, PRECISION);
  });

  it('score = suma ponderada', () => {
    const viewer = brand([1, 0]);
    const other = creator([0, 1], {
      niches: ['moda', 'viajes'],
      engagementRate: ENGAGEMENT_CAP / TWICE,
    });
    const r = weightedScore(WEIGHTS).score(viewer, other);
    // similitud 0, nichos 1/3, presupuesto 1, engagement 0.5
    expect(r.score).toBeCloseTo(W_NICHES * THIRD + W_BUDGET + W_ENGAGEMENT * HALF, PRECISION);
  });

  it('reasons: los 2 componentes que más aportan', () => {
    const v = [1, 0];
    const r = weightedScore(WEIGHTS).score(
      brand(v),
      creator(v, { niches: ['viajes'], engagementRate: 0 }),
    );
    // similitud 0.5, nichos 0, presupuesto 0.15, engagement 0
    expect(r.reasons).toEqual(['similarity', 'budget']);
  });

  it('sin embeddings la similitud es 0 y no es razón', () => {
    const r = weightedScore(WEIGHTS).score(brand(null), creator(null));
    expect(r.components.similarity).toBe(0);
    expect(r.reasons).not.toContain('similarity');
  });

  it('pesos que no suman 1 se normalizan: el score nunca pasa de 1', () => {
    const v = [1, 0];
    const r = weightedScore([HEAVY, HEAVY, HEAVY, HEAVY]).score(
      brand(v),
      creator(v, { engagementRate: ENGAGEMENT_CAP }),
    );
    expect(r.score).toBeLessThanOrEqual(1);
  });

  it('cambiar los pesos cambia el orden (Strategy configurable)', () => {
    const viewer = brand([1, 0]);
    const similar = creator([1, 0], { niches: ['viajes'] });
    const sameNiche = creator([0, 1], { niches: ['moda', 'belleza'] });
    const bySimilarity = weightedScore([1, 0, 0, 0]);
    const byNiches = weightedScore([0, 1, 0, 0]);
    expect(bySimilarity.score(viewer, similar).score).toBeGreaterThan(
      bySimilarity.score(viewer, sameNiche).score,
    );
    expect(byNiches.score(viewer, sameNiche).score).toBeGreaterThan(
      byNiches.score(viewer, similar).score,
    );
  });
});

describe('similitud precalculada (pgvector)', () => {
  it('usa candidate.similarity en vez de recalcular el coseno', () => {
    const viewer = cand({ role: 'brand' }, null);
    const withSim: Candidate = { ...cand({}, null), similarity: HALF };
    expect(weightedScore(WEIGHTS).score(viewer, withSim).components.similarity).toBe(HALF);
  });
});
