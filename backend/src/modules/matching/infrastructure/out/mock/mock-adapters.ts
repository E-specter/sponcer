import { fixtureSocial } from '@sponcer/contracts/fixtures';
import { DomainError } from '../../../../../shared/errors';
import { err, ok } from '../../../../../shared/result';
import type { ClassificationApi } from '../../../../classification';
import type { ProfilesApi } from '../../../../profiles';
import type { CandidateSearch } from '../../../application/ports/out/candidate-search';
import type { InteractionRepository } from '../../../application/ports/out/interaction-repository';
import type { MatchRepository } from '../../../application/ports/out/match-repository';
import type { Interaction, MatchRecord } from '../../../domain/candidate';

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
      store.set(interactionKey(i.actorProfileId, i.targetProfileId), i);
    },
    find: async (actor, target) => store.get(interactionKey(actor, target)) ?? null,
    listByActor: async (actor) => [...store.values()].filter((i) => i.actorProfileId === actor),
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
    async find(viewerProfileId) {
      const [card] = await deps.profiles.getCards([viewerProfileId]);
      if (!card) return err(new DomainError('NOT_FOUND', 'Perfil no encontrado'));
      const cards = await deps.profiles.listCandidates(
        card.role === 'creator' ? 'brand' : 'creator',
      );
      const embeddings = await deps.classification.getEmbeddings(cards.map((c) => c.id));
      return ok({
        viewer: await withEmbedding(card),
        candidates: cards.map((c) => ({ card: c, embedding: embeddings.get(c.id) ?? null })),
      });
    },
  };
};
