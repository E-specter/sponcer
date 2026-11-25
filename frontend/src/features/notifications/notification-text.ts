import type { Notification } from '@sponcer/contracts';

export const KIND_TEXT: Record<Notification['kind'], string> = {
  match_created: 'Tienes un nuevo match',
  quote_status_changed: 'Una cotización cambió de estado',
  message_received: 'Tienes un mensaje nuevo',
};

export function hrefFor(n: Notification): string {
  if (n.kind === 'quote_status_changed') return '/panel/cotizaciones';
  return n.payload.matchId ? `/mensajes/${n.payload.matchId}` : '/panel/matches';
}
