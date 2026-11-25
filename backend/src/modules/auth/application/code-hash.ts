import { createHash } from 'node:crypto';

/** SHA-256 hex del código de reclamo (el dominio recibe esta función inyectada: sin `node:*` en domain). */
export const hashCode = (code: string): string => createHash('sha256').update(code).digest('hex');
