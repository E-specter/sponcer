import { defineConfig, devices } from '@playwright/test';

// Verificación visual en MODO MOCK: sin backend ni Supabase (fixtures de contracts/fixtures y sesión demo).
const PORT = 4521;
const BASE_URL = process.env.VISUAL_BASE_URL ?? `http://localhost:${PORT}`;
const TEST_TIMEOUT_MS = 60_000;
const EXPECT_TIMEOUT_MS = 15_000;
const SERVER_START_MS = 120_000;

/**
 * Captura las pantallas clave a 1440 y 414 px en `test-results/visual/` para compararlas a ojo con Figma
 * (docs/03-diseno/referencias/). Ver `tests/visual/README.md`.
 */
export default defineConfig({
  testDir: 'tests/visual',
  // Carpeta de artefactos de Playwright distinta de las capturas (`test-results/visual/`).
  outputDir: 'test-results/visual-run',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: TEST_TIMEOUT_MS,
  expect: { timeout: EXPECT_TIMEOUT_MS },
  reporter: [['list']],
  use: { baseURL: BASE_URL, locale: 'es-PE' },
  projects: [{ name: 'visual', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx astro dev --port ${PORT}`,
    url: `${BASE_URL}/login`,
    reuseExistingServer: true,
    timeout: SERVER_START_MS,
    env: { PUBLIC_API_MODE: 'mock', PUBLIC_AUTH_MODE: 'mock' },
  },
});
