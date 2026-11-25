import type { RealtimeGateway } from '../../application/ports/out/chat-ports';

/**
 * Gateway real: no-op a propósito. La entrega en vivo la hace Supabase Realtime (postgres_changes)
 * cuando el MessageRepository real inserta la fila en `messages` (ADR-006); el backend no empuja nada.
 * Existe para mantener el puerto estable si algún día se necesita broadcast explícito.
 */
export const createSupabaseRealtimeGateway = (): RealtimeGateway => ({
  publish: async () => undefined,
});
