import { PUBLIC_SITE_URL } from 'astro:env/client';

/**
 * Origen público de la app (ADR-007). Detrás del túnel de Cloudflare el servidor ve `http://localhost:4321`
 * (cloudflared reescribe el Host), así que el origen real viene de `PUBLIC_SITE_URL`. Sin ella, el de la petición.
 */
const publicUrl: URL | null = PUBLIC_SITE_URL ? new URL(PUBLIC_SITE_URL) : null;

export const siteOrigin = (requestUrl: URL): string => publicUrl?.origin ?? requestUrl.origin;

/** Las cookies de sesión van `Secure` cuando el origen público es https. */
export const isSecureOrigin = (requestUrl: URL): boolean =>
  (publicUrl ?? requestUrl).protocol === 'https:';

/** Orígenes desde los que se aceptan formularios: el de la petición (local) y el público, si existe. */
export const trustedOrigins = (requestUrl: URL): string[] =>
  publicUrl ? [requestUrl.origin, publicUrl.origin] : [requestUrl.origin];
