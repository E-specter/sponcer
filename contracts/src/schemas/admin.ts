import { z } from 'zod';
import { Id, IgHandle, IsoDate, PageQuery } from './common';
import { MAX_REASON_LENGTH } from './limits';
import { ProfileRole } from './catalogs';
import { ProfileSummary } from './profiles';

/** Estado de un pedido de exclusión (Ley 29733, derechos ARCO). */
export const RemovalStatus = z.enum(['pending', 'applied', 'rejected']);
export type RemovalStatus = z.infer<typeof RemovalStatus>;

export const RemovalRequestItem = z.object({
  id: Id,
  igHandle: IgHandle,
  email: z.email(),
  reason: z.string().nullable(),
  status: RemovalStatus,
  createdAt: IsoDate,
  reviewedAt: IsoDate.nullable(),
  reviewNote: z.string().nullable(),
  /** Ficha afectada, si existe (null si el handle nunca se ingirió). */
  profile: ProfileSummary.nullable(),
});
export type RemovalRequestItem = z.infer<typeof RemovalRequestItem>;

export const AdminRemovalsQuery = PageQuery.extend({ status: RemovalStatus.optional() });

/** `apply` retira la ficha (borra snapshots, clasificación, embedding y fotos, y bloquea el handle); `reject` la mantiene. */
export const ReviewRemovalRequest = z.object({
  decision: z.enum(['apply', 'reject']),
  note: z.string().trim().max(MAX_REASON_LENGTH).optional(),
});
export type ReviewRemovalRequest = z.infer<typeof ReviewRemovalRequest>;

// ---- Altas manuales de administración (F6, ADR-008) ----

/** Ingiere y clasifica una cuenta pública profesional como ficha previa sin dueño. */
export const AdminAddProfileRequest = z.object({
  handle: IgHandle,
  role: ProfileRole.default('creator'),
});
export type AdminAddProfileRequest = z.infer<typeof AdminAddProfileRequest>;

export const InviteUserRequest = z.object({ email: z.email() });
export type InviteUserRequest = z.infer<typeof InviteUserRequest>;

/** `sent`: se envió el correo de invitación; `already_registered`: el correo ya tenía cuenta (se le reenvía el enlace de acceso). */
export const Invitation = z.object({
  email: z.email(),
  status: z.enum(['sent', 'already_registered']),
  invitedAt: IsoDate,
});
export type Invitation = z.infer<typeof Invitation>;

/** `env`: definido en ADMIN_EMAILS (solo se quita editando el .env); `app`: nombrado desde el panel. */
export const AdminEntry = z.object({
  email: z.email(),
  source: z.enum(['env', 'app']),
  grantedAt: IsoDate.nullable(),
  grantedBy: z.email().nullable(),
});
export type AdminEntry = z.infer<typeof AdminEntry>;

export const AdminEmailRequest = z.object({ email: z.email() });
export type AdminEmailRequest = z.infer<typeof AdminEmailRequest>;
