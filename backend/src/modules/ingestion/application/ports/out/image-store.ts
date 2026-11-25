/** Almacén de fotos de perfil: las URLs de Instagram caducan, así que se copian a un almacén propio. */
export interface ImageStore {
  /** Copia la imagen y devuelve la URL a guardar en el snapshot; `null` si no se pudo (nunca lanza). */
  store(handle: string, sourceUrl: string | null): Promise<string | null>;
  /** Borra todas las imágenes del handle (exclusión del titular, Ley 29733). */
  deleteAll(handle: string): Promise<void>;
}
