import { useEffect, useState } from 'react';
import { MAX_BULK_QUOTES, type FeedItem, type ProfileSummary } from '@sponcer/contracts';
import { Alert } from '../../../components/ui/Alert';
import { SearchField } from '../../../components/ui/SearchField';
import { messageOf } from '../../../components/ui/errors';
import { NICHE_LABEL, formatCount } from '../../../lib/labels';
import { loadFeed } from '../../discover/api/feed';
import { EMPTY_FILTERS } from '../../discover/islands/filters.store';
import QuoteComposer from './QuoteComposer';

const SEARCH_DEBOUNCE_MS = 350;

interface Props {
  brand: ProfileSummary;
  campaignId: string;
  /** Solo una campaña activa admite cotizaciones nuevas. */
  active: boolean;
}

/** "Cotizar a influencers": se eligen varios desde el feed o la búsqueda, dentro de la campaña. */
export default function CampaignQuotePicker({ brand, campaignId, active }: Props) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<FeedItem[]>([]);
  const [chosen, setChosen] = useState<Record<string, ProfileSummary>>({});
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const page = await loadFeed(brand.id, EMPTY_FILTERS, q.trim());
        if (cancelled) return;
        setItems(page.items.filter((i) => i.card.role === 'creator'));
        setError(null);
      } catch (e) {
        if (!cancelled) setError(messageOf(e));
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [brand.id, q, active]);

  if (!active) {
    return (
      <Alert kind="info">
        Activa la campaña para cotizar a influencers: una campaña en borrador o cerrada no admite
        cotizaciones nuevas.
      </Alert>
    );
  }

  const selected = Object.values(chosen);
  const toggle = (c: ProfileSummary) =>
    setChosen((prev) => {
      const { [c.id]: removed, ...rest } = prev;
      return removed ? rest : { ...prev, [c.id]: c };
    });

  return (
    <section className="stack" aria-labelledby="cotizar-influencers">
      <h2 id="cotizar-influencers">Cotizar a influencers</h2>
      {!composing && (
        <>
          <SearchField
            id="picker-q"
            label="Buscar influencers"
            value={q}
            onChange={setQ}
            placeholder="Nombre, @handle o nicho"
          />
          <div aria-live="polite">{error && <Alert kind="error">{error}</Alert>}</div>
          <fieldset>
            <legend>
              Elige hasta {MAX_BULK_QUOTES} ({selected.length} seleccionados)
            </legend>
            <ul className="stack picker-list">
              {items.map(({ card }) => (
                <li key={card.id}>
                  <label className="picker-row">
                    <input
                      type="checkbox"
                      checked={card.id in chosen}
                      disabled={!(card.id in chosen) && selected.length >= MAX_BULK_QUOTES}
                      onChange={() => toggle(card)}
                    />
                    <span>
                      <strong>{card.fullName || `@${card.handle}`}</strong>{' '}
                      <span className="small muted">
                        @{card.handle} · {formatCount(card.followers)} seguidores ·{' '}
                        {card.niches.map((n) => NICHE_LABEL[n]).join(', ')}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {items.length === 0 && !error && (
              <p className="muted small">No hay influencers que coincidan con la búsqueda.</p>
            )}
          </fieldset>
          <button
            type="button"
            className="btn"
            disabled={selected.length === 0}
            onClick={() => setComposing(true)}
          >
            Continuar con {selected.length} {selected.length === 1 ? 'influencer' : 'influencers'}
          </button>
        </>
      )}
      {composing && (
        <div className="stack">
          <p className="row">
            <button type="button" className="btn btn-text" onClick={() => setComposing(false)}>
              Cambiar selección
            </button>
            <span className="muted small">{selected.map((s) => `@${s.handle}`).join(', ')}</span>
          </p>
          <QuoteComposer brandProfileId={brand.id} targets={selected} campaignId={campaignId} />
        </div>
      )}
    </section>
  );
}
