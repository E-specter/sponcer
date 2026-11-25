import { ErrorBody, type EndpointName } from '@sponcer/contracts';
import { ApiError } from './errors';
import type { ArgsTuple, CallArgs, Result } from './types';

const HTTP_UNAUTHORIZED = 401;

/**
 * Cliente para islas (navegador). El token vive en una cookie httpOnly, así que las islas
 * llaman a `/bff/<endpoint>` y el servidor reenvía a la API (mock o http) con el Bearer.
 */
export async function callBff<N extends EndpointName>(
  name: N,
  ...rest: ArgsTuple<CallArgs<N>>
): Promise<Result<N>> {
  const res = await fetch(`/bff/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rest[0] ?? {}),
  });
  const json: unknown = await res.json().catch(() => null);
  if (res.status === HTTP_UNAUTHORIZED) location.assign('/login?expired=1');
  if (!res.ok) {
    const parsed = ErrorBody.safeParse(json);
    if (parsed.success) {
      const { code, message, details } = parsed.data.error;
      throw new ApiError(code, message, details);
    }
    throw new ApiError('UPSTREAM_ERROR', 'Error inesperado');
  }
  return json as Result<N>;
}

export { ApiError } from './errors';
