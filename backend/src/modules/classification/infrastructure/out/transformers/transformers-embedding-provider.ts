import type { EmbeddingProvider } from '../../../application/ports/out/embedding-provider';

const MODEL = 'Xenova/multilingual-e5-small';
/** Revisión fija del modelo (cadena de suministro / reproducibilidad, RNF-06). */
const MODEL_REVISION = '761b726dd34fb83930e26aab4e9ac3899aa1fa78';

interface Extractor {
  (
    texts: string[],
    opts: { pooling: 'mean'; normalize: boolean },
  ): Promise<{ tolist(): number[][] }>;
}

async function loadExtractor(): Promise<Extractor> {
  const { pipeline } = await import('@huggingface/transformers');
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
