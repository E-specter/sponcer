import type { SupabaseClient } from '@supabase/supabase-js';
import { CLAIM_MAX_ATTEMPTS_PER_HOUR } from '@sponcer/contracts';
import { unwrap } from '../../../../../shared/supabase/unwrap';
import type { ClaimStore } from '../../../application/ports/out/claim-store';
import type { IdentityProvider } from '../../../application/ports/out/identity-provider';
import { bearerToken, claimFromRow, claimToRow, type ClaimRow } from './mappers';

const WINDOW_MINUTES = 60;

/** Valida el access_token de Supabase Auth con el cliente service_role. Cualquier fallo es "sin sesión". */
export const createSupabaseIdentityProvider = (supabase: SupabaseClient): IdentityProvider => ({
  async authenticate(header) {
    const token = bearerToken(header);
    if (!token) return null;
    try {
      const { data, error } = await supabase.auth.getUser(token);
      return error || !data.user
        ? null
        : {
            userId: data.user.id,
            email: data.user.email ?? '',
            ...(data.user.email_confirmed_at ? {} : { emailConfirmed: false }),
          };
    } catch {
      return null;
    }
  },
});

export const createSupabaseClaimStore = (supabase: SupabaseClient): ClaimStore => ({
  async save(claim) {
    unwrap(await supabase.from('profile_claims').insert(claimToRow(claim)));
  },
  async findById(id) {
    const row = unwrap(
      await supabase.from('profile_claims').select('*').eq('id', id).maybeSingle<ClaimRow>(),
    );
    return row ? claimFromRow(row) : null;
  },
  async markConsumed(id) {
    unwrap(await supabase.from('profile_claims').update({ consumed: true }).eq('id', id));
  },
  // Atómico en la BD (advisory lock + cuenta + inserción); la hora la pone la BD, `_now` no se usa.
  async tryRecordAttempt(userId) {
    return unwrap(
      await supabase.rpc('record_claim_attempt', {
        p_user_id: userId,
        p_window_minutes: WINDOW_MINUTES,
        p_max: CLAIM_MAX_ATTEMPTS_PER_HOUR,
      }),
    ) as boolean;
  },
});
