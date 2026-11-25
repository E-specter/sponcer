import { describe, expect, it } from 'vitest';
import { createWindowLimiter } from './rate-limit';

const LIMIT = 2;
const WINDOW_MS = 1000;

describe('createWindowLimiter', () => {
  it('permite hasta el límite por clave y vuelve a permitir al salir de la ventana', () => {
    let t = 0;
    const l = createWindowLimiter({ limit: LIMIT, windowMs: WINDOW_MS, now: () => new Date(t) });
    expect([l.tryTake('a'), l.tryTake('a'), l.tryTake('a'), l.tryTake('b')]).toEqual([
      true,
      true,
      false,
      true,
    ]);
    t = WINDOW_MS + 1;
    expect(l.tryTake('a')).toBe(true);
  });
});
