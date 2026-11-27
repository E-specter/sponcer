import type { AccountKind, ProfileSummary } from '@sponcer/contracts';
import { setActiveProfile } from '../../../lib/state/active-profile';
import { useActiveProfile } from '../../../lib/state/use-active-profile';

interface Props {
  profiles: ProfileSummary[];
  accountKind: AccountKind | null;
  /** Nombre de la Empresa o del Influencer. */
  ownerName: string;
}

/** Selector de perfil activo ("Marcas de <empresa>"); solo aparece si hay más de uno. */
export default function ProfileSwitcher({ profiles, accountKind, ownerName }: Props) {
  const { active } = useActiveProfile(profiles);
  if (profiles.length <= 1) return null;
  const group = accountKind === 'company' ? `Marcas de ${ownerName}` : `Cuentas de ${ownerName}`;
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
        <optgroup label={group}>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              @{p.handle}
            </option>
          ))}
        </optgroup>
      </select>
    </div>
  );
}
