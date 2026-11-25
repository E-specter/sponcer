import type { MatchRecord } from '../../../domain/candidate';

export interface MatchRepository {
  /** Atómico: un solo match por par creador/marca. `created: false` devuelve el existente. */
  createIfAbsent(match: MatchRecord): Promise<{ match: MatchRecord; created: boolean }>;
  getById(matchId: string): Promise<MatchRecord | null>;
  listByProfile(profileId: string): Promise<MatchRecord[]>;
}
