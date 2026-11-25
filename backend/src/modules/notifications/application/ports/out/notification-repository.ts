import type { Notification } from '@sponcer/contracts';

export type StoredNotification = Notification & { userId: string };

export interface NotificationRepository {
  add(n: StoredNotification): Promise<void>;
  findById(id: string): Promise<StoredNotification | null>;
  /** Más reciente primero. `offset` es la posición ya consumida. */
  listByUser(
    userId: string,
    offset: number,
    limit: number,
  ): Promise<{ items: StoredNotification[]; total: number }>;
  markRead(id: string, at: string): Promise<StoredNotification | null>;
}
