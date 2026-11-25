import type { ZodError } from 'zod';
import { ApiError } from '../../lib/api/bff';

/** Primer mensaje de error por campo (clave = ruta separada por ".") a partir de un ZodError. */
export const fieldErrors = (err: ZodError): Record<string, string> =>
  err.issues.reduce<Record<string, string>>((acc, issue) => {
    const key = issue.path.join('.');
    return key in acc ? acc : { ...acc, [key]: issue.message };
  }, {});

export const messageOf = (e: unknown): string =>
  e instanceof ApiError ? e.message : 'Ocurrió un error inesperado. Inténtalo de nuevo.';
