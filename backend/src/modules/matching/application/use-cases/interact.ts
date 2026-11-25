import { DomainError } from '../../../../shared/errors';
import type { EventBus } from '../../../../shared/events/event-bus';
import { err, ok } from '../../../../shared/result';
import type { ProfilesApi } from '../../../profiles';
import type { Interact } from '../ports/in/matching-use-cases';
import type { InteractionRepository } from '../ports/out/interaction-repository';
import type { MatchRepository } from '../ports/out/match-repository';

const NO_MATCH = { matched: false, matchId: null } as const;

/** ExpressInterest / Dismiss. El interés recíproco crea el match una sola vez y publica `MatchCreated`. */
export const makeInteract =
  (d: {
    profiles: Pick<ProfilesApi, 'isOwner' | 'getCards'>;
    interactions: InteractionRepository;
    matches: MatchRepository;
    bus: EventBus;
    now: () => Date;
    newId: () => string;
  }): Interact =>
  async (userId, req) => {
    if (!(await d.profiles.isOwner(req.actorProfileId, userId))) {
      return err(new DomainError('FORBIDDEN', 'El perfil no te pertenece'));
    }
    if (req.actorProfileId === req.targetProfileId) {
      return err(new DomainError('VALIDATION_ERROR', 'No puedes interactuar contigo mismo'));
    }
    const [actor, target] = await d.profiles.getCards([req.actorProfileId, req.targetProfileId]);
    if (!actor || !target || actor.id !== req.actorProfileId) {
      return err(new DomainError('NOT_FOUND', 'Perfil no encontrado'));
    }
    if (actor.role === target.role) {
      return err(new DomainError('VALIDATION_ERROR', 'Solo hay interacción entre creador y marca'));
    }

    const createdAt = d.now().toISOString();
    await d.interactions.upsert({
      id: d.newId(),
      actorProfileId: actor.id,
      targetProfileId: target.id,
      kind: req.kind,
      createdAt,
    });
    if (req.kind === 'dismiss') return ok(NO_MATCH);

    const reciprocal = await d.interactions.find(target.id, actor.id);
    if (reciprocal?.kind !== 'interest') return ok(NO_MATCH);

    const creator = actor.role === 'creator' ? actor : target;
    const brand = actor.role === 'brand' ? actor : target;
    const { match, created } = await d.matches.createIfAbsent({
      id: d.newId(),
      creatorProfileId: creator.id,
      brandProfileId: brand.id,
      createdAt,
    });
    if (created) {
      d.bus.publish({
        type: 'MatchCreated',
        matchId: match.id,
        creatorProfileId: match.creatorProfileId,
        brandProfileId: match.brandProfileId,
      });
    }
    return ok({ matched: true, matchId: match.id });
  };
