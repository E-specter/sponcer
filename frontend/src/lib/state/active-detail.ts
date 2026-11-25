import type { ProfileDetail } from '@sponcer/contracts';
import { atom } from 'nanostores';

/** Ficha del perfil activo, cargada por el panel contextual y leída por la navegación lateral. */
export const activeDetail = atom<ProfileDetail | null>(null);
