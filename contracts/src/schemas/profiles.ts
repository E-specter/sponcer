import { z } from 'zod';
import {
  MAX_BRAND_OBJECTIVES,
  MAX_BRAND_TARGET_NICHES,
  MAX_CITY_LENGTH,
  MAX_CLASSIFIED_NICHES,
  MAX_CREATOR_NICHES,
  MAX_REASON_LENGTH,
  MAX_SERVICES,
  MAX_SHORT_TEXT,
} from './limits';
import {
  AccountType,
  BrandSector,
  CampaignObjective,
  Niche,
  NicheSource,
  ProfileRole,
  ProfileStatus,
  ServiceFormat,
  ServiceType,
  Tier,
} from './catalogs';
import { Id, IgHandle, IsoDate, PricePen } from './common';

const ShortText = z.string().trim().max(MAX_SHORT_TEXT);

// ---- Datos declarados (RF-05, RF-07, RF-08) ----

export const CreatorDeclared = z.object({
  role: z.literal('creator'),
  niches: z.array(Niche).min(1).max(MAX_CREATOR_NICHES),
  city: z.string().trim().max(MAX_CITY_LENGTH).optional(),
  shortBio: ShortText.optional(),
  accountType: AccountType.default('unknown'),
});
export type CreatorDeclared = z.infer<typeof CreatorDeclared>;

export const BrandDeclared = z
  .object({
    role: z.literal('brand'),
    sector: BrandSector,
    objectives: z.array(CampaignObjective).min(1).max(MAX_BRAND_OBJECTIVES),
    targetNiches: z.array(Niche).min(1).max(MAX_BRAND_TARGET_NICHES),
    budgetMinPen: PricePen,
    budgetMaxPen: PricePen,
    shortBio: ShortText.optional(),
    accountType: AccountType.default('unknown'),
  })
  .refine((b) => b.budgetMinPen <= b.budgetMaxPen, {
    message: 'El presupuesto mínimo no puede superar al máximo',
    path: ['budgetMaxPen'],
  });
export type BrandDeclared = z.infer<typeof BrandDeclared>;

export const Declared = z.discriminatedUnion('role', [CreatorDeclared, BrandDeclared]);
export type Declared = z.infer<typeof Declared>;

export const ServiceInput = z.object({
  type: ServiceType,
  format: ServiceFormat,
  pricePen: PricePen,
  description: ShortText,
});
export type ServiceInput = z.infer<typeof ServiceInput>;

export const Service = ServiceInput.extend({ id: Id });
export type Service = z.infer<typeof Service>;

export const PutServicesRequest = z.object({ services: z.array(ServiceInput).max(MAX_SERVICES) });

// ---- Clasificación (RF-09) ----

export const NicheScore = z.object({
  niche: Niche,
  confidence: z.number().min(0).max(1),
  source: NicheSource,
});
export type NicheScore = z.infer<typeof NicheScore>;

export const Classification = z.object({
  niches: z.array(NicheScore).max(MAX_CLASSIFIED_NICHES),
  tier: Tier,
  followers: z.number().int().nonnegative(),
  engagementRate: z.number().min(0),
  classifiedAt: IsoDate,
});
export type Classification = z.infer<typeof Classification>;

// ---- Vistas (RF-06, RF-10) ----

export const ProfileSummary = z.object({
  id: Id,
  handle: IgHandle,
  role: ProfileRole,
  fullName: z.string(),
  profilePicUrl: z.url().nullable(),
  status: ProfileStatus,
});
export type ProfileSummary = z.infer<typeof ProfileSummary>;

export const ProfileCard = ProfileSummary.extend({
  niches: z.array(Niche),
  tier: Tier,
  followers: z.number().int().nonnegative(),
  engagementRate: z.number().min(0),
  sector: BrandSector.nullable(),
  minServicePricePen: PricePen.nullable(),
  budgetMaxPen: PricePen.nullable(),
});
export type ProfileCard = z.infer<typeof ProfileCard>;

export const IngestedStats = z.object({
  biography: z.string(),
  followers: z.number().int().nonnegative(),
  following: z.number().int().nonnegative(),
  postsCount: z.number().int().nonnegative(),
  isVerified: z.boolean(),
  externalUrl: z.url().nullable(),
  fetchedAt: IsoDate,
});

export const ProfileDetail = ProfileSummary.extend({
  ingested: IngestedStats,
  declared: Declared.nullable(),
  classification: Classification.nullable(),
  services: z.array(Service),
  isOwner: z.boolean(),
});
export type ProfileDetail = z.infer<typeof ProfileDetail>;

export const RemovalRequest = z.object({
  email: z.email(),
  reason: z.string().trim().max(MAX_REASON_LENGTH).optional(),
});
