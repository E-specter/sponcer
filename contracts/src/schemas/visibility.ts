import { z } from 'zod';
import { Id, IsoDate, PageQuery } from './common';
import { ProfileSummary } from './profiles';

/**
 * Visibilidad (ADR-009, estilo LinkedIn): quién mostró interés sin match y quién vio la ficha.
 * Solo cuentan perfiles del tipo opuesto; una visita por visitante y perfil por día.
 */
export const VisibilityKind = z.enum(['interest', 'view']);
export type VisibilityKind = z.infer<typeof VisibilityKind>;

export const VisibilityQuery = PageQuery.extend({ profileId: Id, kind: VisibilityKind });
export type VisibilityQuery = z.infer<typeof VisibilityQuery>;

export const VisibilityItem = z.object({
  kind: VisibilityKind,
  profile: ProfileSummary,
  /** Última vez (visita) o momento del interés. */
  at: IsoDate,
  /** Visitas del mismo perfil en los últimos 30 días (1 para intereses). */
  count: z.number().int().positive(),
  /** Ya existe interés tuyo hacia ese perfil (para ocultar "devolver interés"). */
  reciprocated: z.boolean(),
});
export type VisibilityItem = z.infer<typeof VisibilityItem>;

export const VisibilitySummaryQuery = z.object({ profileId: Id });

export const VisibilitySummary = z.object({
  interests7d: z.number().int().nonnegative(),
  interests30d: z.number().int().nonnegative(),
  views7d: z.number().int().nonnegative(),
  views30d: z.number().int().nonnegative(),
});
export type VisibilitySummary = z.infer<typeof VisibilitySummary>;

/** El frontend la envía al abrir una ficha con un perfil propio activo. Idempotente por día. */
export const RecordViewRequest = z.object({ viewerProfileId: Id });
export type RecordViewRequest = z.infer<typeof RecordViewRequest>;

/** `recorded: false` = no aplica (mismo tipo, perfil propio, ficha sin dueño o ya registrada hoy). */
export const RecordViewResult = z.object({ recorded: z.boolean() });
