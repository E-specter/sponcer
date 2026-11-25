import { NICHES, type Niche } from '@sponcer/contracts';
import { NICHE_DESCRIPTIONS } from '../domain/niche-catalog';
import type { EmbeddingProvider } from './ports/out/embedding-provider';

type NicheVectors = Record<Niche, number[]>;

/** Vectores de las descripciones de nicho: se calculan una sola vez, al primer uso. */
export function createNicheIndex(embeddings: EmbeddingProvider): () => Promise<NicheVectors> {
  const compute = async (): Promise<NicheVectors> => {
    const vectors = await embeddings.embed(
      NICHES.map((n) => NICHE_DESCRIPTIONS[n]),
      'passage',
    );
    return Object.fromEntries(NICHES.map((n, i) => [n, vectors[i] ?? []])) as NicheVectors;
  };
  let cached: Promise<NicheVectors> | null = null;
  return () => (cached ??= compute());
}
