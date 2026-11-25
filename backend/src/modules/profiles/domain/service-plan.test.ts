import { describe, expect, it } from 'vitest';
import type { Service } from '@sponcer/contracts';
import { planServiceReplace } from './service-plan';

const svc = (id: string, pricePen: number): Service => ({
  id,
  type: 'canje',
  format: 'post',
  pricePen,
  description: '',
});
const inp = (pricePen: number) => ({
  type: 'canje' as const,
  format: 'post' as const,
  pricePen,
  description: '',
});

const P10 = 10;
const P20 = 20;
const P30 = 30;
const P99 = 99;

describe('planServiceReplace', () => {
  it('conserva ids de filas idénticas aunque cambie el orden', () => {
    const plan = planServiceReplace([svc('a', P10), svc('b', P20)], [inp(P20), inp(P10)]);
    expect(plan).toEqual({ assign: ['b', 'a'], remove: [] });
  });
  it('reutiliza sobrantes por orden, inserta lo que falta y borra lo que sobra', () => {
    expect(planServiceReplace([svc('a', P10)], [inp(P10), inp(P30)])).toEqual({
      assign: ['a', null],
      remove: [],
    });
    expect(planServiceReplace([svc('a', P10), svc('b', P20)], [inp(P99)])).toEqual({
      assign: ['a'],
      remove: ['b'],
    });
  });
});
