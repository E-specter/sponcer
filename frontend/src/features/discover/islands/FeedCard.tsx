import type { FeedItem } from '@sponcer/contracts';
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
const INITIALS = 2;
const AVATAR_SIZE = 48;

interface Props {
  item: FeedItem;
  busy: boolean;
  onInterest: () => void;
  onDismiss: () => void;
}

export default function FeedCard({ item, busy, onInterest, onDismiss }: Props) {
  const { card, reasons, score } = item;
  const headingId = `card-${card.id}`;
  return (
    <article className="card stack" aria-labelledby={headingId}>
      <header className="row">
        {card.profilePicUrl ? (
          <img src={card.profilePicUrl} alt="" width={AVATAR_SIZE} height={AVATAR_SIZE} />
        ) : (
          <span className="chip" aria-hidden="true">
            {card.fullName.slice(0, INITIALS).toUpperCase()}
          </span>
        )}
        <div>
          <h3 id={headingId}>@{card.handle}</h3>
          <span className="muted small">{card.fullName}</span>
        </div>
      </header>
      <p className="row">
        <span className="badge">{TIER_LABEL[card.tier]}</span>
        <span className="badge">{card.role === 'brand' ? 'Marca' : 'Creador'}</span>
        <span className="badge badge-success">Compatibilidad {Math.round(score * PERCENT)} %</span>
      </p>
      <p className="row" aria-label="Nichos">
        {card.niches.map((n) => (
          <span key={n} className="chip">
            {NICHE_LABEL[n]}
          </span>
        ))}
      </p>
      <dl className="small">
        <div className="row">
          <dt>Seguidores:</dt>
          <dd>{formatCount(card.followers)}</dd>
        </div>
        <div className="row">
          <dt>Interacción:</dt>
          <dd>{formatPercent(card.engagementRate)}</dd>
        </div>
        {card.sector && (
          <div className="row">
            <dt>Sector:</dt>
            <dd>{SECTOR_LABEL[card.sector]}</dd>
          </div>
        )}
        {card.minServicePricePen !== null && (
          <div className="row">
            <dt>Desde:</dt>
            <dd>{formatPen(card.minServicePricePen)}</dd>
          </div>
        )}
        {card.budgetMaxPen !== null && (
          <div className="row">
            <dt>Presupuesto hasta:</dt>
            <dd>{formatPen(card.budgetMaxPen)}</dd>
          </div>
        )}
      </dl>
      {reasons.length > 0 && (
        <section aria-label="Por qué te lo recomendamos">
          <h4 className="small">Por qué te lo recomendamos</h4>
          <ul className="small">
            {reasons.map((r) => (
              <li key={r}>{REASON_LABEL[r]}</li>
            ))}
          </ul>
        </section>
      )}
      <div className="row">
        <button type="button" className="btn" disabled={busy} onClick={onInterest}>
          Me interesa
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={onDismiss}>
          Descartar
        </button>
        <a className="btn btn-secondary" href={`/perfil/${card.handle}`}>
          Ver ficha
        </a>
      </div>
    </article>
  );
}
