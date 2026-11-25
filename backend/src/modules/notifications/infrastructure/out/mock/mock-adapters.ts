import { fixtureSocial } from '@sponcer/contracts/fixtures';
import type {
  NotificationRepository,
  StoredNotification,
} from '../../../application/ports/out/notification-repository';

/** Repositorio en memoria sembrado desde `contracts/fixtures`. */
export function createMockNotificationRepository(): NotificationRepository {
  const byId = new Map<string, StoredNotification>(
    fixtureSocial.notifications.map((n) => [n.id, n]),
  );
  return {
    add: async (n) => void byId.set(n.id, n),
    findById: async (id) => byId.get(id) ?? null,
    async listByUser(userId, offset, limit) {
      const mine = [...byId.values()]
        .filter((n) => n.userId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { items: mine.slice(offset, offset + limit), total: mine.length };
    },
    async markRead(id, at) {
      const n = byId.get(id);
      if (!n) return null;
      const updated = { ...n, readAt: at };
      byId.set(id, updated);
      return updated;
    },
  };
}
