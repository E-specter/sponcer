import type { SendMessageRequest } from '@sponcer/contracts';
import { callBff } from '../../../lib/api/bff';

export const olderMessages = (matchId: string, cursor: string) =>
  callBff('listMessages', { params: { matchId }, query: { cursor } });

export const sendMessage = (matchId: string, body: SendMessageRequest) =>
  callBff('sendMessage', { params: { matchId }, body });

/** Primera página (más recientes primero): sirve para re-sincronizar tras suscribirse a Realtime. */
export const latestMessages = (matchId: string) =>
  callBff('listMessages', { params: { matchId }, query: {} });
