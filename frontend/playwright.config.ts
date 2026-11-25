import { defineConfig, devices } from '@playwright/test';

// Origen del frontend bajo prueba (4421 para no chocar con el 4321 de desarrollo).
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:4421';
const TEST_TIMEOUT_MS = 90_000;
const EXPECT_TIMEOUT_MS = 15_000;

/**
 * E2E contra el stack REAL local (Supabase + backend ADAPTER_* real + frontend en modo supabase).
 * Un solo worker: todos comparten la misma BD y cada spec crea y limpia sus propios datos.
 * El stack se levanta a mano (ver docs/07-pruebas/reportes/2026-11-25-f4-e2e.md); no hay webServer.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: TEST_TIMEOUT_MS,
  expect: { timeout: EXPECT_TIMEOUT_MS },
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    locale: 'es-PE',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
