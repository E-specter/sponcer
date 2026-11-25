import type { EmbeddingProvider } from '../../../application/ports/out/embedding-provider';

import { MODEL, MODEL_REVISION, modelCacheDir } from './model-config';

export interface Extractor {
  (
    texts: string[],
    opts: { pooling: 'mean'; normalize: boolean },
  ): Promise<{ tolist(): number[][] }>;
}

/** Carga (y descarga si falta) el modelo; también lo usa el script `prefetch-model`. */
export async function loadExtractor(): Promise<Extractor> {
  const { pipeline, env } = await import('@huggingface/transformers');
  env.cacheDir = modelCacheDir();
  return (await pipeline('feature-extraction', MODEL, {
    revision: MODEL_REVISION,
  })) as unknown as Extractor;
}

/** Adaptador real (ADR-003): modelo local con transformers.js, cargado perezosamente (~100 MB la primera vez). */
export function createTransformersEmbeddingProvider(): EmbeddingProvider {
  let extractor: Promise<Extractor> | null = null;
  return {
    async embed(texts, kind = 'query') {
      extractor ??= loadExtractor();
      const output = await (
        await extractor
      )(
        texts.map((t) => `${kind}: ${t}`),
        { pooling: 'mean', normalize: true },
      );
      return output.tolist();
    },
  };
}
