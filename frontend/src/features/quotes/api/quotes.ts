import type { CreateQuoteRequest, TransitionQuoteRequest } from '@sponcer/contracts';
import { callBff } from '../../../lib/api/bff';

export const createQuote = (body: CreateQuoteRequest) => callBff('createQuote', { body });

export const transitionQuote = (quoteId: string, body: TransitionQuoteRequest) =>
  callBff('transitionQuote', { params: { quoteId }, body });

export const listQuotes = (profileId: string, cursor?: string) =>
  callBff('listQuotes', { query: { profileId, cursor } });
