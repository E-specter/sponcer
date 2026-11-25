// Precalienta el modelo e5 en MODEL_CACHE_DIR. Uso: npm run model:prefetch -w backend
// Sale con código 1 si tras los reintentos no se pudo descargar/cargar.
import { modelCacheDir } from '../infrastructure/out/transformers/model-config';
import { loadExtractor } from '../infrastructure/out/transformers/transformers-embedding-provider';

const MAX_ATTEMPTS = 3;
const ATTEMPT_TIMEOUT_MS = 600_000;
const RETRY_DELAY_MS = 5_000;
const FAILURE_EXIT_CODE = 1;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const withTimeout = <T>(work: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    work,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout de ${ms} ms`)), ms).unref(),
    ),
  ]);

async function attempt(n: number): Promise<void> {
  try {
    const extractor = await withTimeout(loadExtractor(), ATTEMPT_TIMEOUT_MS);
    await extractor(['query: prueba'], { pooling: 'mean', normalize: true });
    console.log(`modelo listo en ${modelCacheDir()}`);
  } catch (e) {
    console.error(`intento ${n}/${MAX_ATTEMPTS} falló: ${String(e)}`);
    if (n >= MAX_ATTEMPTS) process.exit(FAILURE_EXIT_CODE);
    await sleep(RETRY_DELAY_MS);
    await attempt(n + 1);
  }
}

await attempt(1);
process.exit(0);
