import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

/**
 * Configuración de los E2E. Las credenciales de Supabase local salen del entorno o de backend/.env
 * (se leen aquí y nunca se imprimen). Solo corre contra localhost: contra otro host se rechaza.
 */
const ENV_FILE = resolve(import.meta.dirname, '..', '..', '..', '..', 'backend', '.env');
const fromFile: Record<string, string | undefined> = existsSync(ENV_FILE)
  ? parseEnv(readFileSync(ENV_FILE, 'utf8'))
  : {};
const pick = (key: string): string | undefined => process.env[key] || fromFile[key] || undefined;
const need = (key: string): string => {
  const value = pick(key);
  if (!value) throw new Error(`Falta ${key} (entorno o backend/.env)`);
  return value;
};

export const SUPABASE_URL = need('SUPABASE_URL');
export const ANON_KEY = need('SUPABASE_ANON_KEY');
export const SERVICE_KEY = need('SUPABASE_SERVICE_ROLE_KEY');
export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3100';
export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:4421';
export const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? 'http://127.0.0.1:55524';

// Acepta "127.0.0.1", "localhost" y "[::1]"; rechaza "abcd.supabase.co".
// Probar: https://regex101.com/?regex=%5E(127%5C.0%5C.0%5C.1%7Clocalhost%7C%5C%5B%3A%3A1%5C%5D)%24&testString=127.0.0.1&flavor=javascript
const LOCAL_HOST = /^(127\.0\.0\.1|localhost|\[::1\])$/;
if (!LOCAL_HOST.test(new URL(SUPABASE_URL).hostname)) {
  throw new Error('Los E2E solo corren contra Supabase local');
}

/** Dominio de los usuarios de prueba: permite barrer restos de corridas anteriores. */
export const E2E_EMAIL_DOMAIN = 'e2e.sponcer.local';
/** Prefijo de los handles de prueba (ficticios, cumplen IG_HANDLE_REGEX). */
export const E2E_HANDLE_PREFIX = 'e2e.';
