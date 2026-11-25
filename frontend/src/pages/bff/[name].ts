import type { APIRoute } from 'astro';
import { api, type EndpointName } from '@sponcer/contracts';
import { ApiError, call } from '../../lib/api';

export const prerender = false;

const errorResponse = (e: ApiError) =>
  Response.json(
    { error: { code: e.code, message: e.message, details: e.details } },
    { status: e.status },
  );

/**
 * BFF para islas: el navegador no ve el token (cookie httpOnly), así que reenvía aquí
 * y el servidor llama a la API (mock o http) con el Bearer de la sesión.
 */
/** IP del visitante: `CF-Connecting-IP` (túnel de Cloudflare), el primer valor de `X-Forwarded-For` o la del socket. */
const clientIpOf = (request: Request, clientAddress: string): string =>
  request.headers.get('cf-connecting-ip') ??
  request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
  clientAddress;

export const POST: APIRoute = async ({ params, request, locals, clientAddress }) => {
  const name = params.name;
  if (!name || !Object.hasOwn(api, name))
    return errorResponse(new ApiError('NOT_FOUND', 'Endpoint desconocido'));
  const endpoint = api[name as EndpointName] as { auth?: boolean };
  if (endpoint.auth !== false && !locals.user) {
    return errorResponse(new ApiError('UNAUTHORIZED', 'Inicia sesión para continuar'));
  }
  const args: unknown = await request.json().catch(() => ({}));
  try {
    const out = await call(
      name as EndpointName,
      { ...(args as object), token: locals.accessToken, clientIp: clientIpOf(request, clientAddress) } as never,
    );
    return Response.json(out);
  } catch (e) {
    if (e instanceof ApiError) return errorResponse(e);
    throw e;
  }
};
