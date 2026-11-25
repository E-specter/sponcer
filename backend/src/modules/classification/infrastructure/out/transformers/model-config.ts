import { fileURLToPath } from 'node:url';

export const MODEL = 'Xenova/multilingual-e5-small';
/** Revisión fija del modelo (cadena de suministro / reproducibilidad, RNF-06). */
export const MODEL_REVISION = '761b726dd34fb83930e26aab4e9ac3899aa1fa78';

/** `<backend>/.cache/models`, resuelto relativo a este archivo (no al cwd) y fuera de node_modules (`npm ci` la borraría). */
const DEFAULT_CACHE_DIR = fileURLToPath(
  new URL('../../../../../../.cache/models', import.meta.url),
);

/** `MODEL_CACHE_DIR` sobrescribe la ubicación (p. ej. un volumen persistente en el despliegue). */
export const modelCacheDir = (): string => process.env.MODEL_CACHE_DIR || DEFAULT_CACHE_DIR;
