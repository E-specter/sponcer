import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProfileRole, Service } from '@sponcer/contracts';
import { unwrap } from '../../../../../shared/supabase/unwrap';
import type { ClaimOutcome, ProfileClaimer } from '../../../application/ports/out/profile-claimer';
import type { ProfileReader } from '../../../application/ports/out/profile-reader';
import type { ProfileWriter } from '../../../application/ports/out/profile-writer';
import type { RemovalRequestStore } from '../../../application/ports/out/removal-request-store';
import type { ServiceRepository } from '../../../application/ports/out/service-repository';
import {
  profileFromRow,
  profileToRow,
  serviceFromRow,
  type ProfileRow,
  type ServiceRow,
} from './mappers';

export function createSupabaseProfileRepository(
  supabase: SupabaseClient,
  now: () => Date = () => new Date(),
): ProfileReader & ProfileWriter {
  const table = () => supabase.from('profiles');
  return {
    async findById(id) {
      const row = unwrap(await table().select('*').eq('id', id).maybeSingle<ProfileRow>());
      return row ? profileFromRow(row) : null;
    },
    async findByHandle(handle) {
      const row = unwrap(
        await table().select('*').eq('ig_handle', handle).maybeSingle<ProfileRow>(),
      );
      return row ? profileFromRow(row) : null;
    },
    async listByOwner(userId) {
      return unwrap(
        await table().select('*').eq('owner_user_id', userId).returns<ProfileRow[]>(),
      ).map(profileFromRow);
    },
    async listByRole(role) {
      return unwrap(await table().select('*').eq('role', role).returns<ProfileRow[]>()).map(
        profileFromRow,
      );
    },
    async save(profile) {
      unwrap(await table().upsert(profileToRow(profile, now())));
    },
  };
}

export function createSupabaseServiceRepository(supabase: SupabaseClient): ServiceRepository {
  const list = async (profileId: string) =>
    unwrap(
      await supabase
        .from('creator_services')
        .select('*')
        .eq('profile_id', profileId)
        .order('position')
        .order('created_at')
        .order('id')
        .returns<ServiceRow[]>(),
    ).map(serviceFromRow);
  return {
    list,
    async findById(serviceId) {
      const row = unwrap(
        await supabase
          .from('creator_services')
          .select('*')
          .eq('id', serviceId)
          .maybeSingle<ServiceRow>(),
      );
      return row ? { service: serviceFromRow(row), profileId: row.profile_id } : null;
    },
    // RPC transaccional: conserva ids de filas idénticas; si una fila a borrar tiene cotizaciones -> 409 y nada cambia.
    async replace(profileId, services) {
      const rows = unwrap(
        await supabase.rpc('replace_creator_services', {
          p_profile_id: profileId,
          p_services: services,
        }),
        { onForeignKey: 'No se puede quitar un servicio que tiene cotizaciones' },
      );
      return rows as Service[];
    },
  };
}

export const createSupabaseRemovalStore = (supabase: SupabaseClient): RemovalRequestStore => ({
  async add(r) {
    unwrap(
      await supabase.from('profile_removal_requests').insert({
        ig_handle: r.handle,
        email: r.email,
        reason: r.reason ?? null,
        created_at: r.createdAt.toISOString(),
        status: r.status ?? 'pending',
      }),
    );
  },
});

export const createSupabaseProfileClaimer = (supabase: SupabaseClient): ProfileClaimer => ({
  async claim(handle, userId, role: ProfileRole) {
    const r = unwrap(
      await supabase.rpc('claim_profile', { p_handle: handle, p_user_id: userId, p_role: role }),
    ) as {
      status: ClaimOutcome['status'];
      profile_id?: string;
    };
    return r.status === 'claimed'
      ? { status: 'claimed', profileId: r.profile_id as string }
      : { status: r.status };
  },
});
