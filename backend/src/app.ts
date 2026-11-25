import cors from 'cors';
import express, { Router, type ErrorRequestHandler, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { api, type ErrorBody } from '@sponcer/contracts';
import type { Env } from './config/env';
import { DomainError } from './shared/errors';
import { logger } from './shared/logger';
import { registerEndpoint, sendError } from './shared/http/register-endpoint';
import { ok } from './shared/result';

export interface AppDeps {
  env: Pick<Env, 'CORS_ORIGIN'>;
  /** Middleware de auth (slice auth): se monta antes de los routers. */
  authMiddleware: RequestHandler;
  routers: Router[];
}

const notFound: RequestHandler = (req, res) =>
  sendError(res, new DomainError('NOT_FOUND', `Ruta no encontrada: ${req.method} ${req.path}`));

const MIN_CLIENT_ERROR = 400;
const MAX_CLIENT_ERROR = 499;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const CLAIM_LIMIT_PER_MINUTE = 30;
const REMOVAL_LIMIT_PER_HOUR = 20;

/** Rate limit por IP en endpoints públicos o caros. Cada `createApp` crea contadores propios. */
// shortcut: tras un proxy hay que configurar `trust proxy`, si no todos comparten IP; al desplegar.
const limiter = (windowMs: number, limit: number): RequestHandler =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) =>
      sendError(res, new DomainError('RATE_LIMITED', 'Demasiadas peticiones, prueba más tarde')),
  });

const onError: ErrorRequestHandler = (e, _req, res, _next) => {
  // Errores del cliente de Express/body-parser (JSON mal formado, cuerpo grande, URI inválida) traen `status` 4xx.
  const status: unknown = e?.status ?? e?.statusCode;
  if (typeof status === 'number' && status >= MIN_CLIENT_ERROR && status <= MAX_CLIENT_ERROR) {
    const message = e.type === 'entity.parse.failed' ? 'JSON inválido' : 'Petición inválida';
    const body: ErrorBody = { error: { code: 'VALIDATION_ERROR', message } };
    return void res.status(status).json(body);
  }
  logger.error('error no controlado', e);
  sendError(res, new DomainError('INTERNAL_ERROR', 'Error interno'));
};

export function createApp(deps: AppDeps) {
  const health = Router();
  registerEndpoint(health, api.health, async () => ok({ status: 'ok' as const }));

  const app = express();
  app.disable('x-powered-by');
  // ADR-007: solo se confía en X-Forwarded-For si llega de localhost (el BFF); el rate limit usa la IP real.
  app.set('trust proxy', 'loopback');
  app.use(cors({ origin: deps.env.CORS_ORIGIN }));
  app.use(express.json());
  app.use(deps.authMiddleware);
  app.post(api.startClaim.path, limiter(MINUTE_MS, CLAIM_LIMIT_PER_MINUTE));
  app.post(api.verifyClaim.path, limiter(MINUTE_MS, CLAIM_LIMIT_PER_MINUTE));
  app.post(api.requestRemoval.path, limiter(HOUR_MS, REMOVAL_LIMIT_PER_HOUR));
  app.use(health, ...deps.routers);
  app.use(notFound);
  app.use(onError);
  return app;
}
