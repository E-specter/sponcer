import type { Request, Response, Router } from 'express';
import type { z } from 'zod';
import type { Endpoint, ErrorBody, ErrorCode } from '@sponcer/contracts';
import { DomainError } from '../errors';
import { logger } from '../logger';
import type { Result } from '../result';
import type { AuthUser } from './types';

const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const CONFLICT = 409;
const TOO_MANY_REQUESTS = 429;
const INTERNAL_SERVER_ERROR = 500;
const BAD_GATEWAY = 502;

export const HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: BAD_REQUEST,
  UNAUTHORIZED,
  FORBIDDEN,
  NOT_FOUND,
  CONFLICT,
  INVALID_TRANSITION: CONFLICT,
  RATE_LIMITED: TOO_MANY_REQUESTS,
  UPSTREAM_ERROR: BAD_GATEWAY,
  INTERNAL_ERROR: INTERNAL_SERVER_ERROR,
};

type Parsed<S> = S extends z.ZodType ? z.output<S> : undefined;
type Query<E extends Endpoint> = E extends { query: infer S } ? Parsed<S> : undefined;
type Body<E extends Endpoint> = E extends { body: infer S } ? Parsed<S> : undefined;
type User<E extends Endpoint> = E extends { auth: false } ? AuthUser | null : AuthUser;

/** "/a/:x/b/:y" → "x" | "y" */
type ParamNames<P extends string> = P extends `${string}:${infer N}/${infer R}`
  ? N | ParamNames<`/${R}`>
  : P extends `${string}:${infer N}`
    ? N
    : never;

export interface Ctx<E extends Endpoint> {
  query: Query<E>;
  body: Body<E>;
  params: Record<ParamNames<E['path']>, string>;
  user: User<E>;
}

export type EndpointHandler<E extends Endpoint> = (
  ctx: Ctx<E>,
) => Promise<Result<z.input<E['response']>, DomainError>>;

export function sendError(res: Response, error: DomainError): void {
  const body: ErrorBody = {
    error: { code: error.code, message: error.message, details: error.details },
  };
  res.status(HTTP_STATUS[error.code]).json(body);
}

function parseWith(schema: z.ZodType | undefined, input: unknown, where: string) {
  if (!schema) return { ok: true as const, value: undefined };
  const r = schema.safeParse(input);
  return r.success
    ? { ok: true as const, value: r.data }
    : {
        ok: false as const,
        error: new DomainError('VALIDATION_ERROR', `${where} inválido`, r.error.issues),
      };
}

const isProduction = () => process.env.NODE_ENV === 'production';

/**
 * Registra un endpoint del registro `api`: exige auth (salvo `auth: false`), valida query/body,
 * ejecuta el handler y convierte Result → HTTP. Valida la respuesta y en producción envía la versión parseada.
 */
export function registerEndpoint<E extends Endpoint>(
  router: Router,
  endpoint: E,
  handler: EndpointHandler<E>,
): void {
  router[endpoint.method](endpoint.path, async (req: Request, res: Response) => {
    const user = (res.locals.user as AuthUser | undefined) ?? null;
    if (endpoint.auth !== false && !user) {
      return sendError(res, new DomainError('UNAUTHORIZED', 'Falta autenticación'));
    }
    const query = parseWith(endpoint.query, req.query, 'query');
    if (!query.ok) return sendError(res, query.error);
    const body = parseWith(endpoint.body, req.body, 'body');
    if (!body.ok) return sendError(res, body.error);

    const ctx = { query: query.value, body: body.value, params: req.params, user } as Ctx<E>;
    // Los adaptadores reales pueden lanzar DomainError (p. ej. 409 por FK); el resto sube a onError (500).
    const result = await handler(ctx).catch((e: unknown) => {
      if (e instanceof DomainError) return { ok: false as const, error: e };
      throw e;
    });
    if (!result.ok) return sendError(res, result.error);

    const check = endpoint.response.safeParse(result.value);
    if (!check.success) {
      logger.error(`respuesta inválida en ${endpoint.path}`, check.error.issues);
      // Los `issues` pueden revelar la estructura interna: solo se envían fuera de producción.
      const details = isProduction() ? undefined : check.error.issues;
      return sendError(res, new DomainError('INTERNAL_ERROR', 'Respuesta inválida', details));
    }
    // En producción se envía lo parseado (sin campos de más); fuera, el valor tal cual para detectar fugas en tests.
    res.json(isProduction() ? check.data : result.value);
  });
}
