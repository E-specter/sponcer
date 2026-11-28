import { useEffect, useState } from 'react';
import type {
  ProfileSummary,
  VisibilityItem,
  VisibilityKind,
  VisibilitySummary,
} from '@sponcer/contracts';
import { Alert } from '../../../components/ui/Alert';
import { Avatar } from '../../../components/ui/Avatar';
import { EmptyState, ErrorState, Skeleton } from '../../../components/ui/States';
import { messageOf } from '../../../components/ui/errors';
import { formatDate } from '../../../lib/labels';
import { useActiveProfile } from '../../../lib/state/use-active-profile';
import { interact } from '../../discover/api/feed';
import QuoteDialog from '../../campaigns/islands/QuoteDialog';
import { loadSummary, loadVisibility } from '../api/visibility';

const TABS: { kind: VisibilityKind; label: string; empty: string }[] = [
  {
    kind: 'interest',
    label: 'Interesados',
    empty: 'Nadie ha mostrado interés sin match todavía.',
  },
  { kind: 'view', label: 'Visitas', empty: 'Nadie ha visto tu ficha en los últimos 30 días.' },
];

function Counter({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="card">
      <p className="small muted">{label}</p>
      <p className="stat">{value}</p>
      <p className="small muted">{hint}</p>
    </div>
  );
}

/** Visibilidad (ADR-009): quién se interesó sin match y quién vio la ficha del perfil activo. */
export default function VisibilityPanel({ profiles }: { profiles: ProfileSummary[] }) {
  const { active, ready } = useActiveProfile(profiles);
  const [summary, setSummary] = useState<VisibilitySummary | null>(null);
  const [kind, setKind] = useState<VisibilityKind>('interest');
  const [items, setItems] = useState<VisibilityItem[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'success' | 'info' | 'error'; text: string } | null>(
    null,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);

  const profileId = ready ? active?.id : undefined;
  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    setLoading(true);
    setNotice(null);
    (async () => {
      try {
        const [sum, page] = await Promise.all([
          loadSummary(profileId),
          loadVisibility(profileId, kind),
        ]);
        if (cancelled) return;
        setSummary(sum);
        setItems(page.items);
        setNext(page.nextCursor);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(messageOf(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileId, kind, reloads]);

  async function more() {
    if (!profileId || !next) return;
    setLoading(true);
    try {
      const page = await loadVisibility(profileId, kind, next);
      setItems((prev) => [...prev, ...page.items]);
      setNext(page.nextCursor);
    } catch (e) {
      setNotice({ kind: 'error', text: messageOf(e) });
    } finally {
      setLoading(false);
    }
  }

  async function giveBack(item: VisibilityItem) {
    if (!profileId) return;
    setBusy(item.profile.id);
    try {
      const result = await interact({
        actorProfileId: profileId,
        targetProfileId: item.profile.id,
        kind: 'interest',
      });
      setItems((prev) =>
        prev.map((i) => (i.profile.id === item.profile.id ? { ...i, reciprocated: true } : i)),
      );
      setNotice(
        result.matched && result.matchId
          ? { kind: 'success', text: `¡Match con @${item.profile.handle}! Ya pueden hablar.` }
          : { kind: 'info', text: `Mostraste interés en @${item.profile.handle}.` },
      );
    } catch (e) {
      setNotice({ kind: 'error', text: messageOf(e) });
    } finally {
      setBusy(null);
    }
  }

  if (!active) {
    return <Alert kind="info">Reclama un perfil en Mi panel para ver tu visibilidad.</Alert>;
  }

  const tab = TABS.find((t) => t.kind === kind) ?? TABS[0];
  const canQuote = active.role === 'brand';
  return (
    <section className="stack" aria-label="Visibilidad">
      <div className="criteria">
        <span>
          Visibilidad de <strong>@{active.handle}</strong>
        </span>
        <span>Solo perfiles del tipo opuesto</span>
      </div>
      <div className="grid" role="group" aria-label="Resumen">
        <Counter
          label="Intereses sin match"
          value={summary?.interests7d ?? 0}
          hint={`7 días · ${summary?.interests30d ?? 0} en 30 días`}
        />
        <Counter
          label="Visitas a tu ficha"
          value={summary?.views7d ?? 0}
          hint={`7 días · ${summary?.views30d ?? 0} en 30 días`}
        />
      </div>
      <div className="tabs-bar" role="tablist" aria-label="Tipo de visibilidad">
        {TABS.map((t) => (
          <button
            key={t.kind}
            type="button"
            role="tab"
            id={`vis-tab-${t.kind}`}
            aria-selected={t.kind === kind}
            aria-controls="vis-panel"
            onClick={() => setKind(t.kind)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div id="vis-panel" role="tabpanel" aria-labelledby={`vis-tab-${kind}`} className="stack">
        <div aria-live="polite">{notice && <Alert kind={notice.kind}>{notice.text}</Alert>}</div>
        {loading && items.length === 0 && (
          <div aria-busy="true">
            <Skeleton />
          </div>
        )}
        {error && !loading && (
          <ErrorState message={error} onRetry={() => setReloads((n) => n + 1)} />
        )}
        {!loading && !error && items.length === 0 && <EmptyState message={tab?.empty ?? ''} />}
        <ul className="stack vis-list">
          {items.map((i) => (
            <li key={`${i.kind}-${i.profile.id}`} className="card vis-row">
              <Avatar name={i.profile.fullName ?? i.profile.handle} src={i.profile.profilePicUrl} />
              <div className="vis-who">
                <strong>{i.profile.fullName ?? `@${i.profile.handle}`}</strong>
                <span className="small muted">
                  @{i.profile.handle} · {i.profile.role === 'brand' ? 'Marca' : 'Influencer'}
                </span>
                <span className="small muted">
                  {i.kind === 'view'
                    ? `${i.count} ${i.count === 1 ? 'visita' : 'visitas'} · última ${formatDate(i.at)}`
                    : `Se interesó el ${formatDate(i.at)}`}
                </span>
              </div>
              <div className="row vis-actions">
                <a className="btn btn-text" href={`/perfil/${i.profile.handle}`}>
                  Ver ficha
                </a>
                {i.reciprocated ? (
                  <span className="small muted">Interés enviado</span>
                ) : (
                  <button
                    type="button"
                    className="btn"
                    disabled={busy === i.profile.id}
                    onClick={() => giveBack(i)}
                  >
                    Devolver interés
                  </button>
                )}
                {canQuote && i.profile.role === 'creator' && (
                  <QuoteDialog brandProfileId={active.id} target={i.profile} />
                )}
              </div>
            </li>
          ))}
        </ul>
        {next && (
          <button type="button" className="btn btn-secondary" disabled={loading} onClick={more}>
            Cargar más
          </button>
        )}
      </div>
    </section>
  );
}
