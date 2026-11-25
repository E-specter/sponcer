import type { Interaction } from '../../../domain/candidate';

export interface InteractionRepository {
  /** Una interacción por par (actor, objetivo): la nueva reemplaza a la anterior. */
  upsert(interaction: Interaction): Promise<void>;
  find(actorProfileId: string, targetProfileId: string): Promise<Interaction | null>;
  listByActor(actorProfileId: string): Promise<Interaction[]>;
}
