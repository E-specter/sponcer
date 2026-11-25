import { DomainError } from './errors';
import { err, ok, type Result } from './result';

const CURSOR_ENCODING = 'base64url';
const DIGITS = /^\d+$/; // un entero decimal sin signo, sin espacios ni decimales

// shortcut: cursor = offset codificado (listas pequeñas); con volumen real pasa a keyset (fecha/score, id).
export const encodeCursor = (offset: number): string =>
  Buffer.from(String(offset)).toString(CURSOR_ENCODING);

/** `undefined` -> 0 (primera página). Un cursor corrupto no se interpreta como la primera página: VALIDATION_ERROR. */
export function decodeCursor(cursor: string | undefined): Result<number, DomainError> {
  if (cursor === undefined) return ok(0);
  const text = Buffer.from(cursor, CURSOR_ENCODING).toString();
  // El viaje de ida y vuelta rechaza lo que base64url "perdona" (caracteres inválidos, relleno).
  const valid = DIGITS.test(text) && Buffer.from(text).toString(CURSOR_ENCODING) === cursor;
  return valid && Number.isSafeInteger(Number(text))
    ? ok(Number(text))
    : err(new DomainError('VALIDATION_ERROR', 'Cursor inválido'));
}
