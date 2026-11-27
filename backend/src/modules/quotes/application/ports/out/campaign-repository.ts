import type { CampaignStatus } from '@sponcer/contracts';
import type { CampaignRecord } from '../../../domain/campaign';

export interface CampaignRepository {
  findById(id: string): Promise<CampaignRecord | null>;
  /** Campañas de una marca, la más reciente primero. */
  listByBrand(brandProfileId: string, status?: CampaignStatus): Promise<CampaignRecord[]>;
  /** Crea o reemplaza por id. */
  save(campaign: CampaignRecord): Promise<void>;
}
