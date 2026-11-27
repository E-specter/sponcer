import { createServerClient } from '@supabase/ssr';
import type { BrowserContext } from '@playwright/test';
import { apiAs } from './api';
import { ANON_KEY, BASE_URL, SUPABASE_URL } from './env';
import { admin, type E2EUser } from './world';

const MS_PER_SECOND = 1000;

interface CookieSpec {
  name: string;
  value: string;
  maxAge?: number;
}

export interface Session {
  cookies: CookieSpec[];
  accessToken: string;
  userId: string;
}

const cache = new Map<string, Session>();

/**
 * Sesión REAL de Supabase sin pasar por el correo: el admin genera el enlace mágico y se canjea su
 * `token_hash` con el mismo cliente SSR que usa el frontend, que produce las cookies exactas de la app.
 * (El camino por el correo se prueba aparte, en E2E-01.) Se cachea: los canjes tienen límite de tasa.
 */
export async function sessionFor(user: E2EUser): Promise<Session> {
  const hit = cache.get(`${user.email}:${user.id}`);
  if (hit) return hit;
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: user.email });
  if (link.error) throw new Error(`generateLink: ${link.error.message}`);
  const jar: CookieSpec[] = [];
  const ssr = createServerClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll: () => [],
      setAll: (cookies) => {
        jar.push(
          ...cookies.map(({ name, value, options }) => ({ name, value, maxAge: options.maxAge })),
        );
      },
    },
  });
  const res = await ssr.auth.verifyOtp({
    token_hash: link.data.properties.hashed_token,
    type: 'magiclink',
  });
  if (res.error || !res.data.session) throw new Error(`verifyOtp: ${res.error?.message}`);
  const session = { cookies: jar, accessToken: res.data.session.access_token, userId: user.id };
  cache.set(`${user.email}:${user.id}`, session);
  return session;
}

/**
 * Deja el contexto del navegador con la sesión del usuario (cookies httpOnly como las del enlace mágico).
 * ADR-009: sin registro toda ruta protegida lleva a /registro, así que por defecto el usuario queda registrado
 * (Influencer para 'creator', Empresa para 'brand'; no repite si ya tiene tipo). `null` = dejarlo sin registrar.
 */
export async function loginAs(
  context: BrowserContext,
  user: E2EUser,
  register: 'creator' | 'brand' | null = 'creator',
): Promise<Session> {
  const session = await sessionFor(user);
  if (register) await apiAs(session.accessToken).ensureRegistered(register);
  await context.addCookies(
    session.cookies.map((c) => ({
      name: c.name,
      value: c.value,
      // `url` crea cookies host-only, como las de la app: así el logout del servidor también las borra en Firefox/WebKit.
      url: BASE_URL,
      httpOnly: true,
      sameSite: 'Lax' as const,
      expires: Math.floor(Date.now() / MS_PER_SECOND) + (c.maxAge ?? 0),
    })),
  );
  return session;
}
