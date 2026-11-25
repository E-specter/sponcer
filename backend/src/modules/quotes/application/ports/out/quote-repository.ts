import type { QuoteRecord } from '@sponcer/contracts';

export interface QuoteRepository {
  findById(id: string): Promise<QuoteRecord | null>;
  /** Cotizaciones donde el perfil es solicitante o creador. */
  listByProfile(profileId: string): Promise<QuoteRecord[]>;
  /** Crea o reemplaza por id. */
  save(quote: QuoteRecord): Promise<void>;
}
