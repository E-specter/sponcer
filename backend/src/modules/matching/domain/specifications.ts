import type { City, Niche, ProfileCard, Tier } from '@sponcer/contracts';
import { spec, type Specification } from './specification';

type CardSpec = Specification<ProfileCard>;

/** Comparte al menos un nicho con la lista. */
export const hasAnyNiche = (niches: Niche[]): CardSpec =>
  spec((c) => niches.some((n) => c.niches.includes(n)));

export const inTiers = (tiers: Tier[]): CardSpec => spec((c) => tiers.includes(c.tier));

export const minEngagement = (min: number): CardSpec => spec((c) => c.engagementRate >= min);

/** Marca → creador: su servicio más barato no supera `max`. Sin servicios no cumple. */
export const maxPricePen = (max: number): CardSpec =>
  spec((c) => c.minServicePricePen !== null && c.minServicePricePen <= max);

/** Creador → marca: el presupuesto máximo de la marca alcanza al menos `min`. Sin presupuesto no cumple. */
export const minBudgetPen = (min: number): CardSpec =>
  spec((c) => c.budgetMaxPen !== null && c.budgetMaxPen >= min);

/** Excluye perfiles propios, ya descartados o con interés ya expresado. */
export const excludeIds = (ids: ReadonlySet<string>): CardSpec => spec((c) => !ids.has(c.id));

// Marcas diacríticas combinantes tras normalizar a NFD (la tilde suelta de "e" + U+0301); no coincide con "e".
// Probar: https://regex101.com/?regex=%5B%5Cu0300-%5Cu036f%5D&flags=g&testString=cafe&flavor=javascript
const DIACRITICS = /[̀-ͯ]/g;
// Guion de las etiquetas de nicho ("arte-diseno"): se busca como espacio. Coincide con "-"; no con letras.
const NICHE_DASH = /-/g;

const fold = (s: string): string => s.normalize('NFD').replace(DIACRITICS, '').toLowerCase();

/** Búsqueda libre en nombre, handle, bio y nichos de la tarjeta; sin distinguir mayúsculas ni tildes. */
export const matchesText = (q: string): CardSpec => {
  const needle = fold(q.trim());
  return spec((c) =>
    [c.fullName, c.handle, c.bio ?? '', ...c.niches.map((n) => n.replace(NICHE_DASH, ' '))].some(
      (field) => fold(field).includes(needle),
    ),
  );
};

export const inCity = (city: City): CardSpec => spec((c) => c.city === city);
