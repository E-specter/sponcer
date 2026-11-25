import { z } from 'zod';
import { FOLLOWERS_MACRO, FOLLOWERS_MEGA, FOLLOWERS_MICRO, FOLLOWERS_MID } from './limits';

// Catálogos v1 (docs/04-modulos/clasificacion.md). Cambiar un valor es un cambio de contrato.

export const NICHES = [
  'moda',
  'belleza',
  'fitness',
  'deportes',
  'gastronomia',
  'viajes',
  'tecnologia',
  'gaming',
  'musica',
  'entretenimiento',
  'educacion',
  'finanzas',
  'salud-bienestar',
  'familia-maternidad',
  'mascotas',
  'arte-diseno',
  'emprendimiento',
  'hogar-deco',
  'automotriz',
  'lifestyle',
] as const;
export const Niche = z.enum(NICHES);
export type Niche = z.infer<typeof Niche>;

export const BRAND_SECTORS = [
  'moda-retail',
  'belleza-cuidado-personal',
  'alimentos-bebidas',
  'restaurantes',
  'tecnologia',
  'salud',
  'educacion',
  'finanzas-seguros',
  'turismo-hoteleria',
  'entretenimiento-medios',
  'deporte',
  'hogar',
  'automotriz',
  'servicios',
  'otro',
] as const;
export const BrandSector = z.enum(BRAND_SECTORS);
export type BrandSector = z.infer<typeof BrandSector>;

export const TIERS = ['nano', 'micro', 'mid', 'macro', 'mega'] as const;
export const Tier = z.enum(TIERS);
export type Tier = z.infer<typeof Tier>;

/** Límite inferior de seguidores (inclusive) de cada tier. */
export const TIER_MIN_FOLLOWERS: Record<Tier, number> = {
  nano: 0,
  micro: FOLLOWERS_MICRO,
  mid: FOLLOWERS_MID,
  macro: FOLLOWERS_MACRO,
  mega: FOLLOWERS_MEGA,
};

export function tierFor(followers: number): Tier {
  if (followers >= TIER_MIN_FOLLOWERS.mega) return 'mega';
  if (followers >= TIER_MIN_FOLLOWERS.macro) return 'macro';
  if (followers >= TIER_MIN_FOLLOWERS.mid) return 'mid';
  if (followers >= TIER_MIN_FOLLOWERS.micro) return 'micro';
  return 'nano';
}

export const ProfileRole = z.enum(['creator', 'brand']);
export type ProfileRole = z.infer<typeof ProfileRole>;

export const ProfileStatus = z.enum(['unclaimed', 'verified', 'removed']);
export type ProfileStatus = z.infer<typeof ProfileStatus>;

export const AccountType = z.enum(['business', 'creator', 'unknown']);
export type AccountType = z.infer<typeof AccountType>;

export const SERVICE_TYPES = [
  'publicacion-patrocinada',
  'canje',
  'embajador',
  'evento',
  'contenido-ugc',
] as const;
export const ServiceType = z.enum(SERVICE_TYPES);
export type ServiceType = z.infer<typeof ServiceType>;

export const SERVICE_FORMATS = ['post', 'reel', 'story', 'live', 'combo'] as const;
export const ServiceFormat = z.enum(SERVICE_FORMATS);
export type ServiceFormat = z.infer<typeof ServiceFormat>;

export const CAMPAIGN_OBJECTIVES = [
  'reconocimiento',
  'interaccion',
  'ventas',
  'lanzamiento',
  'trafico-web',
  'comunidad',
] as const;
export const CampaignObjective = z.enum(CAMPAIGN_OBJECTIVES);
export type CampaignObjective = z.infer<typeof CampaignObjective>;

export const NicheSource = z.enum(['declared', 'rules', 'embedding']);
export type NicheSource = z.infer<typeof NicheSource>;
