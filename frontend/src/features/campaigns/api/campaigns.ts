import type { z } from 'zod';
import type {
  CampaignStatus,
  CreateCampaignRequest,
  CreateQuoteRequest,
  UpdateCampaignRequest,
} from '@sponcer/contracts';
import { callBff } from '../../../lib/api/bff';

export const listCampaigns = (profileId: string, status?: CampaignStatus, cursor?: string) =>
  callBff('listCampaigns', { query: { profileId, status, cursor } });

export const createCampaign = (body: z.input<typeof CreateCampaignRequest>) =>
  callBff('createCampaign', { body });

export const updateCampaign = (campaignId: string, body: z.input<typeof UpdateCampaignRequest>) =>
  callBff('updateCampaign', { params: { campaignId }, body });

export const createQuotes = (body: z.input<typeof CreateQuoteRequest>) =>
  callBff('createQuote', { body });

export const loadProfile = (handle: string) => callBff('getProfile', { params: { handle } });
