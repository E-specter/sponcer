import type { Message } from '@sponcer/contracts';
import type { MatchRef } from '../../../domain/match-ref';

/** En integración se conecta a `MatchingApi.getMatch`. */
export interface MatchReader {
  findById(matchId: string): Promise<MatchRef | null>;
}

export interface MessageRepository {
  add(message: Message): Promise<void>;
  /** Más reciente primero. `offset` es la posición ya consumida. */
  listByMatch(
    matchId: string,
    offset: number,
    limit: number,
  ): Promise<{ items: Message[]; total: number }>;
}

/** Entrega en vivo. Adapter sobre Supabase Realtime. */
export interface RealtimeGateway {
  publish(message: Message): Promise<void>;
}
