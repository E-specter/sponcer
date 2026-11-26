import type { APIRoute } from 'astro';
import { createSupabase } from '../../lib/supabase';

export const prerender = false;

const OTP_TYPES = ['invite', 'email', 'magiclink', 'signup', 'recovery', 'email_change'] as const;
type OtpType = (typeof OTP_TYPES)[number];

/** Canjea el enlace del correo por la sesión (cookies httpOnly): `token_hash`+`type` (plantillas) o `code` (PKCE). */
export const GET: APIRoute = async (context) => {
  const params = context.url.searchParams;
  const supabase = createSupabase(context);
  const tokenHash = params.get('token_hash');
  const type = params.get('type');
  let error: unknown = new Error('missing');
  if (tokenHash && type && (OTP_TYPES as readonly string[]).includes(type)) {
    ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as OtpType }));
  } else if (params.get('code')) {
    ({ error } = await supabase.auth.exchangeCodeForSession(params.get('code') as string));
  }
  return context.redirect(error ? '/login?error=enlace' : '/descubrir');
};
