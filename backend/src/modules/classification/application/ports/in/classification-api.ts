import type { Classification } from '@sponcer/contracts';

export interface BackfillResult {
  classified: number;
  failed: number;
}

/** API pública del slice para profiles (tarjetas) y matching (embeddings). */
export interface ClassificationApi {
  getClassification(profileId: string): Promise<Classification | null>;
  getEmbedding(profileId: string): Promise<number[] | null>;
  /** Lote en una sola consulta; los perfiles sin embedding no aparecen en el mapa. */
  getEmbeddings(profileIds: string[]): Promise<Map<string, number[]>>;
  /** Backfill al arrancar: clasifica todos los perfiles, de uno en uno. */
  classifyAll(): Promise<BackfillResult>;
}
