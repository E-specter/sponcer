import type { DomainError } from '../../../../../shared/errors';
import type { Result } from '../../../../../shared/result';
import type { Candidate } from '../../../domain/candidate';

export interface CandidatePool {
  viewer: Candidate;
  /** Perfiles de rol opuesto al del viewer. */
  candidates: Candidate[];
}

/** Mock: candidatos y embeddings de profiles/classification. F2: pgvector (filtros a WHERE + top-K por coseno). */
export interface CandidateSearch {
  find(viewerProfileId: string): Promise<Result<CandidatePool, DomainError>>;
}
