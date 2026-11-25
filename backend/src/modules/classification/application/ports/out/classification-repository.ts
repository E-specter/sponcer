import type { Classification } from '@sponcer/contracts';

export interface ClassificationRepository {
  save(profileId: string, classification: Classification, embedding: number[]): Promise<void>;
  getClassification(profileId: string): Promise<Classification | null>;
  /** Borra clasificación y embedding (exclusión del titular, Ley 29733). */
  deleteByProfile(profileId: string): Promise<void>;
  getEmbedding(profileId: string): Promise<number[] | null>;
  getEmbeddings(profileIds: string[]): Promise<Map<string, number[]>>;
}
