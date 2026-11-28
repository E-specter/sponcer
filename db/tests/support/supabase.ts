import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Soporte de los tests contra Supabase LOCAL (RLS y adaptadores reales). Una sola fuente para db/ y backend/.
 * Las credenciales salen del entorno o de backend/.env (se leen aquí, nunca se imprimen).
 * Seguridad: solo corre contra localhost; contra cualquier otro host los tests se saltan.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = resolve(HERE, '..', '..', '..', 'backend', '.env');
const fromFile: Record<string, string | undefined> = existsSync(ENV_FILE)
  ? parseEnv(readFileSync(ENV_FILE, 'utf8'))
  : {};
const pick = (key: string): string | undefined => process.env[key] || fromFile[key] || undefined;

export const SUPABASE_URL = pick('SUPABASE_URL');
const SERVICE_KEY = pick('SUPABASE_SERVICE_ROLE_KEY');
const ANON_KEY = pick('SUPABASE_ANON_KEY');
// Host local: evita escribir datos de prueba en un proyecto real.
// Acepta "127.0.0.1" y "localhost"; rechaza "abcd.supabase.co".
// Probar: https://regex101.com/?regex=%5E(127%5C.0%5C.0%5C.1%7Clocalhost%7C%5C%5B%3A%3A1%5C%5D)%24&testString=127.0.0.1&flavor=javascript
const LOCAL_HOST = /^(127\.0\.0\.1|localhost|\[::1\])$/;
const hostOf = (url: string | undefined): string => (url ? new URL(url).hostname : '');

export const hasSupabase = Boolean(
  SUPABASE_URL && SERVICE_KEY && ANON_KEY && LOCAL_HOST.test(hostOf(SUPABASE_URL)),
);

const AUTH_OPTS = { auth: { persistSession: false, autoRefreshToken: false } } as const;
/**
 * Cliente PEREZOSO: `describe.skipIf(...)` ejecuta igualmente el cuerpo del describe, así que un cliente creado ahí
 * lanzaría "supabaseUrl is required" al cargar el archivo sin Supabase. El cliente real se crea al primer uso
 * (dentro de beforeAll o de un test, que sí se saltan).
 */
const lazy = (make: () => SupabaseClient): SupabaseClient => {
  let client: SupabaseClient | undefined;
  return new Proxy({} as SupabaseClient, {
    get(_target, prop) {
      if (prop === 'then') return undefined; // que `await`/return de un async no la trate como thenable
      client ??= make();
      const value = Reflect.get(client, prop) as unknown;
      return typeof value === 'function' ? value.bind(client) : value;
    },
  });
};
export const serviceClient = (): SupabaseClient =>
  lazy(() => createClient(SUPABASE_URL!, SERVICE_KEY!, AUTH_OPTS));
export const anonClient = (): SupabaseClient =>
  lazy(() => createClient(SUPABASE_URL!, ANON_KEY!, AUTH_OPTS));

/** Cliente con el JWT del usuario (rol `authenticated`, sujeto a RLS). */
export const clientWithJwt = (jwt: string): SupabaseClient =>
  createClient(SUPABASE_URL!, ANON_KEY!, {
    ...AUTH_OPTS,
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

/** Variables de Supabase para construir un `Env` del backend en tests (nunca se imprimen). */
export const supabaseEnv = (): Record<string, string> => ({
  SUPABASE_URL: SUPABASE_URL ?? '',
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY ?? '',
  SUPABASE_ANON_KEY: ANON_KEY ?? '',
});

export const SERVICE_AUTH_HEADER = {
  apikey: SERVICE_KEY ?? '',
  Authorization: `Bearer ${SERVICE_KEY ?? ''}`,
};

const SHORT = 8;
export const uniqueTag = (): string => randomUUID().replaceAll('-', '').slice(0, SHORT);
export const TEST_EMAIL_DOMAIN = 'audit.test';
export const TEST_HANDLE_PREFIX = 'zz.';
const TEST_PASSWORD = 'Audit-test-Passw0rd!';
const SERVICE_PRICE = 100;
/** Tablas con `ig_handle` sin FK a profiles: se limpian por handle rastreado. */
const HANDLE_TABLES = ['profile_removal_requests', 'ig_snapshots', 'ingestion_blocklist'];
const USERS_PAGE_SIZE = 1000;
const STALE_MS = 600_000;

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

/** Crea y rastrea datos temporales; `cleanup()` los borra (también los restos de corridas anteriores). */
export function createWorld(sb: SupabaseClient) {
  const userIds: string[] = [];
  const profileIds: string[] = [];
  const handles: string[] = [];

  const must = <T>(res: { data: T | null; error: { message: string } | null }, what: string): T => {
    if (res.error || res.data === null)
      throw new Error(`${what}: ${res.error?.message ?? 'sin datos'}`);
    return res.data;
  };

  const world = {
    async newUser(): Promise<TestUser> {
      const email = `${uniqueTag()}@${TEST_EMAIL_DOMAIN}`;
      const res = await sb.auth.admin.createUser({
        email,
        password: TEST_PASSWORD,
        email_confirm: true,
      });
      if (res.error || !res.data.user) throw new Error(`createUser: ${res.error?.message}`);
      const user = res.data.user;
      userIds.push(user.id);
      return { id: user.id, email, password: TEST_PASSWORD };
    },
    async signIn(user: TestUser): Promise<string> {
      const res = await anonClient().auth.signInWithPassword({
        email: user.email,
        password: user.password,
      });
      if (res.error || !res.data.session) throw new Error(`signIn: ${res.error?.message}`);
      return res.data.session.access_token;
    },
    async newProfile(role: 'creator' | 'brand', ownerId: string | null = null) {
      const handle = `${TEST_HANDLE_PREFIX}${uniqueTag()}`;
      const status = ownerId ? 'verified' : 'unclaimed';
      const row = must(
        await sb
          .from('profiles')
          .insert({ ig_handle: handle, role, status, owner_user_id: ownerId })
          .select('id')
          .single<{ id: string }>(),
        'insert profile',
      );
      profileIds.push(row.id);
      return { id: row.id, handle };
    },
    async newService(profileId: string) {
      const row = must(
        await sb
          .from('creator_services')
          .insert({
            profile_id: profileId,
            type: 'canje',
            format: 'reel',
            price_pen: SERVICE_PRICE,
            description: 'servicio de prueba',
          })
          .select('id')
          .single<{ id: string }>(),
        'insert service',
      );
      return row.id;
    },
    /** Campaña activa de una marca (las cotizaciones siempre cuelgan de una campaña, ADR-009). */
    async newCampaign(brandProfileId: string) {
      const row = must(
        await sb
          .from('campaigns')
          .insert({
            brand_profile_id: brandProfileId,
            name: 'Campaña de prueba',
            kind: 'general',
            starts_on: '2026-11-01',
            status: 'active',
          })
          .select('id')
          .single<{ id: string }>(),
        'insert campaign',
      );
      return row.id;
    },
    async newMatch(creatorProfileId: string, brandProfileId: string) {
      const row = must(
        await sb
          .from('matches')
          .insert({ creator_profile_id: creatorProfileId, brand_profile_id: brandProfileId })
          .select('id')
          .single<{ id: string }>(),
        'insert match',
      );
      return row.id;
    },
    /** Un handle de prueba rastreado (para pedidos de exclusión, que no tienen FK a profiles). */
    newHandle(): string {
      const handle = `${TEST_HANDLE_PREFIX}${uniqueTag()}`;
      handles.push(handle);
      return handle;
    },
    /** Rastrea un handle ya creado para limpiar sus filas sin FK (snapshots, bloqueo, pedidos). */
    trackHandle(handle: string): void {
      handles.push(handle);
    },
    /**
     * Borra lo creado por este mundo y los restos de corridas anteriores. Solo barre lo que tiene más de
     * STALE_MS: otros archivos de test corren en paralelo y no deben borrarse los datos entre sí.
     */
    async cleanup(): Promise<void> {
      const cutoff = new Date(Date.now() - STALE_MS).toISOString();
      const stale = await sb
        .from('profiles')
        .select('id')
        .like('ig_handle', `${TEST_HANDLE_PREFIX}%`)
        .lt('created_at', cutoff);
      const ids = [
        ...new Set([...profileIds, ...(stale.data ?? []).map((p: { id: string }) => p.id)]),
      ];
      if (ids.length) {
        // quotes.service_id es RESTRICT: se borran antes que los servicios (cascada del perfil).
        await sb.from('quotes').delete().in('creator_profile_id', ids);
        await sb.from('profiles').delete().in('id', ids);
      }
      await Promise.all(
        handles.flatMap((h) =>
          HANDLE_TABLES.map((table) => sb.from(table).delete().like('ig_handle', `${h}%`)),
        ),
      );
      const users = await sb.auth.admin.listUsers({ perPage: USERS_PAGE_SIZE });
      const old = users.data.users
        .filter((u) => u.email?.endsWith(`@${TEST_EMAIL_DOMAIN}`) && u.created_at < cutoff)
        .map((u) => u.id);
      await Promise.all(
        [...new Set([...userIds, ...old])].map((id) => sb.auth.admin.deleteUser(id)),
      );
    },
  };
  return world;
}
export type World = ReturnType<typeof createWorld>;
