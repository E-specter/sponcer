import { PUBLIC_API_MODE } from 'astro:env/client';
import { api, type EndpointName } from '@sponcer/contracts';
import type { z } from 'zod';
import { ApiError } from './errors';
import { httpCall, type RawArgs } from './http';
import { mockCall } from './mock';
import type { ArgsTuple, CallArgs, Result } from './types';

export { ApiError } from './errors';
export type { Result } from './types';

function parseWith(schema: z.ZodType, value: unknown): unknown {
  const r = schema.safeParse(value);
  if (!r.success) throw new ApiError('VALIDATION_ERROR', 'Datos inválidos', r.error.issues);
  return r.data;
}

/**
 * Cliente tipado (servidor). Valida query y body con los esquemas del registro y delega en
 * `mock` o `http` según `PUBLIC_API_MODE`. El tipo de retorno sale de `response`.
 */
export async function call<N extends EndpointName>(
  name: N,
  ...rest: ArgsTuple<CallArgs<N> & { token?: string | null; clientIp?: string }>
): Promise<Result<N>> {
  const args = (rest[0] ?? {}) as RawArgs;
  const endpoint = api[name] as { query?: z.ZodType; body?: z.ZodType };
  const parsed: RawArgs = {
    params: args.params,
    token: args.token ?? undefined,
    clientIp: args.clientIp,
    query: endpoint.query ? parseWith(endpoint.query, args.query ?? {}) : undefined,
    body: endpoint.body ? parseWith(endpoint.body, args.body) : undefined,
  };
  const out =
    PUBLIC_API_MODE === 'mock' ? await mockCall(name, parsed) : await httpCall(name, parsed);
  return out as Result<N>;
}
