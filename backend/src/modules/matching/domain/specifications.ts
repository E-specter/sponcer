import type { Niche, ProfileCard, Tier } from '@sponcer/contracts';
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
