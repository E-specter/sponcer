import type { ProfileSummary, Service } from '@sponcer/contracts';
import { SERVICE_FORMAT_LABEL, SERVICE_TYPE_LABEL, formatPen } from '../../../lib/labels';
import { useActiveProfile } from '../../../lib/state/use-active-profile';
import QuoteDialog from '../../campaigns/islands/QuoteDialog';

interface Props {
  services: Service[];
  /** Perfiles del usuario: "Cotizar" solo aparece si el perfil activo es una marca. */
  myProfiles: ProfileSummary[];
  /** Influencer cuya ficha se ve. */
  target: ProfileSummary;
  isOwner: boolean;
}

/** Catálogo de servicios; las marcas cotizan sin match, con un servicio o como propuesta abierta (ADR-009). */
export default function ServiceCatalog({ services, myProfiles, target, isOwner }: Props) {
  const { active } = useActiveProfile(myProfiles);
  const brandId =
    active?.role === 'brand' && target.role === 'creator' && !isOwner ? active.id : null;

  return (
    <div className="stack">
      {brandId && (
        <div className="row">
          <QuoteDialog
            brandProfileId={brandId}
            target={target}
            label="Cotizar (propuesta abierta)"
            variant="btn"
          />
          <span className="muted small">
            Sin match previo: eliges una campaña activa o creas una.
          </span>
        </div>
      )}
      {services.length === 0 && <p className="muted">Este influencer aún no publica servicios.</p>}
      <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
        {services.map((s) => (
          <li key={s.id} className="card">
            <h3>
              {SERVICE_TYPE_LABEL[s.type]} · {SERVICE_FORMAT_LABEL[s.format]} ·{' '}
              {formatPen(s.pricePen)}
            </h3>
            <p>{s.description}</p>
            {brandId && (
              <QuoteDialog
                brandProfileId={brandId}
                target={target}
                serviceId={s.id}
                label="Cotizar este servicio"
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
