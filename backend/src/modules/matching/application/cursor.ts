const CURSOR_BASE = 'base64url';

// shortcut: cursor = offset codificado (listas pequeñas por perfil); con volumen real pasa a keyset (score/fecha, id).
export const encodeCursor = (offset: number): string =>
  Buffer.from(String(offset)).toString(CURSOR_BASE);

/** `undefined` -> 0; un cursor corrupto -> null. */
export const decodeCursor = (cursor: string | undefined): number | null => {
  if (cursor === undefined) return 0;
  const n = Number(Buffer.from(cursor, CURSOR_BASE).toString());
  return Number.isInteger(n) && n >= 0 ? n : null;
};
