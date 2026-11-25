import type { APIRoute } from 'astro';

export const prerender = false;

/**
 * Entrega a la isla el JWT de la sesión (la cookie es httpOnly) para autenticar Supabase Realtime
 * en el navegador. Es el mismo token que ya usa el BFF; la RLS limita lo que puede leer.
 * Solo GET same-origin; `Cache-Control: no-store` evita que se guarde.
 */
export const GET: APIRoute = ({ locals }) =>
  locals.user && locals.accessToken
    ? Response.json(
        { accessToken: locals.accessToken, userId: locals.user.id },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    : Response.json(
        { error: { code: 'UNAUTHORIZED', message: 'Inicia sesión para continuar' } },
        { status: 401 },
      );
