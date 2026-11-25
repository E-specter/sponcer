import type {
  FeedItem,
  FeedQuery,
  InteractionRequest,
  InteractionResult,
  Match,
} from '@sponcer/contracts';
import type { DomainError } from '../../../../../shared/errors';
import type { Result } from '../../../../../shared/result';

export type GetFeed = (
  userId: string,
  query: FeedQuery,
) => Promise<Result<{ items: FeedItem[]; nextCursor: string | null }, DomainError>>;

/** `ExpressInterest` y `Dismiss` comparten caso de uso: se distinguen por `kind`. */
export type Interact = (
  userId: string,
  request: InteractionRequest,
) => Promise<Result<InteractionResult, DomainError>>;

/** Más reciente primero, paginado por cursor. */
export type ListMatches = (
  userId: string,
  query: Pick<FeedQuery, 'profileId' | 'cursor' | 'limit'>,
) => Promise<Result<{ items: Match[]; nextCursor: string | null }, DomainError>>;
