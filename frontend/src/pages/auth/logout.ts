import { PUBLIC_AUTH_MODE } from 'astro:env/client';
import type { APIRoute } from 'astro';
import { createSupabase } from '../../lib/supabase';

export const prerender = false;

/** Cierra la sesión (POST para que un enlace o imagen ajena no pueda desloguear) y limpia las cookies. */
export const POST: APIRoute = async (context) => {
  if (PUBLIC_AUTH_MODE === 'supabase') await createSupabase(context).auth.signOut();
  return context.redirect('/login', 303);
};
