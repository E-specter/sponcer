import type { Message, SendMessageRequest } from '@sponcer/contracts';
import type { DomainError } from '../../../../../shared/errors';
import type { Result } from '../../../../../shared/result';
import type { MatchRef } from '../../../domain/match-ref';

type R<T> = Promise<Result<T, DomainError>>;

export interface MessagesPage {
  items: Message[];
  nextCursor: string | null;
}

export type SendMessage = (userId: string, matchId: string, req: SendMessageRequest) => R<Message>;
export type ListMessages = (
  userId: string,
  matchId: string,
  q: { cursor?: string | undefined; limit: number },
) => R<MessagesPage>;

/** API pública del slice (la consume notifications para hallar la contraparte de un match). */
export interface ChatApi {
  getMatch(matchId: string): Promise<MatchRef | null>;
}
