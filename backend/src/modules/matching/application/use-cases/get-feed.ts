import { DomainError } from '../../../../shared/errors';
import { err, ok } from '../../../../shared/result';
import type { ProfilesApi } from '../../../profiles';
import { allOf, type Specification } from '../../domain/specification';
import {
  excludeIds,
  hasAnyNiche,
  inTiers,
  maxPricePen,
  minBudgetPen,
  minEngagement,
} from '../../domain/specifications';
import type { ScoringStrategy } from '../../domain/weighted-score';
import type { GetFeed } from '../ports/in/matching-use-cases';
import type { CandidateSearch } from '../ports/out/candidate-search';
import type { InteractionRepository } from '../ports/out/interaction-repository';
import type { ProfileCard, FeedQuery } from '@sponcer/contracts';

const CURSOR_BASE = 'base64url';

// shortcut: cursor = offset codificado; con pgvector (F2) pasa a keyset (score, id).
const encodeCursor = (offset: number): string => Buffer.from(String(offset)).toString(CURSOR_BASE);
const decodeCursor = (cursor: string | undefined): number | null => {
  if (cursor === undefined) return 0;
  const n = Number(Buffer.from(cursor, CURSOR_BASE).toString());
  return Number.isInteger(n) && n >= 0 ? n : null;
};

/** Filtros opcionales del query → Specifications combinadas. */
export function filtersFrom(q: FeedQuery): Array<Specification<ProfileCard>> {
  return [
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
    const pool = await d.search.find(query.profileId);
    if (!pool.ok) return pool;

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

    const ranked = pool.value.candidates
      .filter((c) => accepted.isSatisfiedBy(c.card))
      .map((c) => {
        const { score, reasons } = d.scoring.score(pool.value.viewer, c);
        return { card: c.card, score, reasons };
      })
      .sort((a, b) => b.score - a.score || a.card.id.localeCompare(b.card.id));

    const items = ranked.slice(offset, offset + query.limit);
    const next = offset + query.limit;
    return ok({ items, nextCursor: next < ranked.length ? encodeCursor(next) : null });
  };
