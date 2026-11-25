/** Dimensión de multilingual-e5-small (pgvector `vector(384)`). */
export const EMBEDDING_DIMENSION = 384;

/** e5 distingue "query: " y "passage: "; los perfiles se comparan entre sí como `query`. */
export type EmbedKind = 'query' | 'passage';

export interface EmbeddingProvider {
  /** Vectores normalizados (norma 1) de dimensión EMBEDDING_DIMENSION, en el orden de `texts`. */
  embed(texts: string[], kind?: EmbedKind): Promise<number[][]>;
}
