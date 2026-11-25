import { describe, expect, it } from 'vitest';
import type { ProfileCard } from '@sponcer/contracts';
import { allOf } from './specification';
import {
  excludeIds,
  hasAnyNiche,
  inTiers,
  maxPricePen,
  minBudgetPen,
  minEngagement,
} from './specifications';

const PRICE = 500;
const BUDGET = 8_000;
const ENGAGEMENT = 0.03;
const FOLLOWERS = 20_000;
const ENGAGEMENT_STEP = 0.01;

const card = (over: Partial<ProfileCard> = {}): ProfileCard => ({
  id: '00000000-0000-4000-8000-000000000001',
  handle: 'a.demo',
  role: 'creator',
  fullName: 'A',
  profilePicUrl: null,
  status: 'verified',
  niches: ['moda', 'belleza'],
  tier: 'micro',
  followers: FOLLOWERS,
  engagementRate: ENGAGEMENT,
  sector: null,
  minServicePricePen: PRICE,
  budgetMaxPen: null,
  ...over,
});

describe('Specifications', () => {
  it('hasAnyNiche: al menos un nicho en común', () => {
    expect(hasAnyNiche(['belleza', 'viajes']).isSatisfiedBy(card())).toBe(true);
    expect(hasAnyNiche(['viajes']).isSatisfiedBy(card())).toBe(false);
  });

  it('inTiers', () => {
    expect(inTiers(['micro', 'mid']).isSatisfiedBy(card())).toBe(true);
    expect(inTiers(['nano']).isSatisfiedBy(card())).toBe(false);
  });

  it('minEngagement es inclusivo', () => {
    expect(minEngagement(ENGAGEMENT).isSatisfiedBy(card())).toBe(true);
    expect(minEngagement(ENGAGEMENT + ENGAGEMENT_STEP).isSatisfiedBy(card())).toBe(false);
  });

  it('maxPricePen: precio mínimo del creador; sin servicios no cumple', () => {
    expect(maxPricePen(PRICE).isSatisfiedBy(card())).toBe(true);
    expect(maxPricePen(PRICE - 1).isSatisfiedBy(card())).toBe(false);
    expect(maxPricePen(PRICE).isSatisfiedBy(card({ minServicePricePen: null }))).toBe(false);
  });

  it('minBudgetPen: presupuesto máximo de la marca; sin presupuesto no cumple', () => {
    const brand = card({ role: 'brand', budgetMaxPen: BUDGET });
    expect(minBudgetPen(BUDGET).isSatisfiedBy(brand)).toBe(true);
    expect(minBudgetPen(BUDGET + 1).isSatisfiedBy(brand)).toBe(false);
    expect(minBudgetPen(1).isSatisfiedBy(card())).toBe(false);
  });

  it('excludeIds: propios, descartados o con interés', () => {
    const c = card();
    expect(excludeIds(new Set([c.id])).isSatisfiedBy(c)).toBe(false);
    expect(excludeIds(new Set(['otro'])).isSatisfiedBy(c)).toBe(true);
  });

  it('allOf combina con AND y sin specs acepta todo', () => {
    const c = card();
    expect(allOf(hasAnyNiche(['moda']), inTiers(['micro'])).isSatisfiedBy(c)).toBe(true);
    expect(allOf(hasAnyNiche(['moda']), inTiers(['mega'])).isSatisfiedBy(c)).toBe(false);
    expect(allOf().isSatisfiedBy(c)).toBe(true);
  });
});
