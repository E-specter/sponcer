import { callBff } from '../../../lib/api/bff';

export const listNotifications = () => callBff('notifications', { query: {} });

export const markRead = (notificationId: string) =>
  callBff('markNotificationRead', { params: { notificationId } });
