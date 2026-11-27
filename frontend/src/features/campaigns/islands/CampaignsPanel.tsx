import { useEffect, useState } from 'react';
import type { Campaign, CampaignStatus, ProfileSummary } from '@sponcer/contracts';
import { Alert } from '../../../components/ui/Alert';
import { EmptyState, ErrorState, Skeleton } from '../../../components/ui/States';
import { Tag, type TagTone } from '../../../components/ui/Tag';
import { messageOf } from '../../../components/ui/errors';
import {
  CAMPAIGN_KIND_LABEL,
  CAMPAIGN_STATUS_LABEL,
  QUOTE_STATUS_LABEL,
  formatPen,
} from '../../../lib/labels';
import { useActiveProfile } from '../../../lib/state/use-active-profile';
import { listCampaigns, updateCampaign } from '../api/campaigns';
import CampaignForm from './CampaignForm';

export const STATUS_TONE: Record<CampaignStatus, TagTone> = {
  draft: 'neutral',
  active: 'exito',
  closed: 'tinta',
};

const NEXT: Partial<Record<CampaignStatus, { to: CampaignStatus; label: string }>> = {
  draft: { to: 'active', label: 'Activar' },
  active: { to: 'closed', label: 'Cerrar' },
};

/** Avance: cotizaciones por estado y monto comprometido (aceptadas o completadas). */
export function CampaignStatsLine({ campaign }: { campaign: Campaign }) {
  const { quotes, byStatus, committedPen } = campaign.stats;
  const parts = Object.entries(byStatus).map(
    ([status, n]) =>
      `${n} ${QUOTE_STATUS_LABEL[status as keyof typeof QUOTE_STATUS_LABEL] ?? status}`,
  );
  return (
    <p className="small muted">
      {quotes === 0 ? 'Sin cotizaciones aún.' : `${quotes} cotizaciones: ${parts.join(' · ')}.`}{' '}
      Comprometido: {formatPen(committedPen)}
      {campaign.budgetPen !== null && ` de ${formatPen(campaign.budgetPen)}`}
    </p>
  );
}

interface Props {
  profiles: ProfileSummary[];
}

/** Lista de campañas de la marca activa, con alta y cambio de estado. */
export default function CampaignsPanel({ profiles }: Props) {
  const brands = profiles.filter((p) => p.role === 'brand');
  const { active, ready } = useActiveProfile(brands);
  const [items, setItems] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);

  const brandId = ready ? active?.id : undefined;
  useEffect(() => {
    if (!brandId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const page = await listCampaigns(brandId);
        if (cancelled) return;
        setItems(page.items);
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
  }, [brandId, reloads]);

  async function move(c: Campaign, to: CampaignStatus) {
    if (!brandId) return;
    setBusy(c.id);
    try {
      const saved = await updateCampaign(c.id, { brandProfileId: brandId, status: to });
      setItems((prev) => prev.map((x) => (x.id === c.id ? saved : x)));
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(null);
    }
  }

  if (!active) {
    return <Alert kind="info">Reclama una marca en Mi panel para crear campañas.</Alert>;
  }

  return (
    <section className="stack" aria-label="Campañas">
      <div className="criteria">
        <span>
          Campañas de <strong>@{active.handle}</strong>
        </span>
        {!creating && (
          <button type="button" className="btn" onClick={() => setCreating(true)}>
            Nueva campaña
          </button>
        )}
      </div>
      {creating && brandId && (
        <div className="card">
          <h2>Nueva campaña</h2>
          <CampaignForm
            brandProfileId={brandId}
            onCancel={() => setCreating(false)}
            onSaved={(c) => {
              setItems((prev) => [c, ...prev]);
              setCreating(false);
            }}
          />
        </div>
      )}
      <div aria-live="polite">
        {error && !loading && items.length > 0 && <Alert kind="error">{error}</Alert>}
      </div>
      {loading && (
        <div aria-busy="true">
          <Skeleton />
        </div>
      )}
      {!loading && error && items.length === 0 && (
        <ErrorState message={error} onRetry={() => setReloads((n) => n + 1)} />
      )}
      {!loading && !error && items.length === 0 && !creating && (
        <EmptyState
          message="Aún no tienes campañas. Crea una para cotizar a varios influencers a la vez."
          note="Toda cotización pertenece a una campaña."
        />
      )}
      {items.map((c) => {
        const next = NEXT[c.status];
        return (
          <article key={c.id} className="card stack" aria-labelledby={`c-${c.id}`}>
            <h3 id={`c-${c.id}`}>
              <a href={`/campanas/${c.id}`}>{c.name}</a>
            </h3>
            <p className="row">
              <Tag tone={STATUS_TONE[c.status]}>{CAMPAIGN_STATUS_LABEL[c.status]}</Tag>
              <Tag>{CAMPAIGN_KIND_LABEL[c.kind]}</Tag>
              <span className="small muted">
                {c.startsOn}
                {c.endsOn ? ` → ${c.endsOn}` : ''}
              </span>
            </p>
            <CampaignStatsLine campaign={c} />
            <div className="row">
              <a className="btn btn-secondary" href={`/campanas/${c.id}`}>
                Ver detalle
              </a>
              {next && (
                <button
                  type="button"
                  className={next.to === 'closed' ? 'btn btn-danger' : 'btn'}
                  disabled={busy === c.id}
                  onClick={() => move(c, next.to)}
                >
                  {next.label}
                </button>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}
