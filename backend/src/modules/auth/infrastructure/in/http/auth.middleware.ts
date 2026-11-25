import type { RequestHandler } from 'express';
import type { IdentityProvider } from '../../../application/ports/out/identity-provider';

/** Pone el usuario en `res.locals.user` si hay sesión válida. No rechaza: eso lo hace `registerEndpoint`. */
export const createAuthMiddleware =
  (identity: IdentityProvider): RequestHandler =>
  async (req, res, next) => {
    const user = await identity.authenticate(req.header('authorization'));
    if (user) Object.assign(res.locals, { user });
    next();
  };
