import { describe, expect, it } from 'vitest';
import type { LiveBioReader } from '../../../src/modules/auth/application/ports/out/live-bio-reader';

const MISSING_HANDLE = 'cuenta.que.no.existe.zz';
const ALLOWED_ERRORS = ['NOT_FOUND', 'UPSTREAM_ERROR', 'RATE_LIMITED'];

/**
 * Suite del puerto out `LiveBioReader` (lectura en vivo, ADR-002).
 * `knownHandle` es un handle que el adaptador debe poder leer (en mock, uno de los fixtures).
 */
export function describeLiveBioReaderContract(
  factory: () => LiveBioReader | Promise<LiveBioReader>,
  opts: { knownHandle: string },
): void {
  describe('LiveBioReader (contrato del puerto)', () => {
    it('lee un handle conocido con la forma { biography, isPrivate, isBusiness }', async () => {
      const r = await (await factory()).read(opts.knownHandle);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(typeof r.value.biography).toBe('string');
      expect(typeof r.value.isPrivate).toBe('boolean');
      expect(typeof r.value.isBusiness).toBe('boolean');
    });

    it('un handle inexistente da un Result (ok o error de dominio acotado), nunca una excepción', async () => {
      const r = await (await factory()).read(MISSING_HANDLE);
      if (!r.ok) expect(ALLOWED_ERRORS).toContain(r.error.code);
    });
  });
}
