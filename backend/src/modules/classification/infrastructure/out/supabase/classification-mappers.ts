import { Classification } from '@sponcer/contracts';

/** Fila de `profile_classifications`: no sale de este adaptador. */
export interface ClassificationRow {
  niches: unknown;
  tier: string;
  followers: number;
  engagement_rate: number;
  classified_at: string;
}

export const MODEL_NAME = 'multilingual-e5-small';

export const classificationToRow = (profileId: string, c: Classification) => ({
  profile_id: profileId,
  niches: c.niches,
  tier: c.tier,
  followers: c.followers,
  engagement_rate: c.engagementRate,
  classified_at: c.classifiedAt,
});

/** Revalida contra el contrato: una fila corrupta se trata como "sin clasificar". */
export const rowToClassification = (row: ClassificationRow): Classification | null => {
  const parsed = Classification.safeParse({
    niches: row.niches,
    tier: row.tier,
    followers: row.followers,
    engagementRate: row.engagement_rate,
    classifiedAt: new Date(row.classified_at).toISOString(),
  });
  return parsed.success ? parsed.data : null;
};

/** pgvector (vía PostgREST) usa el literal de texto `[a,b,...]` en ambos sentidos. */
export const toVectorLiteral = (v: number[]): string => `[${v.join(',')}]`;
export const fromVectorLiteral = (s: string): number[] => JSON.parse(s) as number[];

export const embeddingToRow = (profileId: string, embedding: number[]) => ({
  profile_id: profileId,
  embedding: toVectorLiteral(embedding),
  model: MODEL_NAME,
});
