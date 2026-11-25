import {
  MAX_CLASSIFIED_NICHES,
  NICHES,
  type Niche,
  type NicheScore,
  type NicheSource,
} from '@sponcer/contracts';
import { BUSINESS_CATEGORY_NICHE, NICHE_KEYWORDS } from './niche-catalog';
import { normalizeText, tokenize } from './text';

export interface NicheInput {
  declared: Niche[];
  businessCategory: string | null;
  hashtags: string[];
  text: string;
  /** Similitud coseno perfil↔descripción de cada nicho (la calcula el caso de uso con el EmbeddingProvider). */
  similarities: Partial<Record<Niche, number>>;
}

/** Strategy (ADR-003): cada fuente de nichos es intercambiable y pura. */
export interface NicheStrategy {
  source: NicheSource;
  classify(input: NicheInput): NicheScore[];
}

const DECLARED_CONFIDENCE = 1;
const CATEGORY_CONFIDENCE = 0.85;
const KEYWORD_BASE_CONFIDENCE = 0.55;
const KEYWORD_STEP = 0.1;
const KEYWORD_MAX_CONFIDENCE = 0.8;
/** Nichos de embedding a esta distancia (o menos) de la mejor similitud también cuentan. */
const EMBEDDING_MARGIN = 0.03;

const byConfidenceDesc = (a: NicheScore, b: NicheScore) => b.confidence - a.confidence;

export const declaredStrategy: NicheStrategy = {
  source: 'declared',
  classify: (i) =>
    i.declared.map((niche) => ({ niche, confidence: DECLARED_CONFIDENCE, source: 'declared' })),
};

export const rulesStrategy: NicheStrategy = {
  source: 'rules',
  classify(i) {
    const terms = new Set([...i.hashtags.flatMap(tokenize), ...tokenize(i.text)]);
    const category = i.businessCategory
      ? BUSINESS_CATEGORY_NICHE[normalizeText(i.businessCategory)]
      : undefined;
    return NICHES.map((niche) => {
      const hits = NICHE_KEYWORDS[niche].filter((k) => terms.has(k)).length;
      const keyword = hits
        ? Math.min(KEYWORD_MAX_CONFIDENCE, KEYWORD_BASE_CONFIDENCE + KEYWORD_STEP * (hits - 1))
        : 0;
      const confidence = Math.max(keyword, niche === category ? CATEGORY_CONFIDENCE : 0);
      return { niche, confidence, source: 'rules' as const };
    })
      .filter((s) => s.confidence > 0)
      .sort(byConfidenceDesc);
  },
};

export const embeddingStrategy: NicheStrategy = {
  source: 'embedding',
  classify(i) {
    const ranked = Object.entries(i.similarities)
      .map(([niche, sim]) => ({
        niche: niche as Niche,
        confidence: Math.min(1, Math.max(0, sim)),
        source: 'embedding' as const,
      }))
      .sort(byConfidenceDesc);
    const best = ranked[0]?.confidence ?? 0;
    return ranked.filter((s) => s.confidence >= best - EMBEDDING_MARGIN);
  },
};

/** Prioridad declarado > reglas > embedding. */
export const DEFAULT_STRATEGIES: NicheStrategy[] = [
  declaredStrategy,
  rulesStrategy,
  embeddingStrategy,
];

/** Aplica las estrategias en orden, sin repetir nichos, hasta MAX_CLASSIFIED_NICHES. */
export const classifyNiches = (
  input: NicheInput,
  strategies: NicheStrategy[] = DEFAULT_STRATEGIES,
): NicheScore[] =>
  strategies
    .reduce<NicheScore[]>(
      (acc, s) => [
        ...acc,
        ...s.classify(input).filter((c) => !acc.some((a) => a.niche === c.niche)),
      ],
      [],
    )
    .slice(0, MAX_CLASSIFIED_NICHES);
