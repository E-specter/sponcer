import type { QuoteRecord } from '@sponcer/contracts';
import { fixtureSocial } from '@sponcer/contracts/fixtures';
import { DomainError } from '../../../../../shared/errors';
import type { CampaignRepository } from '../../../application/ports/out/campaign-repository';
import type { QuoteRepository } from '../../../application/ports/out/quote-repository';
import { isOpenQuote, type CampaignRecord } from '../../../domain/campaign';

/** Repositorio en memoria sembrado desde `contracts/fixtures`. */
export function createMockQuoteRepository(): QuoteRepository {
  const byId = new Map<string, QuoteRecord>(fixtureSocial.quotes.map((q) => [q.id, q]));
  return {
    findById: async (id) => byId.get(id) ?? null,
    listByProfile: async (profileId) =>
      [...byId.values()].filter(
        (q) => q.requesterProfileId === profileId || q.creatorProfileId === profileId,
      ),
    listByCampaign: async (campaignId) =>
      [...byId.values()].filter((q) => q.campaignId === campaignId),
    // Como el índice único parcial de la BD: una sola cotización abierta por creador y campaña.
    save: async (q) => {
      const clash = [...byId.values()].some(
        (x) =>
          x.id !== q.id &&
          x.campaignId === q.campaignId &&
          x.creatorProfileId === q.creatorProfileId &&
          isOpenQuote(x) &&
          isOpenQuote(q),
      );
      if (clash) throw new DomainError('CONFLICT', 'Ya existe un registro con esos datos');
      byId.set(q.id, q);
    },
  };
}

export function createMockCampaignRepository(): CampaignRepository {
  const byId = new Map<string, CampaignRecord>(fixtureSocial.campaigns.map((c) => [c.id, c]));
  return {
    findById: async (id) => byId.get(id) ?? null,
    listByBrand: async (brandProfileId, status) =>
      [...byId.values()]
        .filter((c) => c.brandProfileId === brandProfileId && (!status || c.status === status))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)),
    save: async (c) => void byId.set(c.id, c),
    update: async (c, expected) => {
      if (byId.get(c.id)?.status !== expected) return false;
      byId.set(c.id, c);
      return true;
    },
  };
}
