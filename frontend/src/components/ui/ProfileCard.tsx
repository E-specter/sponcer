import { useState, type ReactNode } from 'react';
import { initialsOf } from './Avatar';
import { Tag } from './Tag';

const PORTRAIT_W = 76;
const PORTRAIT_H = 86;

interface ProfileCardProps {
  id: string;
  name: string;
  /** Ubicación o rol. */
  subtitle: string;
  imageUrl?: string | null;
  /** Etiqueta de procedencia, p. ej. "Instagram". */
  provenance: string;
  bio?: string | null;
  /** Procedencia de la bio, p. ej. "Bio compartida · Instagram · @handle"; solo se muestra con bio. */
  sourceLine?: string | null;
  niches?: ReactNode;
  /** Fila secundaria: tier · seguidores · engagement. */
  metrics?: { label: string; value: string }[];
  /** Motivo del match (violeta). */
  reason?: string;
  featured?: boolean;
  /** Retrato de persona: el recorte prioriza la cara (tercio superior). Falso para marcas (producto). */
  faceFocus?: boolean;
  actions?: ReactNode;
}

/**
 * Tarjeta de persona. El layout (compacto con retrato de 76×86 o de rejilla con imagen de 172 px)
 * lo decide el ancho del contenedor por container query (ver global.css).
 */
export function ProfileCard(p: ProfileCardProps) {
  const headingId = `card-${p.id}`;
  const [broken, setBroken] = useState(false);
  const photo = broken ? null : p.imageUrl;
  return (
    <div className="pcard-wrap">
      <article
        className={`pcard ${p.featured ? 'pcard-featured' : ''}`}
        aria-labelledby={headingId}
      >
        <div className="pcard-head">
          {photo ? (
            <div className={`pcard-media ${p.faceFocus ? 'pcard-media-face' : ''}`}>
              <img
                src={photo}
                alt={`Foto de ${p.name}`}
                width={PORTRAIT_W}
                height={PORTRAIT_H}
                loading="lazy"
                decoding="async"
                onError={() => setBroken(true)}
              />
            </div>
          ) : (
            <div className="pcard-media pcard-media-ph" aria-hidden="true">
              <span className="pcard-initials">{initialsOf(p.name)}</span>
            </div>
          )}
          <div>
            <h3 id={headingId} className="pcard-name">
              {p.name}
            </h3>
            <p className="pcard-sub">{p.subtitle}</p>
            <Tag tone="accion">{p.provenance}</Tag>
          </div>
        </div>
        {p.bio && <p className="pcard-bio">{p.bio}</p>}
        {p.bio && p.sourceLine && <p className="pcard-source">{p.sourceLine}</p>}
        {p.niches && <div className="row">{p.niches}</div>}
        {p.metrics && p.metrics.length > 0 && (
          <dl className="pcard-metrics">
            {p.metrics.map((m) => (
              <div key={m.label}>
                <dt>{m.label}:</dt>
                <dd>{m.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {p.reason && <p className="pcard-reason">{p.reason}</p>}
        {p.actions && <div className="pcard-actions">{p.actions}</div>}
      </article>
    </div>
  );
}
