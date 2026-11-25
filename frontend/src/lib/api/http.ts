import { PUBLIC_API_URL } from 'astro:env/client';
import { api, ErrorBody, type EndpointName } from '@sponcer/contracts';
import { ApiError } from './errors';

export interface RawArgs {
  params?: Record<string, string>;
  query?: unknown;
  body?: unknown;
  token?: string;
}

const serializeValue = (v: unknown): string => (Array.isArray(v) ? v.join(',') : String(v));

function buildPath(path: string, params: Record<string, string> = {}): string {
  return path
    .split('/')
    .map((seg) => {
      if (!seg.startsWith(':')) return seg;
      const value = params[seg.slice(1)];
      if (value === undefined) throw new ApiError('VALIDATION_ERROR', `Falta el parámetro ${seg}`);
      return encodeURIComponent(value);
    })
    .join('/');
}

function buildQuery(query: unknown): string {
  const entries = Object.entries((query ?? {}) as Record<string, unknown>).flatMap(
    ([k, v]): [string, string][] =>
      v === undefined || v === null || v === '' ? [] : [[k, serializeValue(v)]],
  );
  const qs = new URLSearchParams(entries).toString();
  return qs ? `?${qs}` : '';
}

/** Implementación `http`: fetch a la core API con `Authorization: Bearer`. */
export async function httpCall(name: EndpointName, args: RawArgs): Promise<unknown> {
  const endpoint = api[name];
  const url = `${PUBLIC_API_URL}${buildPath(endpoint.path, args.params)}${buildQuery(args.query)}`;
  const hasBody = args.body !== undefined;

  const res = await fetch(url, {
    method: endpoint.method.toUpperCase(),
    headers: {
      Accept: 'application/json',
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(args.token ? { Authorization: `Bearer ${args.token}` } : {}),
    },
    body: hasBody ? JSON.stringify(args.body) : undefined,
  }).catch(() => {
    throw new ApiError('UPSTREAM_ERROR', 'No se pudo conectar con el servidor');
  });

  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = ErrorBody.safeParse(json);
    if (parsed.success) {
      const { code, message, details } = parsed.data.error;
      throw new ApiError(code, message, details);
    }
    throw new ApiError('UPSTREAM_ERROR', `Respuesta inesperada (${res.status})`);
  }
  return json;
}
