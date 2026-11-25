import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClassificationRepository } from '../../../application/ports/out/classification-repository';
import { EMBEDDING_DIMENSION } from '../../../application/ports/out/embedding-provider';
import {
  classificationToRow,
  embeddingToRow,
  fromVectorLiteral,
  rowToClassification,
  type ClassificationRow,
} from './classification-mappers';

const fail = (op: string, message: string): never => {
  throw new Error(`classification/supabase ${op}: ${message}`);
};
const BY_PROFILE = { onConflict: 'profile_id' };

export function createSupabaseClassificationRepository(
  db: SupabaseClient,
): ClassificationRepository {
  return {
    async save(profileId, classification, embedding) {
      // Se valida antes de escribir y el embedding va primero: un fallo no deja al perfil
      // "clasificado" sin vector (no entraría al feed). Sin transacción: ver nota en el reporte.
      if (embedding.length !== EMBEDDING_DIMENSION) {
        fail(
          'save',
          `embedding de ${embedding.length} dimensiones (se esperan ${EMBEDDING_DIMENSION})`,
        );
      }
      const e = await db
        .from('profile_embeddings')
        .upsert(embeddingToRow(profileId, embedding), BY_PROFILE);
      if (e.error) fail('save embedding', e.error.message);
      const c = await db
        .from('profile_classifications')
        .upsert(classificationToRow(profileId, classification), BY_PROFILE);
      if (c.error) fail('save classification', c.error.message);
    },
    async deleteByProfile(profileId) {
      const results = await Promise.all([
        db.from('profile_classifications').delete().eq('profile_id', profileId),
        db.from('profile_embeddings').delete().eq('profile_id', profileId),
      ]);
      results.forEach((r) => r.error && fail('deleteByProfile', r.error.message));
    },
    async getClassification(profileId) {
      const { data, error } = await db
        .from('profile_classifications')
        .select('niches, tier, followers, engagement_rate, classified_at')
        .eq('profile_id', profileId)
        .maybeSingle();
      if (error) return fail('getClassification', error.message);
      return data ? rowToClassification(data as ClassificationRow) : null;
    },
    async getEmbedding(profileId) {
      const { data, error } = await db
        .from('profile_embeddings')
        .select('embedding')
        .eq('profile_id', profileId)
        .maybeSingle();
      if (error) return fail('getEmbedding', error.message);
      return data ? fromVectorLiteral((data as { embedding: string }).embedding) : null;
    },
    async getEmbeddings(profileIds) {
      if (!profileIds.length) return new Map();
      const { data, error } = await db
        .from('profile_embeddings')
        .select('profile_id, embedding')
        .in('profile_id', profileIds);
      if (error) return fail('getEmbeddings', error.message);
      return new Map(
        (data as { profile_id: string; embedding: string }[]).map((r) => [
          r.profile_id,
          fromVectorLiteral(r.embedding),
        ]),
      );
    },
  };
}
