import type {
  CreateQuoteRequest,
  Quote,
  QuoteRecord,
  TransitionQuoteRequest,
} from '@sponcer/contracts';
import type { DomainError } from '../../../../../shared/errors';
import type { Result } from '../../../../../shared/result';

type R<T> = Promise<Result<T, DomainError>>;

export type CreateQuote = (userId: string, req: CreateQuoteRequest) => R<Quote>;
export type TransitionQuote = (
  userId: string,
  quoteId: string,
  req: TransitionQuoteRequest,
) => R<Quote>;
export type ListQuotes = (userId: string, profileId: string) => R<Quote[]>;

/** API pública del slice (la consume notifications para resolver contrapartes). */
export interface QuotesApi {
  getQuote(quoteId: string): Promise<QuoteRecord | null>;
}
