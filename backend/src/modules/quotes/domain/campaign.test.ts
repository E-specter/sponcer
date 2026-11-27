import { describe, expect, it } from 'vitest';
import { fixtureSocial } from '@sponcer/contracts/fixtures';
import { campaignStats, canAdvance } from './campaign';

const base = fixtureSocial.quotes[0]!;
const quote = (status: typeof base.status, amountPen: number | null) => ({
  ...base,
  status,
  amountPen,
});

describe('canAdvance', () => {
  it('solo avanza o se queda igual', () => {
    expect(canAdvance('draft', 'active')).toBe(true);
    expect(canAdvance('active', 'closed')).toBe(true);
    expect(canAdvance('active', 'active')).toBe(true);
    expect(canAdvance('closed', 'active')).toBe(false);
    expect(canAdvance('active', 'draft')).toBe(false);
  });
});

describe('campaignStats', () => {
  it('cuenta por estado y suma solo aceptadas y completadas', () => {
    const s = campaignStats([
      quote('sent', 100),
      quote('accepted', 200),
      quote('completed', 300),
      quote('completed', null),
      quote('rejected', 999),
    ]);
    expect(s).toEqual({
      quotes: 5,
      byStatus: { sent: 1, accepted: 1, completed: 2, rejected: 1 },
      committedPen: 500,
    });
  });

  it('sin cotizaciones es todo cero', () => {
    expect(campaignStats([])).toEqual({ quotes: 0, byStatus: {}, committedPen: 0 });
  });
});
