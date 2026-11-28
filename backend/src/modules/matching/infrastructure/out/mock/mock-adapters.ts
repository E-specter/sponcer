import { fixtureSocial } from '@sponcer/contracts/fixtures';
import { DomainError } from '../../../../../shared/errors';
import { err, ok } from '../../../../../shared/result';
import type { ClassificationApi } from '../../../../classification';
import type { ProfilesApi } from '../../../../profiles';
import type { CandidateSearch } from '../../../application/ports/out/candidate-search';
import type { InteractionRepository } from '../../../application/ports/out/interaction-repository';
import type { MatchRepository } from '../../../application/ports/out/match-repository';
import type { ProfileViewRepository } from '../../../application/ports/out/profile-view-repository';
import type { Interaction, MatchRecord } from '../../../domain/candidate';
import type { ViewRow } from '../../../domain/visibility';

const interactionKey = (actor: string, target: string) => `${actor}>${target}`;
const pairKey = (m: Pick<MatchRecord, 'creatorProfileId' | 'brandProfileId'>) =>
  `${m.creatorProfileId}+${m.brandProfileId}`;

/** Sembrado con `fixtureSocial.interactions`. */
export function createInMemoryInteractionRepository(): InteractionRepository {
  const store = new Map<string, Interaction>(
    fixtureSocial.interactions.map((i) => [interactionKey(i.actorProfileId, i.targetProfileId), i]),
  );
  return {
    async upsert(i) {
      const key = interactionKey(i.actorProfileId, i.targetProfileId);
      // Como la BD: el mismo par se reemplaza (upsert); el mismo id en otro par viola la PK.
      if ([...store.entries()].some(([k, x]) => x.id === i.id && k !== key)) {
        throw new Error(`interactions_pkey: id duplicado ${i.id}`);
      }
      store.set(interactionKey(i.actorProfileId, i.targetProfileId), i);
    },
    find: async (actor, target) => store.get(interactionKey(actor, target)) ?? null,
    listByActor: async (actor) => [...store.values()].filter((i) => i.actorProfileId === actor),
    listByTarget: async (t) => [...store.values()].filter((i) => i.targetProfileId === t),
  };
}

/** Visitas en memoria; misma regla que la PK de `profile_views` (visitante, ficha, día). */
export function createInMemoryProfileViewRepository(): ProfileViewRepository {
  const rows = new Map<string, ViewRow & { viewedProfileId: string }>();
  return {
    async recordOnce(viewer, viewed, day, at) {
      const key = `${viewer}>${viewed}@${day}`;
      if (rows.has(key)) return false;
      rows.set(key, {
        viewerProfileId: viewer,
        viewedProfileId: viewed,
        viewedOn: day,
        count: 1,
        lastAt: at,
      });
      return true;
    },
    listSince: async (viewed, sinceDay) =>
      [...rows.values()].filter((r) => r.viewedProfileId === viewed && r.viewedOn >= sinceDay),
  };
}

/** Sembrado con `fixtureSocial.matches`. */
export function createInMemoryMatchRepository(): MatchRepository {
  const byId = new Map<string, MatchRecord>(fixtureSocial.matches.map((m) => [m.id, m]));
  const find = (key: string) => [...byId.values()].find((m) => pairKey(m) === key);
  return {
    // Sin awaits entre la búsqueda y el alta: atómico en un solo hilo.
    async createIfAbsent(match) {
      const existing = find(pairKey(match));
      if (existing) return { match: existing, created: false };
      if (byId.has(match.id)) throw new Error(`matches_pkey: id duplicado ${match.id}`);
      byId.set(match.id, match);
      return { match, created: true };
    },
    getById: async (id) => byId.get(id) ?? null,
    listByProfile: async (profileId) =>
      [...byId.values()].filter(
        (m) => m.creatorProfileId === profileId || m.brandProfileId === profileId,
      ),
  };
}

/** Candidatos de `ProfilesApi` y embeddings de `ClassificationApi`. F2: pgvector. */
export const createMockCandidateSearch = (deps: {
  profiles: Pick<ProfilesApi, 'getCards' | 'listCandidates'>;
  classification: Pick<ClassificationApi, 'getEmbedding' | 'getEmbeddings'>;
}): CandidateSearch => {
  const withEmbedding = async (card: Awaited<ReturnType<ProfilesApi['getCards']>>[number]) => ({
    card,
    embedding: await deps.classification.getEmbedding(card.id),
  });
  return {
    async find(viewerProfileId, options) {
      const [card] = await deps.profiles.getCards([viewerProfileId]);
      if (!card) return err(new DomainError('NOT_FOUND', 'Perfil no encontrado'));
      const excluded = new Set(options?.exclude ?? []);
      const cards = (
        await deps.profiles.listCandidates(card.role === 'creator' ? 'brand' : 'creator')
      ).filter((c) => !excluded.has(c.id));
      const embeddings = await deps.classification.getEmbeddings(cards.map((c) => c.id));
      return ok({
        viewer: await withEmbedding(card),
        // Sin embedding: entra igual (similitud 0 en el scoring), como en el adaptador real.
        candidates: cards.map((c) => ({ card: c, embedding: embeddings.get(c.id) ?? null })),
        exhausted: true,
      });
    },
  };
};
