import { useStore } from '@nanostores/react';
import { Chip } from '../../../components/ui/Chip';
import { NICHE_LABEL } from '../../../lib/labels';
import { activeDetail } from '../../../lib/state/active-detail';

/** "Tus nichos" en la navegación lateral: los del perfil activo (los carga el panel contextual). */
export default function SideNiches() {
  const detail = useStore(activeDetail);
  const d = detail?.declared;
  const niches = d ? (d.role === 'creator' ? d.niches : d.targetNiches) : [];
  if (niches.length === 0) return null;
  return (
    <section aria-labelledby="tus-nichos" className="side-niches">
      <p className="side-nav-title" id="tus-nichos">
        Tus nichos
      </p>
      <p className="small muted">Lo que eliges da contexto a tus conexiones.</p>
      <div className="chips">
        {niches.map((n) => (
          <Chip key={n} active>
            {NICHE_LABEL[n]}
          </Chip>
        ))}
      </div>
      <a className="small" href="/panel">
        Editar nichos
      </a>
    </section>
  );
}
