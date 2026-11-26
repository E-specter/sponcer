import type { SupabaseClient } from '@supabase/supabase-js';
import { DomainError } from '../../../../../shared/errors';
import type { InvitationSender } from '../../../application/ports/out/invitation-sender';

const UNPROCESSABLE = 422;

export const createSupabaseInvitationSender = (
  supabase: SupabaseClient,
  appUrl: string,
): InvitationSender => {
  const redirectTo = `${appUrl.replace(/\/$/, '')}/auth/callback`;
  return {
    async invite(email) {
      const { error } = await supabase.auth.admin.inviteUserByEmail(email, { redirectTo });
      if (!error) return 'sent';
      if (error.code !== 'email_exists' && error.status !== UNPROCESSABLE)
        throw new DomainError('UPSTREAM_ERROR', 'No se pudo enviar la invitación');
      // Ya tiene cuenta: se le manda un enlace de acceso (sin crear usuarios nuevos).
      const login = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
      });
      if (login.error)
        throw new DomainError('UPSTREAM_ERROR', 'No se pudo enviar el enlace de acceso');
      return 'already_registered';
    },
  };
};
