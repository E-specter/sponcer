import { z } from 'zod';
import { Id, IgHandle, IsoDate, PageQuery } from './common';
import { MAX_REASON_LENGTH } from './limits';
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
