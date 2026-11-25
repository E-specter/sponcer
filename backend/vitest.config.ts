import { defineConfig } from 'vitest/config';

/**
 * Aislamiento de tests: `unit` en paralelo; `real-db` (Supabase local) secuencial; se saltan solos sin SUPABASE_URL.
 * Los tests contra Supabase local comparten una sola BD y algunos recorren toda la tabla (el backfill de
 * `compose.real.test.ts` clasifica TODOS los perfiles), así que no pueden correr en paralelo entre sí.
 * Los demás siguen en paralelo.
 */
const REAL = ['src/**/*.real*.test.ts', 'tests/**/*.supabase.test.ts'];
const REAL_TEST_TIMEOUT_MS = 30_000;
const REAL_HOOK_TIMEOUT_MS = 60_000;

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['src/**/*.test.ts', 'tests/**/*.test.ts'], exclude: REAL },
      },
      {
        extends: true,
        test: {
          name: 'real-db',
          include: REAL,
          fileParallelism: false,
          testTimeout: REAL_TEST_TIMEOUT_MS,
          hookTimeout: REAL_HOOK_TIMEOUT_MS,
        },
      },
    ],
  },
});
