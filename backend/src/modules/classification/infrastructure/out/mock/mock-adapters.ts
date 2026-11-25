import type { Classification } from '@sponcer/contracts';
import { tokenize } from '../../../domain/text';
import type { ClassificationRepository } from '../../../application/ports/out/classification-repository';
import {
  EMBEDDING_DIMENSION,
  type EmbeddingProvider,
} from '../../../application/ports/out/embedding-provider';

const FNV_OFFSET = 2_166_136_261;
const FNV_PRIME = 16_777_619;
const UINT32_MASK = 0xffff_ffff;
const SIGN_BIT_SHIFT = 16;
const EMPTY_TEXT_TOKEN = '__vacio__';
const PARITY = 2;

/** FNV-1a de 32 bits: estable entre ejecuciones. */
const fnv1a = (s: string): number =>
  [...s].reduce(
    (h, ch) => (((h ^ ch.charCodeAt(0)) >>> 0) * FNV_PRIME) & UINT32_MASK,
    FNV_OFFSET,
  ) >>> 0;

/** Bolsa de palabras con hashing: textos con palabras en común tienen coseno > 0. Determinista y de norma 1. */
export function hashEmbedding(text: string): number[] {
  const tokens = tokenize(text);
  const counts = new Map<number, number>();
  (tokens.length ? tokens : [EMPTY_TEXT_TOKEN]).forEach((t) => {
    const h = fnv1a(t);
    const sign = (h >>> SIGN_BIT_SHIFT) % PARITY ? 1 : -1;
    counts.set(h % EMBEDDING_DIMENSION, (counts.get(h % EMBEDDING_DIMENSION) ?? 0) + sign);
  });
  const raw = Array.from({ length: EMBEDDING_DIMENSION }, (_, i) => counts.get(i) ?? 0);
  const norm = Math.sqrt(raw.reduce((s, x) => s + x * x, 0)) || 1;
  return raw.map((x) => x / norm);
}

export const createMockEmbeddingProvider = (): EmbeddingProvider => ({
  embed: async (texts) => texts.map(hashEmbedding),
});

interface Stored {
  classification: Classification;
  embedding: number[];
}

export function createInMemoryClassificationRepository(): ClassificationRepository {
  const store = new Map<string, Stored>();
  return {
    save: async (profileId, classification, embedding) =>
      void store.set(profileId, { classification, embedding }),
    getClassification: async (id) => store.get(id)?.classification ?? null,
    getEmbedding: async (id) => store.get(id)?.embedding ?? null,
    deleteByProfile: async (id) => void store.delete(id),
    getEmbeddings: async (ids) =>
      new Map(
        ids.flatMap((id) =>
          store.has(id) ? [[id, store.get(id)!.embedding] as [string, number[]]] : [],
        ),
      ),
  };
}
