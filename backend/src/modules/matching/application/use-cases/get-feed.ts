import { DomainError } from '../../../../shared/errors';
import { err, ok } from '../../../../shared/result';
import type { ProfilesApi } from '../../../profiles';
import { allOf, type Specification } from '../../domain/specification';
import {
  excludeIds,
  hasAnyNiche,
  inCity,
  inTiers,
  matchesText,
  maxPricePen,
  minBudgetPen,
  minEngagement,
} from '../../domain/specifications';
import type { ScoringStrategy } from '../../domain/weighted-score';
import type { GetFeed } from '../ports/in/matching-use-cases';
import type { CandidateSearch } from '../ports/out/candidate-search';
import type { InteractionRepository } from '../ports/out/interaction-repository';
import type { ProfileCard, FeedQuery } from '@sponcer/contracts';
import { decodeCursor, encodeCursor } from '../cursor';

/** Candidatos que se piden de una vez; si los filtros dejan la página corta, se duplica hasta MAX. */
export const INITIAL_POOL = 200;
export const MAX_POOL = 1600;
const POOL_GROWTH = 2;

/** Filtros opcionales del query → Specifications combinadas. */
export function filtersFrom(q: FeedQuery): Array<Specification<ProfileCard>> {
  return [
    q.q ? matchesText(q.q) : null,
    q.city ? inCity(q.city) : null,
    q.niches?.length ? hasAnyNiche(q.niches) : null,
    q.tiers?.length ? inTiers(q.tiers) : null,
    q.minEngagement !== undefined ? minEngagement(q.minEngagement) : null,
    q.maxPricePen !== undefined ? maxPricePen(q.maxPricePen) : null,
    q.minBudgetPen !== undefined ? minBudgetPen(q.minBudgetPen) : null,
  ].filter((s): s is Specification<ProfileCard> => s !== null);
}

export const makeGetFeed =
  (d: {
    profiles: Pick<ProfilesApi, 'isOwner' | 'listByOwner'>;
    search: CandidateSearch;
    interactions: InteractionRepository;
    scoring: ScoringStrategy;
  }): GetFeed =>
  async (userId, query) => {
    if (!(await d.profiles.isOwner(query.profileId, userId))) {
      return err(new DomainError('FORBIDDEN', 'El perfil no te pertenece'));
    }
    const offset = decodeCursor(query.cursor);
    if (offset === null) return err(new DomainError('VALIDATION_ERROR', 'Cursor inválido'));
    const [own, past] = await Promise.all([
      d.profiles.listByOwner(userId),
      d.interactions.listByActor(query.profileId),
    ]);
    // Propios + ya descartados + ya con interés.
    const excluded = new Set([
      query.profileId,
      ...own.map((p) => p.id),
      ...past.map((i) => i.targetProfileId),
    ]);
    const accepted = allOf(excludeIds(excluded), ...filtersFrom(query));
    const wanted = offset + query.limit;

    // Los filtros se aplican tras la búsqueda: si dejan menos de lo pedido y aún hay candidatos, se amplía el pool.
    const search = async (limit: number): ReturnType<typeof d.search.find> => {
      const pool = await d.search.find(query.profileId, { limit, exclude: [...excluded] });
      if (!pool.ok) return pool;
      const enough =
        pool.value.candidates.filter((c) => accepted.isSatisfiedBy(c.card)).length > wanted;
      return pool.value.exhausted || enough || limit >= MAX_POOL
        ? pool
        : search(limit * POOL_GROWTH);
    };
    const pool = await search(INITIAL_POOL);
    if (!pool.ok) return pool;

    const ranked = pool.value.candidates
      .filter((c) => accepted.isSatisfiedBy(c.card))
      .map((c) => {
        const { score, reasons } = d.scoring.score(pool.value.viewer, c);
        return { card: c.card, score, reasons };
      })
      .sort((a, b) => b.score - a.score || a.card.id.localeCompare(b.card.id));

    const items = ranked.slice(offset, wanted);
    return ok({ items, nextCursor: wanted < ranked.length ? encodeCursor(wanted) : null });
  };
