import { X } from 'lucide-react';
import type { FeedItem } from '@sponcer/contracts';
import QuoteDialog from '../../campaigns/islands/QuoteDialog';
import { Chip } from '../../../components/ui/Chip';
import { ProfileCard } from '../../../components/ui/ProfileCard';
import {
  CITY_LABEL,
  NICHE_LABEL,
  REASON_LABEL,
  SECTOR_LABEL,
  TIER_LABEL,
  formatCount,
  formatPen,
  formatPercent,
} from '../../../lib/labels';

const PERCENT = 100;
const ICON_SIZE = 18;

interface Props {
  item: FeedItem;
  busy: boolean;
  onInterest: () => void;
  onDismiss: () => void;
  /** Marca activa (puede cotizar sin match, ADR-009); null si el perfil activo es influencer. */
  viewerBrandId: string | null;
}

export default function FeedCard({ item, busy, onInterest, onDismiss, viewerBrandId }: Props) {
  const { card, reasons, score } = item;
  const isBrand = card.role === 'brand';
  const metrics = [
    { label: 'Tamaño', value: TIER_LABEL[card.tier] },
    { label: 'Seguidores', value: formatCount(card.followers) },
    { label: 'Interacción', value: formatPercent(card.engagementRate) },
    ...(card.minServicePricePen !== null
      ? [{ label: 'Desde', value: formatPen(card.minServicePricePen) }]
      : []),
    ...(card.budgetMaxPen !== null
      ? [{ label: 'Presupuesto hasta', value: formatPen(card.budgetMaxPen) }]
      : []),
    { label: 'Compatibilidad', value: `${Math.round(score * PERCENT)} %` },
  ];
  return (
    <ProfileCard
      id={card.id}
      name={card.fullName || `@${card.handle}`}
      subtitle={
        card.city
          ? `${CITY_LABEL[card.city]} · Ubicación declarada`
          : `${isBrand ? 'Marca' : 'Influencer'}${card.sector ? ` · ${SECTOR_LABEL[card.sector]}` : ''} · @${card.handle}`
      }
      imageUrl={card.profilePicUrl}
      faceFocus={!isBrand}
      provenance={`${isBrand ? 'Marca' : 'Influencer'} · Instagram`}
      bio={card.bio}
      sourceLine={
        card.bioSource === 'instagram'
          ? `Bio compartida · Instagram · @${card.handle}`
          : card.bioSource === 'declared'
            ? 'Declarado en Sponcer'
            : null
      }
      niches={card.niches.map((n) => (
        <Chip key={n}>{NICHE_LABEL[n]}</Chip>
      ))}
      metrics={metrics}
      reason={reasons.length > 0 ? reasons.map((r) => REASON_LABEL[r]).join(' · ') : undefined}
      actions={
        <>
          <button type="button" className="btn" disabled={busy} onClick={onInterest}>
            Me interesa
          </button>
          <a className="btn btn-text" href={`/perfil/${card.handle}`}>
            Ver perfil
          </a>
          <button
            type="button"
            className="pcard-dismiss"
            disabled={busy}
            onClick={onDismiss}
            aria-label={`Descartar a ${card.fullName || card.handle}`}
            title="Descartar"
          >
            <X size={ICON_SIZE} strokeWidth={2} aria-hidden="true" />
          </button>
          {viewerBrandId && !isBrand && (
            <QuoteDialog
              brandProfileId={viewerBrandId}
              target={card}
              variant="btn btn-secondary pcard-quote"
            />
          )}
        </>
      }
    />
  );
}
