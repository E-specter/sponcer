import type { Campaign, CampaignStats, CampaignStatus, QuoteRecord } from '@sponcer/contracts';

/** Campaña persistida (sin el avance, que se calcula con sus cotizaciones). */
export type CampaignRecord = Omit<Campaign, 'stats'>;

const ORDER: Record<CampaignStatus, number> = { draft: 0, active: 1, closed: 2 };

/** El estado solo avanza (borrador → activa → cerrada); quedarse igual es válido. */
export const canAdvance = (from: CampaignStatus, to: CampaignStatus): boolean =>
  ORDER[to] >= ORDER[from];

/** Una cotización está abierta mientras no sea terminal (rechazada, completada o cancelada). */
export const isOpenQuote = (q: Pick<QuoteRecord, 'status'>): boolean =>
  !['rejected', 'completed', 'cancelled'].includes(q.status);

/** Cotizaciones por estado y monto comprometido (aceptadas o completadas). */
export function campaignStats(quotes: QuoteRecord[]): CampaignStats {
  const byStatus: Record<string, number> = {};
  for (const q of quotes) byStatus[q.status] = (byStatus[q.status] ?? 0) + 1;
  const committedPen = quotes
    .filter((q) => q.status === 'accepted' || q.status === 'completed')
    .reduce((sum, q) => sum + (q.amountPen ?? 0), 0);
  return { quotes: quotes.length, byStatus, committedPen };
}
