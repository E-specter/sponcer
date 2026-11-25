import { describe, expect, it } from 'vitest';
import { MAX_CARD_BIO, type Declared, type IgProfileSnapshot } from '@sponcer/contracts';
import { fixtureProfiles } from '@sponcer/contracts/fixtures';
import { cardBio, truncateBio } from './profile';

const snap = (biography: string): IgProfileSnapshot => ({
  ...fixtureProfiles[0]!.snapshot,
  biography,
});
const declared = (shortBio?: string): Declared => ({
  role: 'creator',
  niches: ['moda'],
  accountType: 'unknown',
  shortBio,
});

describe('cardBio', () => {
  it('prefiere la declarada y marca la fuente', () => {
    expect(cardBio(declared('Mi bio'), snap('De IG'))).toEqual({
      bio: 'Mi bio',
      bioSource: 'declared',
    });
  });

  it('sin declarada (o en blanco) usa la de Instagram', () => {
    expect(cardBio(declared('  '), snap('De IG'))).toEqual({
      bio: 'De IG',
      bioSource: 'instagram',
    });
    expect(cardBio(null, snap('De IG'))).toEqual({ bio: 'De IG', bioSource: 'instagram' });
  });

  it('sin ninguna: null', () => {
    expect(cardBio(null, snap(''))).toEqual({ bio: null, bioSource: null });
    expect(cardBio(null, null)).toEqual({ bio: null, bioSource: null });
  });
});

describe('truncateBio', () => {
  it('no toca textos dentro del límite y colapsa espacios', () => {
    expect(truncateBio('a  b\nc')).toBe('a b c');
  });

  it('recorta sin partir palabras y añade "…" (máx. MAX_CARD_BIO + 1)', () => {
    const long = 'palabra '.repeat(MAX_CARD_BIO);
    const out = truncateBio(long);
    expect(out.endsWith('palabra…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(MAX_CARD_BIO + 1);
  });

  it('una sola palabra enorme se corta en seco', () => {
    expect(truncateBio('x'.repeat(MAX_CARD_BIO * 2))).toBe(`${'x'.repeat(MAX_CARD_BIO)}…`);
  });
});
