import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from './cursor';

const OFFSET = 42;

describe('cursor', () => {
  it('ida y vuelta, y sin cursor es la primera página', () => {
    expect(decodeCursor(encodeCursor(OFFSET))).toEqual({ ok: true, value: OFFSET });
    expect(decodeCursor(undefined)).toEqual({ ok: true, value: 0 });
  });

  it.each([
    'abc',
    '-5',
    '1.5x',
    '%%%',
    '',
    'MQ==',
    encodeCursor(1).toUpperCase() + '!',
    Buffer.from('-1').toString('base64url'),
    Buffer.from('1.5').toString('base64url'),
    Buffer.from('12e3').toString('base64url'),
  ])('rechaza el cursor corrupto %j', (bad) => {
    const r = decodeCursor(bad);
    expect(!r.ok && r.error.code).toBe('VALIDATION_ERROR');
  });
});
