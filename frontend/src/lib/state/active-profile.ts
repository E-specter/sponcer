import type { ProfileSummary } from '@sponcer/contracts';
import { atom, onMount } from 'nanostores';

const STORAGE_KEY = 'sponcer.activeProfileId';

/** Perfil activo elegido por el usuario (compartido entre islas). Persistido en localStorage. */
export const activeProfileId = atom<string | null>(null);

// onMount corre con el primer suscriptor, ya en el navegador: así no hay desajuste de hidratación.
onMount(activeProfileId, () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) activeProfileId.set(saved);
  } catch {
    // localStorage no disponible (modo privado, política del navegador): se usa el primero.
  }
});

export function setActiveProfile(id: string): void {
  activeProfileId.set(id);
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Sin persistencia: la selección vale solo para esta pestaña.
  }
}

/** El perfil activo, o el primero si lo guardado ya no existe. */
export const resolveActive = <T extends Pick<ProfileSummary, 'id'>>(
  profiles: T[],
  id: string | null,
): T | undefined => profiles.find((p) => p.id === id) ?? profiles[0];
