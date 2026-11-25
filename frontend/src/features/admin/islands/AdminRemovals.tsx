import { useEffect, useState } from 'react';
import { RemovalStatus, type RemovalRequestItem } from '@sponcer/contracts';
import { messageOf } from '../../../components/ui/errors';
import { Field } from '../../../components/ui/Field';
import { Notice } from '../../../components/ui/Notice';
import { EmptyState, ErrorState, Skeleton } from '../../../components/ui/States';
import { Tag, type TagTone } from '../../../components/ui/Tag';
import { formatDate } from '../../../lib/labels';
import { listRemovals, reviewRemoval } from '../api/admin';

const STATUS_LABEL: Record<RemovalStatus, string> = {
  pending: 'Pendiente',
  applied: 'Aplicada',
  rejected: 'Rechazada',
};
const STATUS_TONE: Record<RemovalStatus, TagTone> = {
  pending: 'accion',
  applied: 'error',
  rejected: 'neutral',
};
const MAX_NOTE = 500;

type Decision = 'apply' | 'reject';

export default function AdminRemovals() {
  const [filter, setFilter] = useState<RemovalStatus | ''>('pending');
  const [items, setItems] = useState<RemovalRequestItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);
  // Pedido pendiente de confirmar: la exclusión borra datos, así que exige confirmación explícita.
  const [reviewing, setReviewing] = useState<{ id: string; decision: Decision } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const page = await listRemovals(filter || undefined);
        if (cancelled) return;
        setItems(page.items);
        setCursor(page.nextCursor);
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
  }, [filter, reloads]);

  async function more() {
    if (!cursor) return;
    try {
      const page = await listRemovals(filter || undefined, cursor);
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } catch (e) {
      setError(messageOf(e));
    }
  }

  async function confirm() {
    if (!reviewing) return;
    setBusy(true);
    try {
      const updated = await reviewRemoval(reviewing.id, {
        decision: reviewing.decision,
        note: note.trim() || undefined,
      });
      setItems((prev) =>
        filter && filter !== updated.status
          ? prev.filter((i) => i.id !== updated.id)
          : prev.map((i) => (i.id === updated.id ? updated : i)),
      );
      setDone(
        reviewing.decision === 'apply'
          ? `Exclusión aplicada para @${updated.igHandle}.`
          : `Pedido de @${updated.igHandle} rechazado.`,
      );
      setReviewing(null);
      setNote('');
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="stack" aria-label="Pedidos de exclusión">
      <Field id="removal-status" label="Estado">
        <select
          id="removal-status"
          value={filter}
          onChange={(e) => setFilter(RemovalStatus.options.find((s) => s === e.target.value) ?? '')}
        >
          <option value="">Todos</option>
          {RemovalStatus.options.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </Field>
      <div aria-live="polite">{done && <Notice kind="success">{done}</Notice>}</div>
      {error && <ErrorState message={error} onRetry={() => setReloads((n) => n + 1)} note="No se cambió nada." />}
      {loading && <Skeleton />}
      {!loading && !error && items.length === 0 && <EmptyState message="No hay pedidos con este estado." />}
      {items.map((r) => (
        <article key={r.id} className="card stack" aria-labelledby={`r-${r.id}`}>
          <h3 id={`r-${r.id}`}>@{r.igHandle}</h3>
          <p className="row">
            <Tag tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Tag>
            <span className="muted small">Recibido el {formatDate(r.createdAt)}</span>
          </p>
          <dl className="pcard-metrics">
            <div>
              <dt>Correo:</dt>
              <dd>{r.email}</dd>
            </div>
            <div>
              <dt>Ficha afectada:</dt>
              <dd>
                {r.profile ? (
                  <a href={`/perfil/${r.profile.handle}`}>{r.profile.fullName || `@${r.profile.handle}`}</a>
                ) : (
                  'No existe (nunca se ingirió)'
                )}
              </dd>
            </div>
          </dl>
          <p>{r.reason ?? 'Sin motivo indicado.'}</p>
          {r.reviewedAt && (
            <p className="small muted">
              Revisado el {formatDate(r.reviewedAt)}
              {r.reviewNote ? `: ${r.reviewNote}` : ''}
            </p>
          )}
          {r.status === 'pending' && reviewing?.id !== r.id && (
            <div className="row">
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => setReviewing({ id: r.id, decision: 'apply' })}
              >
                Aplicar exclusión
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setReviewing({ id: r.id, decision: 'reject' })}
              >
                Rechazar
              </button>
            </div>
          )}
          {reviewing?.id === r.id && (
            <div className="stack" role="group" aria-label="Confirmar decisión">
              {reviewing.decision === 'apply' ? (
                <Notice kind="error" title="Esto no se puede deshacer">
                  Se borrarán los datos de @{r.igHandle} (snapshots, clasificación, embedding y fotos) y se
                  bloqueará el handle para que no vuelva a ingerirse.
                </Notice>
              ) : (
                <Notice kind="info">La ficha se mantiene y el pedido queda como rechazado.</Notice>
              )}
              <Field id={`note-${r.id}`} label="Nota (opcional)">
                <textarea
                  id={`note-${r.id}`}
                  value={note}
                  maxLength={MAX_NOTE}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Field>
              <div className="row">
                <button
                  type="button"
                  className={reviewing.decision === 'apply' ? 'btn btn-danger' : 'btn'}
                  disabled={busy}
                  onClick={confirm}
                >
                  {reviewing.decision === 'apply' ? 'Sí, aplicar exclusión' : 'Confirmar rechazo'}
                </button>
                <button type="button" className="btn btn-text" disabled={busy} onClick={() => setReviewing(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </article>
      ))}
      {cursor && (
        <button type="button" className="btn btn-secondary" onClick={more}>
          Cargar más
        </button>
      )}
    </section>
  );
}
