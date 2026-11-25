import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { Notification, ProfileDetail, ProfileSummary } from '@sponcer/contracts';
import { Avatar } from '../../../components/ui/Avatar';
import { Notice } from '../../../components/ui/Notice';
import { Skeleton } from '../../../components/ui/States';
import { Tag } from '../../../components/ui/Tag';
import { callBff } from '../../../lib/api/bff';
import { listNotifications } from '../../notifications/api/notifications';
import { KIND_TEXT, hrefFor } from '../../notifications/notification-text';
import { NICHE_LABEL } from '../../../lib/labels';
import { activeDetail } from '../../../lib/state/active-detail';
import { useActiveProfile } from '../../../lib/state/use-active-profile';

const ICON_SIZE = 14;
const LATEST_NOTIFICATIONS = 3;

function declaredText(d: ProfileDetail['declared']): string {
  if (!d) return 'Aún no has completado tus datos.';
  const niches = (d.role === 'creator' ? d.niches : d.targetNiches)
    .map((n) => NICHE_LABEL[n])
    .join(', ');
  const city = d.role === 'creator' && d.city ? ` · ${d.city}` : '';
  return `Nichos: ${niches}${city}`;
}

/** Panel tinta: el perfil activo con la procedencia de cada dato, y "Tus fuentes, tu control". */
export default function ContextPanel({ profiles }: { profiles: ProfileSummary[] }) {
  const { active, ready } = useActiveProfile(profiles);
  const [news, setNews] = useState<Notification[]>([]);
  const [detail, setDetail] = useState<ProfileDetail | null>(null);
  const [failed, setFailed] = useState(false);

  const handle = ready ? active?.handle : undefined;
  useEffect(() => {
    if (!handle) return;
    let cancelled = false;
    setDetail(null);
    activeDetail.set(null);
    setFailed(false);
    (async () => {
      try {
        const d = await callBff('getProfile', { params: { handle } });
        if (cancelled) return;
        setDetail(d);
        activeDetail.set(d);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [handle]);

  useEffect(() => {
    (async () => {
      try {
        setNews((await listNotifications()).items.slice(0, LATEST_NOTIFICATIONS));
      } catch {
        setNews([]);
      }
    })();
  }, []);

  if (!active) {
    return (
      <Notice kind="info" title="Sin perfil activo">
        Reclama un perfil en Mi panel para ver aquí su contexto.
      </Notice>
    );
  }

  return (
    <>
      <section className="card card-ink" aria-label="Perfil activo">
        <div className="ink-head">
          <Avatar name={active.fullName ?? active.handle} size="lg" />
          <div>
            <h2>{active.fullName ?? `@${active.handle}`}</h2>
            <p className="muted">
              {active.role === 'brand' ? 'Marca' : 'Creador'} · @{active.handle}
            </p>
          </div>
        </div>
        {!detail && !failed && <Skeleton />}
        {failed && <p>No pudimos cargar los datos de este perfil.</p>}
        {detail && (
          <>
            <p className="ink-eyebrow">En Sponcer</p>
            <p>{declaredText(detail.declared)}</p>
            {detail.declared?.shortBio && <p className="muted">{detail.declared.shortBio}</p>}
            <p className="ink-eyebrow">Desde Instagram</p>
            <p>@{detail.handle}</p>
            {detail.ingested.biography && <p className="muted">«{detail.ingested.biography}»</p>}
            <p className="muted">
              Bio y enlace leídos de la cuenta pública; no se consultan datos privados.
            </p>
            <a className="ink-link" href={`/perfil/${detail.handle}`}>
              Ver perfil de origen{' '}
              <ExternalLink size={ICON_SIZE} strokeWidth={2} aria-hidden="true" />
            </a>
          </>
        )}
      </section>
      <section className="card" aria-labelledby="fuentes">
        <h2 id="fuentes">Tus fuentes, tu control</h2>
        <div className="source-row">
          <strong>Instagram</strong>
          <Tag tone={active.status === 'verified' ? 'exito' : 'neutral'}>
            {active.status === 'verified' ? 'Verificada' : 'Sin verificar'}
          </Tag>
        </div>
        <p className="small muted">
          Solo mostramos lo que ya es público en la cuenta. Puedes pedir la exclusión en cualquier
          momento.
        </p>
        <Notice kind="privacidad" title="Tu información no es un atajo.">
          No accedemos a contactos, mensajes ni datos privados.
        </Notice>
      </section>
      <section className="card" aria-labelledby="novedades">
        <h2 id="novedades">Novedades</h2>
        {news.length === 0 && <p className="small muted">No tienes novedades por ahora.</p>}
        <ul className="news">
          {news.map((n) => (
            <li key={n.id}>
              <span>{KIND_TEXT[n.kind]}</span>
              <a className="btn btn-secondary" href={hrefFor(n)}>
                {n.kind === 'message_received' ? 'Responder' : 'Abrir'}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
