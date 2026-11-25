import { PUBLIC_AUTH_MODE, PUBLIC_DEMO_LOGIN } from 'astro:env/client';
import { DEMO_PASSWORD } from 'astro:env/server';
import type { APIRoute } from 'astro';
import { isDemoEmail } from '../../lib/demo';
import { createSupabase } from '../../lib/supabase';

export const prerender = false;

const HTTP_NOT_FOUND = 404;
const HTTP_SEE_OTHER = 303;

/**
 * Acceso de demo (ADR-007): correo + contraseña de una cuenta `*@sponcer.local`. La contraseña sale
 * de `DEMO_PASSWORD` (secreto de servidor): el navegador solo elige la cuenta.
 */
export const POST: APIRoute = async (context) => {
  if (PUBLIC_AUTH_MODE !== 'supabase' || !PUBLIC_DEMO_LOGIN || !DEMO_PASSWORD) {
    return new Response('No encontrado', { status: HTTP_NOT_FOUND });
  }
  const email = String((await context.request.formData()).get('email') ?? '');
  if (!isDemoEmail(email)) return context.redirect('/login?demo=error', HTTP_SEE_OTHER);
  const { error } = await createSupabase(context).auth.signInWithPassword({
    email,
    password: DEMO_PASSWORD,
  });
  return context.redirect(error ? '/login?demo=error' : '/descubrir', HTTP_SEE_OTHER);
};
