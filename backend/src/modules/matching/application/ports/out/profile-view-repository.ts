import type { ViewRow } from '../../../domain/visibility';

export interface ProfileViewRepository {
  /**
   * Una visita por (visitante, ficha, día): idempotente y atómico. `false` si ya había una ese día
   * (no se incrementa `count`: el día repetido no suma).
   */
  recordOnce(
    viewerProfileId: string,
    viewedProfileId: string,
    day: string,
    at: string,
  ): Promise<boolean>;
  /** Visitas a la ficha con `viewedOn >= sinceDay`. */
  listSince(viewedProfileId: string, sinceDay: string): Promise<ViewRow[]>;
}
