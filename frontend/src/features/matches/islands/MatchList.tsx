import { useState } from 'react';
import type { Match } from '@sponcer/contracts';
import { Chip } from '../../../components/ui/Chip';
import { messageOf } from '../../../components/ui/errors';
import { Notice } from '../../../components/ui/Notice';
import { EmptyState } from '../../../components/ui/States';
import { NICHE_LABEL, formatDate } from '../../../lib/labels';
import { listMatches } from '../api/matches';

interface Props {
  /** Id del perfil propio: cada tarjeta muestra a la contraparte. */
  profileId: string;
  initial: Match[];
  nextCursor: string | null;
}

export default function MatchList({ profileId, initial, nextCursor }: Props) {
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function more() {
    if (!cursor) return;
    setLoading(true);
    try {
      const page = await listMatches(profileId, cursor);
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return (
      <EmptyState
        message="Aún no tienes matches."
        action={
          <a className="btn btn-secondary" href="/descubrir">
            Ir a Descubrir
          </a>
        }
      />
    );
  }

  return (
    <div className="stack">
      <div className="feed-grid">
        {items.map((m) => {
          const other = m.creator.id === profileId ? m.brand : m.creator;
          return (
            <article key={m.id} className="card stack" aria-labelledby={`m-${m.id}`}>
              <h3 id={`m-${m.id}`}>@{other.handle}</h3>
              <p className="muted small">
                {other.fullName} · match el {formatDate(m.createdAt)}
              </p>
              <p className="row">
                {other.niches.map((n) => (
                  <Chip key={n}>{NICHE_LABEL[n]}</Chip>
                ))}
              </p>
              <p className="row">
                <a className="btn" href={`/mensajes/${m.id}`}>
                  Abrir chat
                </a>
                <a className="btn btn-secondary" href={`/perfil/${other.handle}`}>
                  Ver perfil
                </a>
              </p>
            </article>
          );
        })}
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      {cursor && (
        <button type="button" className="btn btn-secondary" disabled={loading} onClick={more}>
          Cargar más
        </button>
      )}
    </div>
  );
}
