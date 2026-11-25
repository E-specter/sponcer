import type { SupabaseClient } from '@supabase/supabase-js';
import { DomainError } from '../../../../../shared/errors';
import { logger } from '../../../../../shared/logger';
import { err, ok } from '../../../../../shared/result';
import type { ClassificationApi } from '../../../../classification';
import type { ProfilesApi } from '../../../../profiles';
import type { CandidateSearch } from '../../../application/ports/out/candidate-search';
import type { Candidate } from '../../../domain/candidate';
import type { InteractionRepository } from '../../../application/ports/out/interaction-repository';
import type { MatchRepository } from '../../../application/ports/out/match-repository';
import {
  interactionToRow,
  matchToRow,
  rowToInteraction,
  rowToMatch,
  type CandidateRow,
  type InteractionRow,
  type MatchRow,
} from './matching-mappers';

/** Candidatos que trae pgvector; los filtros Specification y la paginación se aplican después en get-feed. */
export const CANDIDATE_POOL_LIMIT = 200;

const fail = (op: string, message: string): never => {
  throw new Error(`matching/supabase ${op}: ${message}`);
};

export function createSupabaseInteractionRepository(db: SupabaseClient): InteractionRepository {
  return {
    // Una interacción por par (unique actor+target): la nueva reemplaza a la anterior.
    async upsert(i) {
      const { error } = await db
        .from('interactions')
        .upsert(interactionToRow(i), { onConflict: 'actor_profile_id,target_profile_id' });
      if (error) fail('upsert', error.message);
    },
    async find(actor, target) {
      const { data, error } = await db
        .from('interactions')
        .select()
        .eq('actor_profile_id', actor)
        .eq('target_profile_id', target)
        .maybeSingle();
      if (error) return fail('find', error.message);
      return data ? rowToInteraction(data as InteractionRow) : null;
    },
    async listByActor(actor) {
      const { data, error } = await db.from('interactions').select().eq('actor_profile_id', actor);
      if (error) return fail('listByActor', error.message);
      return (data as InteractionRow[]).map(rowToInteraction);
    },
  };
}

export function createSupabaseMatchRepository(db: SupabaseClient): MatchRepository {
  const byPair = { onConflict: 'creator_profile_id,brand_profile_id', ignoreDuplicates: true };
  return {
    // ON CONFLICT DO NOTHING: si el par ya existe no devuelve fila y se lee el existente.
    async createIfAbsent(match) {
      const ins = await db.from('matches').upsert(matchToRow(match), byPair).select();
      if (ins.error) return fail('createIfAbsent/insert', ins.error.message);
      if (ins.data.length) return { match: rowToMatch(ins.data[0] as MatchRow), created: true };
      const { data, error } = await db
        .from('matches')
        .select()
        .eq('creator_profile_id', match.creatorProfileId)
        .eq('brand_profile_id', match.brandProfileId)
        .single();
      if (error) return fail('createIfAbsent/select', error.message);
      return { match: rowToMatch(data as MatchRow), created: false };
    },
    async getById(id) {
      const { data, error } = await db.from('matches').select().eq('id', id).maybeSingle();
      if (error) return fail('getById', error.message);
      return data ? rowToMatch(data as MatchRow) : null;
    },
    async listByProfile(profileId) {
      // Dos `.eq` en vez de `.or(...)`: el id nunca se interpola en el filtro.
      const [asCreator, asBrand] = await Promise.all([
        db.from('matches').select().eq('creator_profile_id', profileId),
        db.from('matches').select().eq('brand_profile_id', profileId),
      ]);
      const failed = asCreator.error ?? asBrand.error;
      if (failed) return fail('listByProfile', failed.message);
      const byId = new Map(
        [...(asCreator.data as MatchRow[]), ...(asBrand.data as MatchRow[])].map((r) => [r.id, r]),
      );
      return [...byId.values()].map(rowToMatch);
    },
  };
}

/**
 * Top-K por coseno vía RPC `match_candidates`. Los perfiles sin embedding (recién verificados) no salen de la RPC:
 * cuando ya no quedan candidatos vectoriales se añaden con similitud 0 y se dispara su clasificación (igual que el mock).
 */
export function createSupabaseCandidateSearch(deps: {
  db: SupabaseClient;
  profiles: Pick<ProfilesApi, 'getCards' | 'listCandidates'>;
  classification: Pick<ClassificationApi, 'getEmbedding'> &
    Partial<Pick<ClassificationApi, 'ensureClassified'>>;
}): CandidateSearch {
  return {
    async find(viewerProfileId, options) {
      const [card] = await deps.profiles.getCards([viewerProfileId]);
      if (!card) return err(new DomainError('NOT_FOUND', 'Perfil no encontrado'));
      const viewer = { card, embedding: await deps.classification.getEmbedding(card.id) };
      if (!viewer.embedding) void deps.classification.ensureClassified?.(viewerProfileId);
      const role = card.role === 'creator' ? 'brand' : 'creator';
      const limit = options?.limit ?? CANDIDATE_POOL_LIMIT;
      const exclude = [...new Set([viewerProfileId, ...(options?.exclude ?? [])])];

      const rows = await (async (): Promise<CandidateRow[] | null> => {
        if (!viewer.embedding) return [];
        const { data, error } = await deps.db.rpc('match_candidates', {
          p_embedding: `[${viewer.embedding.join(',')}]`,
          p_role: role,
          p_exclude: exclude,
          p_limit: limit,
        });
        if (error) {
          logger.warn('falló match_candidates', error.message);
          return null;
        }
        return data as CandidateRow[];
      })();
      if (!rows) return err(new DomainError('INTERNAL_ERROR', 'Falló la búsqueda de candidatos'));

      const exhausted = rows.length < limit;
      const similarity = new Map(rows.map((r) => [r.profile_id, r.similarity]));
      const vectorCards = rows.length
        ? await deps.profiles.getCards(rows.map((r) => r.profile_id))
        : [];
      const candidates: Candidate[] = vectorCards.map((c) => ({
        card: c,
        embedding: null,
        similarity: similarity.get(c.id),
      }));
      if (!exhausted) return ok({ viewer, candidates, exhausted });

      const skip = new Set([...exclude, ...similarity.keys()]);
      const unembedded = (await deps.profiles.listCandidates(role)).filter((c) => !skip.has(c.id));
      unembedded.forEach((c) => void deps.classification.ensureClassified?.(c.id));
      return ok({
        viewer,
        candidates: [
          ...candidates,
          ...unembedded.map((c) => ({ card: c, embedding: null, similarity: 0 })),
        ],
        exhausted,
      });
    },
  };
}
