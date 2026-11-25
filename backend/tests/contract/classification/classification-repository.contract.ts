import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Classification } from '@sponcer/contracts';
import type { ClassificationRepository } from '../../../src/modules/classification/application/ports/out/classification-repository';
import { EMBEDDING_DIMENSION } from '../../../src/modules/classification/application/ports/out/embedding-provider';

export interface ClassificationHarness {
  repo: ClassificationRepository;
  /** Un perfil que existe y no tiene clasificación (en BD real hay FK); cada llamada, uno distinto. */
  newProfileId: () => Promise<string>;
}

const FLOAT4_DIGITS = 5;
const MIN_PAIR = 2;
const CONFIDENCE = 0.9;
const ENGAGEMENT = 0.05;
const FOLLOWERS_A = 12_000;
const FOLLOWERS_LOW = 1000;
const FOLLOWERS_HIGH = 50_000;

/** Vector unitario con la dimensión del modelo; `seed` lo hace distinto de otro. */
const unit = (seed: number): number[] => {
  const raw = Array.from({ length: EMBEDDING_DIMENSION }, (_, i) => Math.sin(seed * (i + 1)));
  const norm = Math.sqrt(raw.reduce((a, x) => a + x * x, 0));
  return raw.map((x) => x / norm);
};
const classification = (followers: number): Classification => ({
  niches: [{ niche: 'moda', confidence: CONFIDENCE, source: 'declared' }],
  tier: 'micro',
  followers,
  engagementRate: ENGAGEMENT,
  classifiedAt: '2026-01-01T10:00:00.000Z',
});
const expectClose = (got: number[] | null | undefined, want: number[]) => {
  expect(got).toHaveLength(want.length);
  want.forEach((x, i) => expect(got![i]).toBeCloseTo(x, FLOAT4_DIGITS));
};

/** Suite de `ClassificationRepository`: clasificación + embedding por perfil (upsert por profileId). */
export function describeClassificationRepositoryContract(
  factory: () => ClassificationHarness | Promise<ClassificationHarness>,
): void {
  describe('ClassificationRepository (contrato del puerto)', () => {
    it('sin guardar: getClassification y getEmbedding devuelven null', async () => {
      const { repo, newProfileId } = await factory();
      const id = await newProfileId();
      expect(await repo.getClassification(id)).toBeNull();
      expect(await repo.getEmbedding(id)).toBeNull();
    });

    it('save + get conserva la clasificación y el embedding (float4 en pgvector)', async () => {
      const { repo, newProfileId } = await factory();
      const id = await newProfileId();
      const c = classification(FOLLOWERS_A);
      await repo.save(id, c, unit(1));
      expect(await repo.getClassification(id)).toEqual(c);
      expectClose(await repo.getEmbedding(id), unit(1));
    });

    it('un segundo save del mismo perfil reemplaza ambos (no duplica)', async () => {
      const { repo, newProfileId } = await factory();
      const id = await newProfileId();
      await repo.save(id, classification(FOLLOWERS_LOW), unit(1));
      const next = classification(FOLLOWERS_HIGH);
      await repo.save(id, next, unit(MIN_PAIR));
      expect(await repo.getClassification(id)).toEqual(next);
      expectClose(await repo.getEmbedding(id), unit(MIN_PAIR));
    });

    it('getEmbeddings devuelve solo los perfiles que tienen embedding, sin mezclar', async () => {
      const { repo, newProfileId } = await factory();
      const [a, b, none] = [await newProfileId(), await newProfileId(), await newProfileId()];
      await repo.save(a, classification(1), unit(1));
      await repo.save(b, classification(MIN_PAIR), unit(MIN_PAIR));
      const map = await repo.getEmbeddings([a, b, none, randomUUID()]);
      expect([...map.keys()].sort()).toEqual([a, b].sort());
      expectClose(map.get(a), unit(1));
      expectClose(map.get(b), unit(MIN_PAIR));
    });

    it('getEmbeddings([]) devuelve un mapa vacío', async () => {
      const { repo } = await factory();
      expect((await repo.getEmbeddings([])).size).toBe(0);
    });

    it('deleteByProfile borra clasificación y embedding de ese perfil y no toca a otro (Ley 29733)', async () => {
      const { repo, newProfileId } = await factory();
      const [gone, kept] = [await newProfileId(), await newProfileId()];
      await repo.save(gone, classification(1), unit(1));
      await repo.save(kept, classification(MIN_PAIR), unit(MIN_PAIR));
      await repo.deleteByProfile(gone);
      expect(await repo.getClassification(gone)).toBeNull();
      expect(await repo.getEmbedding(gone)).toBeNull();
      expect((await repo.getEmbeddings([gone, kept])).size).toBe(1);
      expect(await repo.getClassification(kept)).not.toBeNull();
    });

    it('deleteByProfile de un perfil sin clasificación no falla', async () => {
      const { repo, newProfileId } = await factory();
      await expect(repo.deleteByProfile(await newProfileId())).resolves.toBeUndefined();
    });

    it('la clasificación de un perfil no se ve desde otro (ACL)', async () => {
      const { repo, newProfileId } = await factory();
      const [mine, other] = [await newProfileId(), await newProfileId()];
      await repo.save(mine, classification(1), unit(1));
      expect(await repo.getClassification(other)).toBeNull();
      expect(await repo.getEmbedding(other)).toBeNull();
    });
  });
}
