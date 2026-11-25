import { useStore } from '@nanostores/react';
import { useEffect, useState } from 'react';
import type { FeedItem, ProfileSummary } from '@sponcer/contracts';
import { Alert } from '../../../components/ui/Alert';
import { messageOf } from '../../../components/ui/errors';
import { activeProfileId, resolveActive } from '../../../lib/state/active-profile';
import { interact, loadFeed } from '../api/feed';
import FeedCard from './FeedCard';
import { filters } from './filters.store';

interface Notice {
  kind: 'success' | 'error' | 'info';
  text: string;
  href?: string;
}

export default function Feed({ profiles }: { profiles: ProfileSummary[] }) {
  const f = useStore(filters);
  const active = resolveActive(profiles, useStore(activeProfileId));
  const [items, setItems] = useState<FeedItem[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const activeId = active?.id;
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const page = await loadFeed(activeId, f);
        if (cancelled) return;
        setItems(page.items);
        setNext(page.nextCursor);
        setNotice(null);
      } catch (e) {
        if (!cancelled) setNotice({ kind: 'error', text: messageOf(e) });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId, f]);

  async function more() {
    if (!activeId || !next) return;
    setLoading(true);
    try {
      const page = await loadFeed(activeId, f, next);
      setItems((prev) => [...prev, ...page.items]);
      setNext(page.nextCursor);
    } catch (e) {
      setNotice({ kind: 'error', text: messageOf(e) });
    } finally {
      setLoading(false);
    }
  }

  async function act(item: FeedItem, kind: 'interest' | 'dismiss') {
    if (!activeId) return;
    setBusyId(item.card.id);
    try {
      const result = await interact({
        actorProfileId: activeId,
        targetProfileId: item.card.id,
        kind,
      });
      setItems((prev) => prev.filter((i) => i.card.id !== item.card.id));
      if (result.matched && result.matchId) {
        setNotice({
          kind: 'success',
          text: `¡Match con @${item.card.handle}! Ya pueden hablar.`,
          href: `/mensajes/${result.matchId}`,
        });
      } else if (kind === 'interest') {
        setNotice({
          kind: 'info',
          text: `Mostraste interés en @${item.card.handle}. Te avisaremos si es mutuo.`,
        });
      }
    } catch (e) {
      setNotice({ kind: 'error', text: messageOf(e) });
    } finally {
      setBusyId(null);
    }
  }

  if (!active) {
    return (
      <Alert kind="info">
        Aún no tienes un perfil verificado. Reclama uno en <a href="/panel">Mi panel</a>.
      </Alert>
    );
  }

  return (
    <section aria-label="Resultados" className="stack">
      <p className="muted">
        Viendo como <strong>@{active.handle}</strong> (
        {active.role === 'brand' ? 'marca' : 'creador'}): se muestran{' '}
        {active.role === 'brand' ? 'creadores' : 'marcas'}.
      </p>
      <div aria-live="polite">
        {notice && (
          <Alert kind={notice.kind}>
            {notice.text} {notice.href && <a href={notice.href}>Abrir chat</a>}
          </Alert>
        )}
        {loading && <p className="muted">Cargando…</p>}
      </div>
      {!loading && items.length === 0 && !notice && (
        <p className="card">No hay más perfiles con estos filtros. Prueba quitar alguno.</p>
      )}
      <div className="grid">
        {items.map((item) => (
          <FeedCard
            key={item.card.id}
            item={item}
            busy={busyId === item.card.id}
            onInterest={() => act(item, 'interest')}
            onDismiss={() => act(item, 'dismiss')}
          />
        ))}
      </div>
      {next && (
        <button type="button" className="btn btn-secondary" disabled={loading} onClick={more}>
          Cargar más
        </button>
      )}
    </section>
  );
}
