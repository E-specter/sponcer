import { PUBLIC_AUTH_MODE } from 'astro:env/client';
import { defineMiddleware } from 'astro:middleware';
import { demoUser } from '@sponcer/contracts/fixtures';
import { ApiError } from './lib/api/errors';
import { createSupabase } from './lib/supabase';

/** Rutas que exigen sesión; las demás (landing, login, legales, exclusión) son públicas. */
const PROTECTED_PREFIXES = ['/descubrir', '/perfil', '/panel', '/mensajes', '/admin'];
const BFF_PREFIX = '/bff/';
/** Rutas con datos de perfiles: nunca indexables (RF-01, RNF-05). */
const NOINDEX_PREFIXES = [...PROTECTED_PREFIXES, '/exclusion'];
const NOINDEX_VALUE = 'noindex, nofollow';

const isProtected = (pathname: string): boolean =>
  PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

type Session = App.Locals;
const ANONYMOUS: Session = { user: null, accessToken: null };

async function resolveSession(
  context: Parameters<Parameters<typeof defineMiddleware>[0]>[0],
): Promise<Session> {
  if (PUBLIC_AUTH_MODE === 'mock') {
    // Modo mock: siempre hay sesión demo; el token es `mock:<userId>`.
    return {
      user: { id: demoUser.id, email: demoUser.email },
      accessToken: `mock:${demoUser.id}`,
    };
  }
  const { pathname } = context.url;
  if (!isProtected(pathname) && !pathname.startsWith(BFF_PREFIX)) return ANONYMOUS;
  // `getUser` valida el JWT contra Supabase y refresca las cookies; `getSession` solo aporta el token ya validado.
  const supabase = createSupabase(context);
  const { data: userData } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();
  if (!userData.user?.email || !sessionData.session) return ANONYMOUS;
  return {
    user: { id: userData.user.id, email: userData.user.email },
    accessToken: sessionData.session.access_token,
  };
}

export const onRequest = defineMiddleware(async (context, next) => {
  const session = await resolveSession(context);
  Object.assign(context.locals, session);
  if (!session.user && isProtected(context.url.pathname)) return context.redirect('/login');
  try {
    const response = await next();
    if (
      NOINDEX_PREFIXES.some(
        (p) => context.url.pathname === p || context.url.pathname.startsWith(`${p}/`),
      )
    ) {
      response.headers.set('X-Robots-Tag', NOINDEX_VALUE);
    }
    return response;
  } catch (e) {
    // Token caducado o rechazado por la API en SSR: cerrar la sesión local y volver a /login.
    if (!(e instanceof ApiError) || e.code !== 'UNAUTHORIZED') throw e;
    if (PUBLIC_AUTH_MODE === 'supabase')
      await createSupabase(context).auth.signOut({ scope: 'local' });
    return context.redirect('/login?expired=1');
  }
});
