import { PUBLIC_AUTH_MODE, PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from 'astro:env/client';
import {
  createClient,
  type RealtimePostgresInsertPayload,
  type SupabaseClient,
} from '@supabase/supabase-js';

export type Unsubscribe = () => void;

/** El JWT de Supabase dura 1 h por defecto; se renueva antes pidiendo otro al servidor. */
const TOKEN_REFRESH_MS = 10 * 60 * 1000;
const NOOP: Unsubscribe = () => undefined;

interface RealtimeSession {
  accessToken: string;
  userId: string;
}

async function fetchSession(): Promise<RealtimeSession | null> {
  const res = await fetch('/bff/realtime-token', { cache: 'no-store' }).catch(() => null);
  return res?.ok ? ((await res.json()) as RealtimeSession) : null;
}

/**
 * Suscripción de SOLO LECTURA a INSERT en `table` (postgres_changes, protegido por RLS).
 * `filter` recibe el userId de la sesión. En modo mock auth no hay Supabase: no-op.
 * Nunca escribe en la BD: las escrituras pasan siempre por la core API.
 */
export function subscribeInserts<Row>(
  table: 'messages' | 'notifications',
  filter: (userId: string) => string,
  onRow: (row: Row) => void,
  /** Se llama cada vez que el canal queda SUBSCRIBED (primera vez y reconexiones): sirve para re-sincronizar lo perdido. */
  onSubscribed?: () => void,
): Unsubscribe {
  if (PUBLIC_AUTH_MODE !== 'supabase' || !PUBLIC_SUPABASE_URL || !PUBLIC_SUPABASE_ANON_KEY)
    return NOOP;

  let client: SupabaseClient | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  let cancelled = false;

  void (async () => {
    const session = await fetchSession();
    if (!session || cancelled) return;
    // Sin persistencia ni refresh propio: la sesión vive en el servidor.
    const c = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    client = c;
    await c.realtime.setAuth(session.accessToken);
    c.channel(`${table}:${filter(session.userId)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table, filter: filter(session.userId) },
        (p: RealtimePostgresInsertPayload<Record<string, unknown>>) => onRow(p.new as Row),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') onSubscribed?.();
      });
    timer = setInterval(async () => {
      const next = await fetchSession();
      if (next) await c.realtime.setAuth(next.accessToken);
    }, TOKEN_REFRESH_MS);
  })();

  return () => {
    cancelled = true;
    clearInterval(timer);
    if (client) void client.removeAllChannels();
  };
}
