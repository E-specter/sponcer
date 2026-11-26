import type { AdminEntry } from '@sponcer/contracts';

/** `adminEmails` ya viene en minúsculas desde `loadEnv`. */
export const isAdminEmail = (adminEmails: readonly string[], email: string): boolean =>
  adminEmails.includes(email.trim().toLowerCase());

/** Correo a usar para decidir `isAdmin`: vacío (nunca admin) si el correo no está verificado (F6-A1). */
export const adminEmailOf = (u: { email: string; emailConfirmed?: boolean }): string =>
  u.emailConfirmed === false ? '' : u.email;

export interface AppAdmin {
  email: string;
  grantedBy: string | null;
  grantedAt: Date;
}

/** Administradores nombrados desde la app (tabla `admin_users`). */
export interface AdminStore {
  list(): Promise<AppAdmin[]>;
  /** Idempotente: si ya existe, no cambia nada. */
  add(admin: AppAdmin): Promise<void>;
  remove(email: string): Promise<void>;
}

/** Administradores = ADMIN_EMAILS (fijos, source 'env') ∪ tabla `admin_users` (source 'app'). */
export interface AdminDirectory {
  isAdmin(email: string): Promise<boolean>;
  /** Lista completa ordenada: primero los de env, luego los de la app por fecha. */
  list(): Promise<AdminEntry[]>;
  isFromEnv(email: string): boolean;
  grant(email: string, by: string, at: Date): Promise<void>;
  revoke(email: string): Promise<void>;
}

export const createAdminDirectory = (
  envEmails: readonly string[],
  store: AdminStore,
): AdminDirectory => {
  const norm = (e: string) => e.trim().toLowerCase();
  const list = async (): Promise<AdminEntry[]> => {
    const app = (await store.list())
      .filter((a) => !envEmails.includes(a.email))
      .sort(
        (a, b) => a.grantedAt.getTime() - b.grantedAt.getTime() || a.email.localeCompare(b.email),
      );
    return [
      ...envEmails.map((email) => ({
        email,
        source: 'env' as const,
        grantedAt: null,
        grantedBy: null,
      })),
      ...app.map((a) => ({
        email: a.email,
        source: 'app' as const,
        grantedAt: a.grantedAt.toISOString(),
        grantedBy: a.grantedBy,
      })),
    ];
  };
  return {
    isAdmin: async (email) => (await list()).some((a) => a.email === norm(email)),
    list,
    isFromEnv: (email) => isAdminEmail(envEmails, email),
    grant: (email, by, at) => store.add({ email: norm(email), grantedBy: by, grantedAt: at }),
    revoke: (email) => store.remove(norm(email)),
  };
};

export const createInMemoryAdminStore = (): AdminStore => {
  const rows = new Map<string, AppAdmin>();
  return {
    list: async () => [...rows.values()],
    add: async (a) => void (rows.has(a.email) || rows.set(a.email, a)),
    remove: async (email) => void rows.delete(email),
  };
};
