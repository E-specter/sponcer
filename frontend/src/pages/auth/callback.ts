import type { APIRoute } from 'astro';
import { createSupabase } from '../../lib/supabase';

export const prerender = false;

/** Intercambia el código PKCE del enlace mágico por la sesión (cookies httpOnly). Se completa en F2. */
export const GET: APIRoute = async (context) => {
  const code = context.url.searchParams.get('code');
  if (!code) return context.redirect('/login');
  const { error } = await createSupabase(context).auth.exchangeCodeForSession(code);
  return context.redirect(error ? '/login' : '/descubrir');
};
