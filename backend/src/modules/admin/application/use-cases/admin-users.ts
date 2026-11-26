import type { AdminEntry, Invitation } from '@sponcer/contracts';
import { type AdminDirectory } from '../../../../shared/admin';
import { DomainError } from '../../../../shared/errors';
import { logger } from '../../../../shared/logger';
import { err, ok, type Result } from '../../../../shared/result';
import type { WindowLimiter } from '../../../../shared/rate-limit';
import type { InvitationSender } from '../ports/out/invitation-sender';

type R<T> = Promise<Result<T, DomainError>>;
const norm = (e: string) => e.trim().toLowerCase();

/** Cada alta manual queda en el log con el correo del administrador que la hizo. */
const audit = (admin: string, action: string, target: string) =>
  logger.info('admin.action', { admin, action, target });

export function makeAdminUsers(d: {
  admins: AdminDirectory;
  invites: InvitationSender;
  now: () => Date;
  /** Tope de invitaciones por administrador (el correo de Supabase es un cupo global, F6-M3). */
  inviteLimiter?: WindowLimiter;
}) {
  const forbidden = () => err(new DomainError('FORBIDDEN', 'Solo administradores'));
  const guarded =
    <A extends unknown[], T>(fn: (admin: string, ...a: A) => R<T>) =>
    async (admin: string, ...a: A): R<T> =>
      (await d.admins.isAdmin(admin)) ? fn(norm(admin), ...a) : forbidden();

  return {
    list: guarded(async (): R<AdminEntry[]> => ok(await d.admins.list())),
    grant: guarded(async (admin, email: string): R<AdminEntry[]> => {
      await d.admins.grant(email, admin, d.now());
      audit(admin, 'grant-admin', norm(email));
      return ok(await d.admins.list());
    }),
    revoke: guarded(async (admin, email: string): R<AdminEntry[]> => {
      const target = norm(email);
      const all = await d.admins.list();
      if (!all.some((a) => a.email === target))
        return err(new DomainError('NOT_FOUND', 'Ese correo no es administrador'));
      if (d.admins.isFromEnv(target))
        return err(
          new DomainError(
            'CONFLICT',
            'Es administrador fijo (ADMIN_EMAILS): solo se quita en el .env',
          ),
        );
      if (all.length <= 1)
        return err(new DomainError('CONFLICT', 'No se puede quitar al último administrador'));
      await d.admins.revoke(target);
      audit(admin, 'revoke-admin', target);
      return ok(await d.admins.list());
    }),
    invite: guarded(async (admin, email: string): R<Invitation> => {
      if (d.inviteLimiter && !d.inviteLimiter.tryTake(admin))
        return err(new DomainError('RATE_LIMITED', 'Demasiadas invitaciones, prueba en una hora'));
      const status = await d.invites.invite(norm(email));
      audit(admin, 'invite-user', norm(email));
      return ok({ email: norm(email), status, invitedAt: d.now().toISOString() });
    }),
  };
}
