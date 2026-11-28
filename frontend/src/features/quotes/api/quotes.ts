import type { TransitionQuoteRequest } from '@sponcer/contracts';
import { callBff } from '../../../lib/api/bff';

export const transitionQuote = (quoteId: string, body: TransitionQuoteRequest) =>
  callBff('transitionQuote', { params: { quoteId }, body });

export const listQuotes = (profileId: string, cursor?: string, campaignId?: string) =>
  callBff('listQuotes', { query: { profileId, cursor, campaignId: campaignId || undefined } });
