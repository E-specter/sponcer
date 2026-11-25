import { CLAIM_CODE_REGEX, type ProfileRole } from '@sponcer/contracts';

export interface ClaimRecord {
  id: string;
  userId: string;
  handle: string;
  role: ProfileRole;
  /** El código en claro solo lo ve el usuario; aquí se guarda su hash. */
  codeHash: string;
  expiresAt: Date;
  consumed: boolean;
}

const CODE_PREFIX = 'sponcer-';
const CODE_LENGTH = 6;
// Mismo conjunto que la clase [A-HJKMNP-Z2-9] de CLAIM_CODE_REGEX (sin 0/O, 1/I/L).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateClaimCode(randomIndex: (max: number) => number): string {
  const chars = Array.from({ length: CODE_LENGTH }, () =>
    CODE_ALPHABET.charAt(randomIndex(CODE_ALPHABET.length)),
  );
  return CODE_PREFIX + chars.join('');
}

/** True si alguna cadena con forma de código en la bio coincide con el hash guardado. */
export function bioContainsCode(
  bio: string,
  codeHash: string,
  hash: (code: string) => string,
): boolean {
  // Versión global de CLAIM_CODE_REGEX: busca todos los códigos de una bio.
  // Acepta "sponcer-K7M2QX y sponcer-ABCDEF" (2 códigos); rechaza "sponcer-K0M2QX" (tiene 0).
  // Probar: https://regex101.com/?regex=sponcer-%5BA-HJKMNP-Z2-9%5D%7B6%7D&flags=g&testString=sponcer-K7M2QX+y+sponcer-ABCDEF&flavor=javascript
  const candidates = bio.match(new RegExp(CLAIM_CODE_REGEX, 'g')) ?? [];
  return candidates.some((c) => hash(c) === codeHash);
}

export const isExpired = (claim: ClaimRecord, now: Date): boolean =>
  now.getTime() >= claim.expiresAt.getTime();
