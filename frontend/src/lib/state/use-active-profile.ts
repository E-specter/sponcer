import { useStore } from '@nanostores/react';
import type { ProfileSummary } from '@sponcer/contracts';
import { useEffect, useState } from 'react';
import { activeProfileId, resolveActive } from './active-profile';

/**
 * Perfil activo sin desajuste de hidratación: el servidor pinta el primer perfil, así que el primer
 * render del cliente también (`ready` = false). Tras montar se lee el guardado en localStorage.
 * Los efectos con datos deben esperar a `ready` para no pedir datos del perfil equivocado.
 */
export function useActiveProfile<T extends Pick<ProfileSummary, 'id'>>(profiles: T[]) {
  const stored = useStore(activeProfileId);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return { active: resolveActive(profiles, ready ? stored : null), ready };
}
