import type { City, Niche, ServiceInput } from '@sponcer/contracts';
import { apiAs } from './api';
import { sessionFor } from './session';
import type { E2EUser, World } from './world';

/** Un actor listo: usuario de Supabase con un perfil verificado (creado por la API, no por la UI). */
export interface Actor {
  user: E2EUser;
  token: string;
  handle: string;
  profileId: string;
  api: ReturnType<typeof apiAs>;
}

const CREATOR_PRICE_PEN = 250;
const BRAND_BUDGET_MIN_PEN = 500;
const BRAND_BUDGET_MAX_PEN = 5000;

export interface CreatorOptions {
  niches?: Niche[];
  city?: City;
  services?: ServiceInput[];
}

export interface BrandOptions {
  targetNiches?: Niche[];
  budgetMinPen?: number;
  budgetMaxPen?: number;
}

const DEFAULT_SERVICE: ServiceInput = {
  type: 'publicacion-patrocinada',
  format: 'reel',
  pricePen: CREATOR_PRICE_PEN,
  description: 'Reel patrocinado de prueba E2E',
};

async function actor(world: World, role: 'creator' | 'brand'): Promise<Actor> {
  const user = await world.newUser();
  const { accessToken } = await sessionFor(user);
  const api = apiAs(accessToken);
  const handle = world.newHandle();
  const profileId = await api.claim(handle, role);
  return { user, token: accessToken, handle, profileId, api };
}

export async function newCreator(world: World, opts: CreatorOptions = {}): Promise<Actor> {
  const a = await actor(world, 'creator');
  await a.api.declared(a.profileId, {
    role: 'creator',
    niches: opts.niches ?? ['arte-diseno'],
    city: opts.city ?? 'lima',
    shortBio: 'Creador de prueba E2E',
    accountType: 'creator',
  });
  await a.api.services(a.profileId, { services: opts.services ?? [DEFAULT_SERVICE] });
  return a;
}

export async function newBrand(world: World, opts: BrandOptions = {}): Promise<Actor> {
  const a = await actor(world, 'brand');
  await a.api.declared(a.profileId, {
    role: 'brand',
    sector: 'otro',
    objectives: ['ventas'],
    targetNiches: opts.targetNiches ?? ['arte-diseno'],
    budgetMinPen: opts.budgetMinPen ?? BRAND_BUDGET_MIN_PEN,
    budgetMaxPen: opts.budgetMaxPen ?? BRAND_BUDGET_MAX_PEN,
    accountType: 'business',
  });
  return a;
}

/** Match creador-marca por interés mutuo vía API (atajo de preparación para chat, cotizaciones y RLS). */
export async function newMatch(creator: Actor, brand: Actor): Promise<string> {
  await creator.api.interest(creator.profileId, brand.profileId);
  const result = await brand.api.interest(brand.profileId, creator.profileId);
  if (!result.matched || !result.matchId) throw new Error('El interés mutuo no creó el match');
  return result.matchId;
}
