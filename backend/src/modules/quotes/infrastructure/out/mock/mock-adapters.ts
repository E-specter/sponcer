import type { QuoteRecord } from '@sponcer/contracts';
import { fixtureSocial } from '@sponcer/contracts/fixtures';
import type { QuoteRepository } from '../../../application/ports/out/quote-repository';

/** Repositorio en memoria sembrado desde `contracts/fixtures`. */
export function createMockQuoteRepository(): QuoteRepository {
  const byId = new Map<string, QuoteRecord>(fixtureSocial.quotes.map((q) => [q.id, q]));
  return {
    findById: async (id) => byId.get(id) ?? null,
    listByProfile: async (profileId) =>
      [...byId.values()].filter(
        (q) => q.requesterProfileId === profileId || q.creatorProfileId === profileId,
      ),
    save: async (q) => void byId.set(q.id, q),
  };
}
