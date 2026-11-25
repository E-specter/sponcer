import type { DomainError } from '../../../../../shared/errors';
import type { Result } from '../../../../../shared/result';
import type { Candidate } from '../../../domain/candidate';

export interface CandidatePool {
  viewer: Candidate;
  /** Perfiles de rol opuesto al del viewer, sin los excluidos. Los que no tienen embedding entran con similitud 0. */
  candidates: Candidate[];
  /** `true` si no hay más candidatos que traer con un `limit` mayor. */
  exhausted: boolean;
}

export interface CandidateSearchOptions {
  /** Máximo de candidatos con embedding a traer (top-K por coseno en el real). */
  limit?: number;
  /** Ids que no deben volver (propios, ya descartados). */
  exclude?: string[];
}

/** Mock: candidatos y embeddings de profiles/classification. Real: pgvector (`match_candidates`). */
export interface CandidateSearch {
  find(
    viewerProfileId: string,
    options?: CandidateSearchOptions,
  ): Promise<Result<CandidatePool, DomainError>>;
}
