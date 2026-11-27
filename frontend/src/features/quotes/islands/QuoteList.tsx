import { useState } from 'react';
import {
  MAX_QUOTE_NOTE,
  QUOTE_TRANSITIONS,
  QUOTE_TRANSITION_ACTOR,
  type ProfileSummary,
  type Quote,
  type QuoteStatus,
} from '@sponcer/contracts';
import { Alert } from '../../../components/ui/Alert';
import { messageOf } from '../../../components/ui/errors';
import {
  SERVICE_FORMAT_LABEL,
  SERVICE_TYPE_LABEL,
  QUOTE_ACTION_LABEL,
  QUOTE_STATUS_LABEL,
  formatDate,
  formatPen,
} from '../../../lib/labels';
import { listQuotes, transitionQuote } from '../api/quotes';

interface Props {
  profile: ProfileSummary;
  quotes: Quote[];
  nextCursor: string | null;
  /** Campaña fija (detalle de campaña) o preseleccionada en el filtro. */
  campaignId?: string;
  /** Sin filtro de campaña (el detalle de campaña ya está filtrado). */
  hideFilter?: boolean;
}

/** Transiciones válidas desde `status` para quien actúa como `role` (QUOTE_TRANSITIONS + QUOTE_TRANSITION_ACTOR). */
export const allowedTransitions = (
  status: QuoteStatus,
  role: 'requester' | 'creator',
): QuoteStatus[] =>
  QUOTE_TRANSITIONS[status].filter((to) => {
    const actor = QUOTE_TRANSITION_ACTOR[to];
    return actor === 'any' || actor === role;
  });

export default function QuoteList({
  profile,
  quotes: initial,
  nextCursor,
  campaignId = '',
  hideFilter = false,
}: Props) {
  const [filter, setFilter] = useState(campaignId);
  // Campañas conocidas por las cotizaciones recibidas al cargar (suficiente para filtrar).
  const [campaigns] = useState(() => [
    ...new Map(initial.map((q) => [q.campaign.id, q.campaign.name])),
  ]);
  const [quotes, setQuotes] = useState(initial);
  const [cursor, setCursor] = useState(nextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function more() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await listQuotes(profile.id, cursor, filter);
      setQuotes((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setLoadingMore(false);
    }
  }

  async function applyFilter(id: string) {
    setFilter(id);
    setError(null);
    try {
      const page = await listQuotes(profile.id, undefined, id);
      setQuotes(page.items);
      setCursor(page.nextCursor);
    } catch (e) {
      setError(messageOf(e));
    }
  }

  async function move(q: Quote, to: QuoteStatus) {
    setBusy(q.id);
    setError(null);
    try {
      const amount = amounts[q.id];
      const updated = await transitionQuote(q.id, {
        actorProfileId: profile.id,
        to,
        note: notes[q.id]?.trim() || undefined,
        amountPen: amount ? Number(amount) : undefined,
      });
      setQuotes((prev) => prev.map((x) => (x.id === q.id ? updated : x)));
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(null);
    }
  }

  const filterField = !hideFilter && campaigns.length > 1 && (
    <div className="field">
      <label htmlFor={`qf-${profile.id}`}>Filtrar por campaña</label>
      <select id={`qf-${profile.id}`} value={filter} onChange={(e) => applyFilter(e.target.value)}>
        <option value="">Todas las campañas</option>
        {campaigns.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </div>
  );

  if (quotes.length === 0)
    return (
      <div className="stack">
        {filterField}
        <p className="muted">Sin cotizaciones para este perfil.</p>
      </div>
    );

  return (
    <div className="stack">
      {filterField}
      <div aria-live="polite">{error && <Alert kind="error">{error}</Alert>}</div>
      {quotes.map((q) => {
        const role = q.requesterProfileId === profile.id ? 'requester' : 'creator';
        const other = `@${(role === 'requester' ? q.creator : q.requester).handle}`;
        const options = allowedTransitions(q.status, role);
        return (
          <article key={q.id} className="card stack" aria-labelledby={`q-${q.id}`}>
            <h3 id={`q-${q.id}`}>
              {role === 'requester' ? 'Solicitaste a' : 'Solicitud de'} {other}
            </h3>
            <p className="row">
              <span className="badge">{QUOTE_STATUS_LABEL[q.status]}</span>
              {q.amountPen !== null && <span>{formatPen(q.amountPen)}</span>}
              <span className="muted small">Actualizada {formatDate(q.updatedAt)}</span>
            </p>
            <p className="small muted">
              Campaña: {q.campaign.name} ·{' '}
              {q.service
                ? `Servicio: ${SERVICE_TYPE_LABEL[q.service.type]} · ${SERVICE_FORMAT_LABEL[q.service.format]} · ${formatPen(q.service.pricePen)}`
                : 'Propuesta abierta'}
            </p>
            <p>{q.message}</p>
            <details>
              <summary>Historial</summary>
              <ol className="small">
                {q.history.map((h) => (
                  <li key={`${h.to}-${h.at}`}>
                    {QUOTE_STATUS_LABEL[h.to]} · {formatDate(h.at)}
                    {h.note ? ` · ${h.note}` : ''}
                  </li>
                ))}
              </ol>
            </details>
            {options.length > 0 && (
              <div className="row">
                <label className="small" htmlFor={`n-${q.id}`}>
                  Nota (opcional)
                </label>
                <input
                  id={`n-${q.id}`}
                  maxLength={MAX_QUOTE_NOTE}
                  value={notes[q.id] ?? ''}
                  onChange={(e) => setNotes((p) => ({ ...p, [q.id]: e.target.value }))}
                />
                <label className="small" htmlFor={`a-${q.id}`}>
                  Monto S/ (opcional)
                </label>
                <input
                  id={`a-${q.id}`}
                  type="number"
                  min={0}
                  value={amounts[q.id] ?? ''}
                  onChange={(e) => setAmounts((p) => ({ ...p, [q.id]: e.target.value }))}
                />
              </div>
            )}
            <div className="row">
              {options.map((to) => (
                <button
                  key={to}
                  type="button"
                  className={to === 'cancelled' || to === 'rejected' ? 'btn btn-danger' : 'btn'}
                  disabled={busy === q.id}
                  onClick={() => move(q, to)}
                >
                  {QUOTE_ACTION_LABEL[to]}
                </button>
              ))}
              {options.length === 0 && (
                <span className="muted small">Sin acciones disponibles.</span>
              )}
            </div>
          </article>
        );
      })}
      {cursor && (
        <button type="button" className="btn btn-secondary" disabled={loadingMore} onClick={more}>
          Cargar más
        </button>
      )}
    </div>
  );
}
