import type { ProfileSummary } from '@sponcer/contracts';
import { setActiveProfile } from '../../../lib/state/active-profile';
import { useActiveProfile } from '../../../lib/state/use-active-profile';

interface Props {
  profiles: ProfileSummary[];
}

/** Selector de perfil activo; solo aparece si el usuario tiene más de uno. */
export default function ProfileSwitcher({ profiles }: Props) {
  const { active } = useActiveProfile(profiles);
  if (profiles.length <= 1) return null;
  return (
    <div className="row">
      <label htmlFor="perfil-activo" className="sr-only">
        Perfil activo
      </label>
      <select
        id="perfil-activo"
        value={active?.id}
        onChange={(e) => setActiveProfile(e.target.value)}
      >
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            @{p.handle} ({p.role === 'brand' ? 'marca' : 'creador'})
          </option>
        ))}
      </select>
    </div>
  );
}
