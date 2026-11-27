import { z } from 'zod';
import { City, Niche } from './catalogs';
import { Id, IsoDate, PageQuery, PricePen } from './common';
import {
  MAX_BRAND_TARGET_NICHES,
  MAX_CAMPAIGN_CITIES,
  MAX_CAMPAIGN_NAME,
  MAX_SHORT_TEXT,
  MIN_NAME,
} from './limits';

/** Tipos de campaña (ADR-009). Etiquetas en español en el frontend: temporada, general, segmento, otro. */
export const CAMPAIGN_KINDS = ['season', 'general', 'segment', 'other'] as const;
export const CampaignKind = z.enum(CAMPAIGN_KINDS);
export type CampaignKind = z.infer<typeof CampaignKind>;

/** `draft` no admite cotizaciones enviadas; `closed` no admite cotizaciones nuevas. */
export const CampaignStatus = z.enum(['draft', 'active', 'closed']);
export type CampaignStatus = z.infer<typeof CampaignStatus>;

const CalendarDate = z.iso.date();

const CampaignFields = z.object({
  name: z.string().trim().min(MIN_NAME).max(MAX_CAMPAIGN_NAME),
  kind: CampaignKind,
  description: z.string().trim().max(MAX_SHORT_TEXT).optional(),
  startsOn: CalendarDate,
  endsOn: CalendarDate.nullable().default(null),
  budgetPen: PricePen.nullable().default(null),
  targetNiches: z.array(Niche).max(MAX_BRAND_TARGET_NICHES).default([]),
  targetCities: z.array(City).max(MAX_CAMPAIGN_CITIES).default([]),
});

const endsAfterStart = (c: { startsOn?: string; endsOn?: string | null }) =>
  !c.startsOn || !c.endsOn || c.endsOn >= c.startsOn;
const ENDS_MESSAGE = {
  message: 'La fecha de fin no puede ser anterior al inicio.',
  path: ['endsOn'],
};

/** Solo un perfil `brand` propio crea campañas. Nace en `draft` salvo `activate: true`. */
export const CreateCampaignRequest = CampaignFields.extend({
  brandProfileId: Id,
  activate: z.boolean().default(false),
}).refine(endsAfterStart, ENDS_MESSAGE);
export type CreateCampaignRequest = z.infer<typeof CreateCampaignRequest>;

/** Cambios parciales; `status` sigue draft → active → closed (no vuelve atrás). */
export const UpdateCampaignRequest = CampaignFields.partial()
  .extend({ brandProfileId: Id, status: CampaignStatus.optional() })
  .refine(endsAfterStart, ENDS_MESSAGE);
export type UpdateCampaignRequest = z.infer<typeof UpdateCampaignRequest>;

/** Avance de la campaña: cotizaciones por estado y suma de montos aceptados o completados. */
export const CampaignStats = z.object({
  quotes: z.number().int().nonnegative(),
  byStatus: z.record(z.string(), z.number().int().nonnegative()),
  committedPen: z.number().int().nonnegative(),
});
export type CampaignStats = z.infer<typeof CampaignStats>;

export const Campaign = z.object({
  id: Id,
  brandProfileId: Id,
  name: z.string(),
  kind: CampaignKind,
  description: z.string().nullable(),
  startsOn: CalendarDate,
  endsOn: CalendarDate.nullable(),
  budgetPen: PricePen.nullable(),
  targetNiches: z.array(Niche),
  targetCities: z.array(City),
  status: CampaignStatus,
  stats: CampaignStats,
  createdAt: IsoDate,
  updatedAt: IsoDate,
});
export type Campaign = z.infer<typeof Campaign>;

/** Referencia corta para pintar la campaña dentro de una cotización. */
export const CampaignRef = Campaign.pick({ id: true, name: true, kind: true, status: true });
export type CampaignRef = z.infer<typeof CampaignRef>;

export const CampaignsQuery = PageQuery.extend({
  profileId: Id,
  status: CampaignStatus.optional(),
});
export type CampaignsQuery = z.infer<typeof CampaignsQuery>;

export const CampaignQuery = z.object({ profileId: Id });
