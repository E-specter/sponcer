import type { FeedItem } from '@sponcer/contracts';
import { Chip } from '../../../components/ui/Chip';
import { ProfileCard } from '../../../components/ui/ProfileCard';
import {
  NICHE_LABEL,
  REASON_LABEL,
  SECTOR_LABEL,
  TIER_LABEL,
  formatCount,
  formatPen,
  formatPercent,
} from '../../../lib/labels';

const PERCENT = 100;

interface Props {
  item: FeedItem;
  busy: boolean;
  onInterest: () => void;
  onDismiss: () => void;
}

export default function FeedCard({ item, busy, onInterest, onDismiss }: Props) {
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
      subtitle={`${isBrand ? 'Marca' : 'Creador'}${card.sector ? ` · ${SECTOR_LABEL[card.sector]}` : ''} · @${card.handle}`}
      imageUrl={card.profilePicUrl}
      provenance="Instagram"
      sourceLine={`Datos públicos · Instagram · @${card.handle}`}
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
          <button type="button" className="btn btn-text" disabled={busy} onClick={onDismiss}>
            Descartar
          </button>
        </>
      }
    />
  );
}
