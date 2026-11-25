import type { PostgrestError } from '@supabase/supabase-js';
import { DomainError } from '../errors';

export const PG_FK_VIOLATION = '23503';
export const PG_UNIQUE_VIOLATION = '23505';
/** SQLSTATE propio de las RPC para conflictos de estado/titularidad (ver docs/05-contratos/esquema-bd.md). */
export const SP_CONFLICT = 'SP409';

export interface UnwrapOptions {
  /** Mensaje del 409 cuando la BD rechaza por una FK (p. ej. borrar algo referenciado). Sin él, un FK es un error interno. */
  onForeignKey?: string;
}

/**
 * Los errores de BD de infraestructura se lanzan como `Error` (el borde responde 500). Los de negocio conocidos
 * (FK con `onForeignKey`, `SP409`) se lanzan como `DomainError` CONFLICT (409).
 * Solo se conservan código y mensaje: `details`/`hint` de PostgREST pueden incluir datos de personas (L-3).
 */
export function unwrap<T>(
  res: { data: T | null; error: PostgrestError | null },
  opts: UnwrapOptions = {},
): T {
  const e = res.error;
  if (!e) return res.data as T;
  if (e.code === PG_FK_VIOLATION && opts.onForeignKey)
    throw new DomainError('CONFLICT', opts.onForeignKey);
  if (e.code === PG_UNIQUE_VIOLATION)
    throw new DomainError('CONFLICT', 'Ya existe un registro con esos datos');
  if (e.code === SP_CONFLICT)
    throw new DomainError('CONFLICT', 'El recurso cambió mientras se procesaba la operación');
  throw new Error(`Supabase [${e.code}]: ${e.message}`);
}
