import { describe, expect, it } from 'vitest';
import { CLAIM_CODE_REGEX } from '@sponcer/contracts';
import { hashCode } from '../application/code-hash';
import { bioContainsCode, generateClaimCode, isExpired, type ClaimRecord } from './claim';

const SAMPLE_COUNT = 200;
const FIRST_INDEX = 0;
const MINUTE_MS = 60_000;

describe('código de reclamo', () => {
  it('siempre cumple CLAIM_CODE_REGEX', () => {
    const randomIndex = (max: number) => Math.floor(Math.random() * max);
    const codes = Array.from({ length: SAMPLE_COUNT }, () => generateClaimCode(randomIndex));
    expect(codes.every((c) => CLAIM_CODE_REGEX.test(c))).toBe(true);
  });

  it('se valida contra el hash dentro de una bio más larga', () => {
    const code = generateClaimCode(() => FIRST_INDEX);
    const hash = hashCode(code);
    expect(bioContainsCode(`Hola 👋 ${code} contacto@x.pe`, hash, hashCode)).toBe(true);
    expect(bioContainsCode('Hola sin código', hash, hashCode)).toBe(false);
    expect(bioContainsCode('sponcer-ZZZZZZ', hash, hashCode)).toBe(false);
  });

  it('expira en la fecha de vigencia', () => {
    const expiresAt = new Date(Date.now() + MINUTE_MS);
    const claim = { expiresAt } as ClaimRecord;
    expect(isExpired(claim, new Date())).toBe(false);
    expect(isExpired(claim, new Date(expiresAt.getTime() + 1))).toBe(true);
  });
});
