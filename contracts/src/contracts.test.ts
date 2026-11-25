import { describe, expect, it } from 'vitest';
import {
  BrandDeclared,
  CLAIM_CODE_REGEX,
  IgHandle,
  ImageUrl,
  QUOTE_STATUSES,
  QUOTE_TRANSITIONS,
  FOLLOWERS_MICRO,
  tierFor,
} from './index';
import { demoUser, fixtureProfiles, fixtureSocial } from '../fixtures/index';

const TERMINAL = ['rejected', 'completed', 'cancelled'];
const EXPECTED_CREATORS = 20;
const EXPECTED_BRANDS = 10;
const LOW_BUDGET = 1;
const HIGH_BUDGET = 9;

describe('contratos', () => {
  it('normaliza handles y rechaza inválidos', () => {
    expect(IgHandle.parse('@Sofi.Cocina')).toBe('sofi.cocina');
    expect(IgHandle.safeParse('sofi cocina').success).toBe(false);
  });

  it('el código de verificación se encuentra dentro de una bio', () => {
    expect(CLAIM_CODE_REGEX.test('hola 👋 sponcer-K7M2QX gracias')).toBe(true);
    expect(CLAIM_CODE_REGEX.test('sponcer-K0M2QX')).toBe(false);
  });

  it('acepta imágenes absolutas o rutas locales seguras', () => {
    const ok = ['/fixtures/profiles/sofi.moda.demo.webp', 'https://x.supabase.co/storage/a.webp'];
    const bad = ['//evil.com/x.webp', 'fixtures/x.webp', '/a/../b.webp'];
    ok.forEach((v) => expect(ImageUrl.safeParse(v).success).toBe(true));
    bad.forEach((v) => expect(ImageUrl.safeParse(v).success).toBe(false));
  });

  it('calcula el tier en los bordes', () => {
    expect(tierFor(FOLLOWERS_MICRO - 1)).toBe('nano');
    expect(tierFor(FOLLOWERS_MICRO)).toBe('micro');
  });

  it('presupuesto mínimo ≤ máximo', () => {
    const base = {
      role: 'brand',
      sector: 'deporte',
      objectives: ['ventas'],
      targetNiches: ['fitness'],
    } as const;
    expect(
      BrandDeclared.safeParse({ ...base, budgetMinPen: HIGH_BUDGET, budgetMaxPen: LOW_BUDGET })
        .success,
    ).toBe(false);
    expect(
      BrandDeclared.safeParse({ ...base, budgetMinPen: LOW_BUDGET, budgetMaxPen: HIGH_BUDGET })
        .success,
    ).toBe(true);
  });

  it('la máquina de cotizaciones solo apunta a estados válidos y los terminales no salen', () => {
    QUOTE_STATUSES.forEach((s) =>
      QUOTE_TRANSITIONS[s].forEach((to) => expect(QUOTE_STATUSES).toContain(to)),
    );
    TERMINAL.forEach((s) => expect(QUOTE_TRANSITIONS[s as never]).toHaveLength(0));
  });
});

describe('fixtures', () => {
  it('cargan y son coherentes', () => {
    expect(fixtureProfiles.filter((p) => p.role === 'creator')).toHaveLength(EXPECTED_CREATORS);
    expect(fixtureProfiles.filter((p) => p.role === 'brand')).toHaveLength(EXPECTED_BRANDS);
    const ids = new Set(fixtureProfiles.map((p) => p.id));
    expect(ids.size).toBe(fixtureProfiles.length);
    fixtureSocial.matches.forEach((m) => {
      expect(ids.has(m.creatorProfileId) && ids.has(m.brandProfileId)).toBe(true);
    });
    const owned = fixtureProfiles.filter((p) => p.ownerUserId === demoUser.id).map((p) => p.role);
    expect(owned.sort()).toEqual(['brand', 'creator']);
    fixtureProfiles.filter((p) => p.declared).forEach((p) => expect(p.declared!.role).toBe(p.role));
  });
});
