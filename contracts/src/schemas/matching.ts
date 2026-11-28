import { z } from 'zod';
import { MAX_MATCH_REASONS, MAX_SEARCH_QUERY } from './limits';
import { City, Niche, Tier } from './catalogs';
import { Id, IsoDate, PageQuery } from './common';
import { ProfileCard } from './profiles';

const csv = <T extends z.ZodType>(item: T) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? v.split(',').filter(Boolean) : v),
    z.array(item).optional(),
  );

export const FeedQuery = PageQuery.extend({
  profileId: Id,
  /** Búsqueda libre en nombre, handle, bio y nichos (sin distinguir mayúsculas ni tildes). */
  q: z.string().trim().min(1).max(MAX_SEARCH_QUERY).optional(),
  city: City.optional(),
  niches: csv(Niche),
  tiers: csv(Tier),
  minEngagement: z.coerce.number().min(0).optional(),
  /** Marca: precio máximo del servicio más barato del creador. */
  maxPricePen: z.coerce.number().int().nonnegative().optional(),
  /** Creador: presupuesto máximo mínimo aceptable de la marca. */
  minBudgetPen: z.coerce.number().int().nonnegative().optional(),
  /** `true` = incluye perfiles con interés o descarte previo (selector de destinatarios de una campaña). */
  includeInteracted: z.stringbool().optional(),
});
export type FeedQuery = z.infer<typeof FeedQuery>;

export const ScoreComponent = z.enum(['similarity', 'niches', 'budget', 'engagement']);
export type ScoreComponent = z.infer<typeof ScoreComponent>;

export const FeedItem = z.object({
  card: ProfileCard,
  score: z.number().min(0).max(1),
  /** Los 2 componentes que más aportan, para "por qué te lo recomendamos". */
  reasons: z.array(ScoreComponent).max(MAX_MATCH_REASONS),
});
export type FeedItem = z.infer<typeof FeedItem>;

export const InteractionRequest = z.object({
  actorProfileId: Id,
  targetProfileId: Id,
  kind: z.enum(['interest', 'dismiss']),
});
export type InteractionRequest = z.infer<typeof InteractionRequest>;

export const InteractionResult = z.object({
  matched: z.boolean(),
  matchId: Id.nullable(),
});
export type InteractionResult = z.infer<typeof InteractionResult>;

export const Match = z.object({
  id: Id,
  creator: ProfileCard,
  brand: ProfileCard,
  createdAt: IsoDate,
});
export type Match = z.infer<typeof Match>;

export const MatchesQuery = PageQuery.extend({ profileId: Id });
