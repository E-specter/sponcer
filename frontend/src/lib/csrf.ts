import { trustedOrigins } from './site';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** Tipos que un formulario HTML puede enviar sin preflight CORS (los mismos que vigila Astro). */
const FORM_TYPES = ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'];
const SAME_SITE_VALUES = new Set(['same-origin', 'none']);

/**
 * Protección CSRF equivalente a `security.checkOrigin` de Astro (desactivado en astro.config.mjs porque
 * tras un túnel el origen local y el público difieren). Solo métodos no seguros con tipo de formulario
 * (o sin tipo); JSON y `fetch` same-origin van con preflight y no se vigilan.
 * Con `Origin` presente debe estar entre los orígenes de confianza; si no, se exige `Sec-Fetch-Site` same-origin/none.
 */
export function isCrossSiteForm(request: Request): boolean {
  if (!UNSAFE_METHODS.has(request.method)) return false;
  const type = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
  if (type !== '' && !FORM_TYPES.includes(type)) return false;
  const origin = request.headers.get('origin');
  if (origin) return !trustedOrigins(new URL(request.url)).includes(origin);
  const fetchSite = request.headers.get('sec-fetch-site');
  return fetchSite === null || !SAME_SITE_VALUES.has(fetchSite);
}
