import { useStore } from '@nanostores/react';
import { useEffect, useState } from 'react';
import type { FeedItem, ProfileSummary } from '@sponcer/contracts';
import { Alert } from '../../../components/ui/Alert';
import { Notice } from '../../../components/ui/Notice';
import { EmptyState, ErrorState, Skeleton } from '../../../components/ui/States';
import { messageOf } from '../../../components/ui/errors';
import { useActiveProfile } from '../../../lib/state/use-active-profile';
import { interact, loadFeed } from '../api/feed';
import FeedCard from './FeedCard';
import { EMPTY_FILTERS, filters, searchQuery } from './filters.store';

/** Espera tras la última tecla antes de pedir la búsqueda al servidor. */
const SEARCH_DEBOUNCE_MS = 350;

function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

interface Notice {
  kind: 'success' | 'error' | 'info';
  text: string;
  href?: string;
}

export default function Feed({ profiles }: { profiles: ProfileSummary[] }) {
  const f = useStore(filters);
  const query = useDebounced(useStore(searchQuery).trim(), SEARCH_DEBOUNCE_MS);
  const { active, ready } = useActiveProfile(profiles);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [reloads, setReloads] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const activeId = ready ? active?.id : undefined;
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const page = await loadFeed(activeId, f, query);
        if (cancelled) return;
        setItems(page.items);
        setNext(page.nextCursor);
        setNotice(null);
        setLoadError(null);
      } catch (e) {
        if (!cancelled) setLoadError(messageOf(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId, f, query, reloads]);

  async function more() {
    if (!activeId || !next) return;
    setLoading(true);
    try {
      const page = await loadFeed(activeId, f, query, next);
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

  const visible = items;

  return (
    <section aria-label="Resultados" className="stack">
      <div className="criteria">
        <span>
          Viendo como <strong>@{active.handle}</strong> (
          {active.role === 'brand' ? 'marca' : 'creador'}):{' '}
          {active.role === 'brand' ? 'creadores' : 'marcas'} con afinidad
        </span>
        <span>Orden: compatibilidad</span>
      </div>
      <div aria-live="polite">
        {notice && (
          <Alert kind={notice.kind}>
            {notice.text} {notice.href && <a href={notice.href}>Abrir chat</a>}
          </Alert>
        )}
      </div>
      {loadError && <ErrorState message={loadError} onRetry={() => setReloads((n) => n + 1)} />}
      {loading && items.length === 0 && (
        <div className="feed-grid" aria-busy="true">
          <Skeleton />
          <Skeleton />
        </div>
      )}
      {!loading && !loadError && visible.length === 0 && !notice && (
        <EmptyState
          message="No hay perfiles que coincidan con estos filtros."
          action={
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                filters.set({ ...EMPTY_FILTERS });
                searchQuery.set('');
              }}
            >
              Limpiar filtros
            </button>
          }
          note="No mostramos resultados que no coinciden."
        />
      )}
      <div className="feed-grid">
        {visible.map((item) => (
          <FeedCard
            key={item.card.id}
            item={item}
            busy={busyId === item.card.id}
            viewerIsBrand={active.role === 'brand'}
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
      <Notice kind="info">
        Las afinidades se basan en nichos y datos públicos de Instagram, no en seguidores. La fuente
        acompaña al dato.
      </Notice>
    </section>
  );
}
