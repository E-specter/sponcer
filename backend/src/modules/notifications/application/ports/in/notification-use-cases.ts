import type { Notification } from '@sponcer/contracts';
import type { DomainError } from '../../../../../shared/errors';
import type { Result } from '../../../../../shared/result';

type R<T> = Promise<Result<T, DomainError>>;

export type ListNotifications = (
  userId: string,
  q: { cursor?: string | undefined; limit: number },
) => R<{ items: Notification[]; nextCursor: string | null }>;
export type MarkAsRead = (userId: string, notificationId: string) => R<Notification>;
