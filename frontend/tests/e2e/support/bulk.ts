import { randomUUID } from 'node:crypto';
import type { Actor } from './actors';
import { admin, type World } from './world';

/** Más que una página de la API (PAGE_LIMIT_DEFAULT = 20): fuerza "Cargar más". */
export const OVER_ONE_PAGE = 21;
const HANDLE_SUFFIX_LENGTH = 6;
const STEP_MS = 1000;
const DATE_LENGTH = 10;

interface IdRow {
  id: string;
}

const must = <T>(res: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (res.error || res.data === null)
    throw new Error(`${what}: ${res.error?.message ?? 'sin datos'}`);
  return res.data;
};

/** `count` marcas sin dueño insertadas por BD (preparación; las acciones bajo prueba siguen por la UI). */
async function newBrands(world: World, count: number): Promise<IdRow[]> {
  const tag = randomUUID().replaceAll('-', '').slice(0, HANDLE_SUFFIX_LENGTH);
  const rows = Array.from({ length: count }, (_, i) => {
    const handle = `e2e.b${tag}${i}`;
    world.trackHandle(handle);
    return { ig_handle: handle, role: 'brand', status: 'unclaimed', owner_user_id: null };
  });
  return must(await admin.from('profiles').insert(rows).select('id'), 'insert brands');
}

/** Crea `count` matches del creador con marcas distintas, de forma que el último creado sea el más reciente. */
export async function seedMatches(world: World, creator: Actor, count: number): Promise<void> {
  const brands = await newBrands(world, count);
  const base = Date.now() - count * STEP_MS;
  const rows = brands.map((b, i) => ({
    creator_profile_id: creator.profileId,
    brand_profile_id: b.id,
    created_at: new Date(base + i * STEP_MS).toISOString(),
  }));
  must(await admin.from('matches').insert(rows).select('id'), 'insert matches');
}

/** `count` cotizaciones enviadas por marcas distintas al primer servicio del creador. */
export async function seedQuotes(world: World, creator: Actor, count: number): Promise<void> {
  const brands = await newBrands(world, count);
  const service = must(
    await admin.from('creator_services').select('id').eq('profile_id', creator.profileId).limit(1),
    'service',
  )[0] as IdRow | undefined;
  if (!service) throw new Error('El creador no tiene servicios');
  const base = Date.now() - count * STEP_MS;
  // ADR-009: toda cotización cuelga de una campaña (una por marca).
  const campaigns = must(
    await admin
      .from('campaigns')
      .insert(
        brands.map((b) => ({
          brand_profile_id: b.id,
          name: 'Campaña de prueba',
          kind: 'general',
          starts_on: new Date().toISOString().slice(0, DATE_LENGTH),
          status: 'active',
        })),
      )
      .select('id, brand_profile_id'),
    'insert campaigns',
  ) as { id: string; brand_profile_id: string }[];
  const campaignOf = new Map(campaigns.map((c) => [c.brand_profile_id, c.id]));
  const rows = brands.map((b, i) => ({
    campaign_id: campaignOf.get(b.id),
    service_id: service.id,
    creator_profile_id: creator.profileId,
    requester_profile_id: b.id,
    status: 'sent',
    message: `Cotización de prueba ${i}`,
    created_at: new Date(base + i * STEP_MS).toISOString(),
    updated_at: new Date(base + i * STEP_MS).toISOString(),
  }));
  must(await admin.from('quotes').insert(rows).select('id'), 'insert quotes');
}
