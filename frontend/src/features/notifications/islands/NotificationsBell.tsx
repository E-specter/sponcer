import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import type { Notification } from '@sponcer/contracts';
import { formatDate } from '../../../lib/labels';
import { listNotifications, markRead } from '../api/notifications';
import { subscribeNotifications } from '../api/realtime';

const ICON_SIZE = 18;

const KIND_TEXT: Record<Notification['kind'], string> = {
  match_created: 'Tienes un nuevo match',
  quote_status_changed: 'Una cotización cambió de estado',
  message_received: 'Tienes un mensaje nuevo',
};

function hrefFor(n: Notification): string {
  if (n.kind === 'quote_status_changed') return '/panel/cotizaciones';
  return n.payload.matchId ? `/mensajes/${n.payload.matchId}` : '/panel/matches';
}

/** Campana de notificaciones; las nuevas llegan por Supabase Realtime (solo lectura). */
export default function NotificationsBell() {
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setItems((await listNotifications()).items);
      } catch {
        setFailed(true);
      }
    })();
  }, []);

  useEffect(
    () =>
      subscribeNotifications((n) =>
        setItems((prev) => (prev.some((x) => x.id === n.id) ? prev : [n, ...prev])),
      ),
    [],
  );

  const unread = items.filter((n) => !n.readAt).length;

  async function read(id: string) {
    try {
      const updated = await markRead(id);
      setItems((prev) => prev.map((n) => (n.id === id ? updated : n)));
    } catch {
      setFailed(true);
    }
  }

  return (
    <div className="bell">
      <button
        type="button"
        className="bell-btn"
        aria-expanded={open}
        aria-controls="panel-notificaciones"
        onClick={() => setOpen((o) => !o)}
      >
        <Bell size={ICON_SIZE} strokeWidth={2} aria-hidden="true" />
        <span className="sr-only">Notificaciones{unread > 0 ? `, ${unread} sin leer` : ''}</span>
        {unread > 0 && (
          <span className="bell-count" aria-hidden="true">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <section id="panel-notificaciones" className="card bell-panel" aria-label="Notificaciones">
          {failed && (
            <p className="field-error">No se pudieron cargar o actualizar las notificaciones.</p>
          )}
          {items.length === 0 && !failed && <p className="muted">No tienes notificaciones.</p>}
          <ul>
            {items.map((n) => (
              <li key={n.id}>
                <a href={hrefFor(n)}>{KIND_TEXT[n.kind]}</a>
                <div className="small muted">{formatDate(n.createdAt)}</div>
                {n.readAt ? (
                  <span className="small muted">Leída</span>
                ) : (
                  <button type="button" className="btn btn-text" onClick={() => read(n.id)}>
                    Marcar como leída
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
