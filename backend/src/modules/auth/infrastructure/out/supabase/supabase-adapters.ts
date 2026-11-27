import type { SupabaseClient } from '@supabase/supabase-js';
import { CLAIM_MAX_ATTEMPTS_PER_HOUR, type Company } from '@sponcer/contracts';
import { DomainError } from '../../../../../shared/errors';
import { PG_UNIQUE_VIOLATION, SP_CONFLICT, unwrap } from '../../../../../shared/supabase/unwrap';
import type { AccountStore } from '../../../application/ports/out/account-store';
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

interface AccountRow {
  account_kind: 'company' | 'influencer';
  display_name: string | null;
  city: string | null;
  about: string | null;
}

interface CompanyRow {
  id: string;
  person_type: 'natural' | 'juridica';
  document_type: 'dni' | 'ruc';
  document_number: string;
  legal_name: string;
  trade_name: string | null;
  city: Company['city'];
  created_at: string;
}

export const createSupabaseAccountStore = (supabase: SupabaseClient): AccountStore => ({
  async get(userId) {
    const account = unwrap(
      await supabase.from('accounts').select('*').eq('user_id', userId).maybeSingle<AccountRow>(),
    );
    if (!account) return { accountKind: null, company: null, influencer: null };
    if (account.account_kind === 'influencer')
      return {
        accountKind: 'influencer',
        company: null,
        influencer: {
          displayName: account.display_name ?? '',
          city: (account.city ?? 'otra') as Company['city'],
          about: account.about,
        },
      };
    const c = unwrap(
      await supabase
        .from('companies')
        .select('*')
        .eq('owner_user_id', userId)
        .maybeSingle<CompanyRow>(),
    );
    if (!c) {
      // Cuenta Empresa sin fila de companies: se degrada para no dejar a la persona fuera de la app.
      console.error('[auth] cuenta company sin fila en companies', { userId });
      return { accountKind: 'company', company: null, influencer: null };
    }
    return {
      accountKind: 'company',
      influencer: null,
      company: {
        id: c.id,
        personType: c.person_type,
        documentType: c.document_type,
        documentNumber: c.document_number,
        legalName: c.legal_name,
        tradeName: c.trade_name,
        city: c.city,
        createdAt: new Date(c.created_at).toISOString(),
      },
    };
  },
  // Transacción en la BD (RPC). Los conflictos de negocio llegan como SP409 con un motivo en el mensaje.
  async register(userId, req) {
    const { error } = await supabase.rpc('register_account', {
      p_user_id: userId,
      p_kind: req.accountKind,
      p_company: req.accountKind === 'company' ? req.company : null,
      p_influencer: req.accountKind === 'influencer' ? req.influencer : null,
      p_version: req.consentVersion,
    });
    if (!error) return;
    if (error.code === SP_CONFLICT && error.message.includes('document_taken'))
      throw new DomainError(
        'CONFLICT',
        `Ya existe una empresa registrada con ese ${req.accountKind === 'company' ? req.company.documentType.toUpperCase() : 'documento'}`,
        { reason: 'document_taken' },
      );
    if (error.code === SP_CONFLICT || error.code === PG_UNIQUE_VIOLATION)
      throw new DomainError('CONFLICT', 'Esta cuenta ya está registrada', {
        reason: 'already_registered',
      });
    throw new Error(`Supabase [${error.code}]: ${error.message}`);
  },
});
