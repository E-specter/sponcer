import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { E2E_EMAIL_DOMAIN, E2E_HANDLE_PREFIX, SERVICE_KEY, SUPABASE_URL } from './env';

const TAG_LENGTH = 8;
const USERS_PAGE_SIZE = 1000;
/** Solo se barren restos con más de 10 min: así un archivo no borra los datos de otro en curso. */
const STALE_MS = 600_000;
/** Tablas con `ig_handle` sin FK a profiles. */
const HANDLE_TABLES = ['profile_removal_requests', 'ig_snapshots', 'ingestion_blocklist'] as const;

/** Cliente service_role: solo para preparar y limpiar datos (nunca para la acción bajo prueba). */
export const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const uniqueTag = (): string => randomUUID().replaceAll('-', '').slice(0, TAG_LENGTH);

export interface E2EUser {
  id: string;
  email: string;
}

interface IdRow {
  id: string;
}

/** Crea y rastrea datos temporales de un spec; `cleanup()` los borra (y los restos antiguos). */
export function createWorld() {
  const users: E2EUser[] = [];
  const handles: string[] = [];

  const world = {
    async newUser(): Promise<E2EUser> {
      const email = `e2e-${uniqueTag()}@${E2E_EMAIL_DOMAIN}`;
      const res = await admin.auth.admin.createUser({ email, email_confirm: true });
      if (res.error || !res.data.user) throw new Error(`createUser: ${res.error?.message}`);
      const user = { id: res.data.user.id, email };
      users.push(user);
      return user;
    },
    /** Rastrea un correo creado por la propia app (p. ej. por el enlace mágico) para limpiarlo. */
    trackEmail(email: string): void {
      users.push({ id: '', email });
    },
    newHandle(): string {
      const handle = `${E2E_HANDLE_PREFIX}${uniqueTag()}`;
      handles.push(handle);
      return handle;
    },
    async cleanup(): Promise<void> {
      const cutoff = new Date(Date.now() - STALE_MS).toISOString();
      const list = await admin.auth.admin.listUsers({ perPage: USERS_PAGE_SIZE });
      const mine = new Set(users.map((u) => u.email));
      const doomed = list.data.users.filter(
        (u) =>
          u.email?.endsWith(`@${E2E_EMAIL_DOMAIN}`) && (mine.has(u.email) || u.created_at < cutoff),
      );
      const ownerIds = doomed.map((u) => u.id);
      const owned = await admin.from('profiles').select('id').in('owner_user_id', ownerIds);
      const byHandle = await admin.from('profiles').select('id').in('ig_handle', handles);
      const stale = await admin
        .from('profiles')
        .select('id')
        .like('ig_handle', `${E2E_HANDLE_PREFIX}%`)
        .lt('created_at', cutoff);
      const ids = [
        ...new Set(
          [owned.data, byHandle.data, stale.data].flatMap((rows) =>
            ((rows ?? []) as IdRow[]).map((r) => r.id),
          ),
        ),
      ];
      if (ids.length > 0) {
        // quotes.service_id es RESTRICT: las cotizaciones se borran antes que los servicios (cascada del perfil).
        await admin.from('quotes').delete().in('creator_profile_id', ids);
        await admin.from('quotes').delete().in('requester_profile_id', ids);
        await admin.from('profiles').delete().in('id', ids);
      }
      await Promise.all(
        HANDLE_TABLES.map((table) =>
          admin.from(table).delete().like('ig_handle', `${E2E_HANDLE_PREFIX}%`),
        ),
      );
      await Promise.all(ownerIds.map((id) => admin.auth.admin.deleteUser(id)));
    },
  };
  return world;
}
export type World = ReturnType<typeof createWorld>;
