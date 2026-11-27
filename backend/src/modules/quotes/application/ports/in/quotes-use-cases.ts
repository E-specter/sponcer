import type {
  Campaign,
  CreateCampaignRequest,
  CreateQuoteRequest,
  CreateQuotesResult,
  Quote,
  QuoteRecord,
  TransitionQuoteRequest,
  UpdateCampaignRequest,
} from '@sponcer/contracts';
import type { DomainError } from '../../../../../shared/errors';
import type { Result } from '../../../../../shared/result';

type R<T> = Promise<Result<T, DomainError>>;
type Page = { cursor?: string | undefined; limit: number };

export type CreateQuote = (userId: string, req: CreateQuoteRequest) => R<CreateQuotesResult>;
export type TransitionQuote = (
  userId: string,
  quoteId: string,
  req: TransitionQuoteRequest,
) => R<Quote>;
export type ListQuotes = (
  userId: string,
  profileId: string,
  page: Page & { campaignId?: string | undefined },
) => R<{ items: Quote[]; nextCursor: string | null }>;

export type ListCampaigns = (
  userId: string,
  profileId: string,
  page: Page & { status?: Campaign['status'] | undefined },
) => R<{ items: Campaign[]; nextCursor: string | null }>;
export type GetCampaign = (userId: string, profileId: string, campaignId: string) => R<Campaign>;
export type CreateCampaign = (userId: string, req: CreateCampaignRequest) => R<Campaign>;
export type UpdateCampaign = (
  userId: string,
  campaignId: string,
  req: UpdateCampaignRequest,
) => R<Campaign>;

/** API pública del slice (la consume notifications para resolver contrapartes). */
export interface QuotesApi {
  getQuote(quoteId: string): Promise<QuoteRecord | null>;
}
