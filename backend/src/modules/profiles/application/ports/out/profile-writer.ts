import type { Profile } from '../../../domain/profile';

export interface ProfileWriter {
  /**
   * Crea o reemplaza el perfil (por id) sin pisar nunca una ficha `removed`: sobre una retirada solo es
   * posible mantenerla retirada. Devuelve `false` si no se escribió porque la ficha ya estaba retirada.
   * (Evita el lost update: una edición concurrente no puede revivir una ficha que el titular retiró.)
   */
  save(profile: Profile): Promise<boolean>;
}
