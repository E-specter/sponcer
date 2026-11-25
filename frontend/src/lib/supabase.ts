import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from 'astro:env/client';
import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import type { APIContext } from 'astro';

/**
 * Cliente de Supabase del lado servidor (solo auth; nunca escribe en la BD).
 * Cookies httpOnly + secure + sameSite=lax (la guía de Astro solo fija `path`, aquí se endurece).
 * Se usa solo con PUBLIC_AUTH_MODE=supabase.
 */
export function createSupabase(context: Pick<APIContext, 'request' | 'cookies' | 'url'>) {
  if (!PUBLIC_SUPABASE_URL || !PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error('Faltan PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY');
  }
  const secure = context.url.protocol === 'https:';
  return createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () =>
        parseCookieHeader(context.request.headers.get('Cookie') ?? '').map((c) => ({
          name: c.name,
          value: c.value ?? '',
        })),
      setAll: (cookies) =>
        cookies.forEach(({ name, value, options }) =>
          context.cookies.set(name, value, {
            ...options,
            path: '/',
            httpOnly: true,
            secure,
            sameSite: 'lax',
          }),
        ),
    },
  });
}
