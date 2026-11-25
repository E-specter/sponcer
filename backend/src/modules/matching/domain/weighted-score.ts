import { MAX_MATCH_REASONS, type Niche, type ScoreComponent } from '@sponcer/contracts';
import type { Candidate } from './candidate';

/** Orden de los pesos de `MATCH_WEIGHTS`. */
export const SCORE_COMPONENTS: readonly ScoreComponent[] = [
  'similarity',
  'niches',
  'budget',
  'engagement',
];

/** Engagement (likes + comentarios / seguidores) que ya cuenta como 1.0. */
export const ENGAGEMENT_CAP = 0.1;
/** Ajuste de presupuesto cuando falta el precio o el presupuesto. */
export const UNKNOWN_BUDGET_FIT = 0.5;

export interface ScoreResult {
  score: number;
  /** Los MAX_MATCH_REASONS componentes que más aportan. */
  reasons: ScoreComponent[];
  components: Record<ScoreComponent, number>;
}

/** Strategy de puntaje (ADR-003): otra estrategia (modelo entrenado) implementa lo mismo. */
export interface ScoringStrategy {
  score(viewer: Candidate, candidate: Candidate): ScoreResult;
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

export function cosine(a: number[], b: number[]): number {
  const dot = a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0);
  const norm = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  const denom = norm(a) * norm(b);
  return denom ? dot / denom : 0;
}

export function jaccard(a: Niche[], b: Niche[]): number {
  const union = new Set([...a, ...b]).size;
  return union ? new Set(a.filter((n) => b.includes(n))).size / union : 0;
}

/** 1 si el precio mínimo del creador cabe en el presupuesto; fuera de él decae como presupuesto / precio. */
export function budgetFit(minPricePen: number | null, budgetMaxPen: number | null): number {
  if (minPricePen === null || budgetMaxPen === null) return UNKNOWN_BUDGET_FIT;
  return minPricePen <= budgetMaxPen ? 1 : clamp01(budgetMaxPen / minPricePen);
}

export function weightedScore(weights: readonly number[]): ScoringStrategy {
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  return {
    score(viewer, candidate) {
      const creator = viewer.card.role === 'creator' ? viewer.card : candidate.card;
      const brand = viewer.card.role === 'brand' ? viewer.card : candidate.card;
      const components: Record<ScoreComponent, number> = {
        similarity:
          candidate.similarity !== undefined
            ? clamp01(candidate.similarity)
            : viewer.embedding && candidate.embedding
              ? clamp01(cosine(viewer.embedding, candidate.embedding))
              : 0,
        niches: jaccard(viewer.card.niches, candidate.card.niches),
        budget: budgetFit(creator.minServicePricePen, brand.budgetMaxPen),
        engagement: clamp01(candidate.card.engagementRate / ENGAGEMENT_CAP),
      };
      const contributions = SCORE_COMPONENTS.map((name, i) => ({
        name,
        value: ((weights[i] ?? 0) * components[name]) / total,
      }));
      return {
        score: clamp01(contributions.reduce((s, c) => s + c.value, 0)),
        reasons: [...contributions]
          .filter((c) => c.value > 0)
          .sort((a, b) => b.value - a.value)
          .slice(0, MAX_MATCH_REASONS)
          .map((c) => c.name),
        components,
      };
    },
  };
}
