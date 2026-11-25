import { describe, expect, it } from 'vitest';
import {
  QUOTE_STATUSES,
  QUOTE_TRANSITIONS,
  QUOTE_TRANSITION_ACTOR,
  type QuoteRecord,
  type QuoteStatus,
} from '@sponcer/contracts';
import { applyTransition, newQuote } from './quote';

const REQUESTER = '11111111-1111-4111-8111-111111111111';
const CREATOR = '22222222-2222-4222-8222-222222222222';
const STRANGER = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-11-25T10:00:00Z');
const INITIAL_AMOUNT = 300;
const NEGOTIATED_AMOUNT = 250;

const base = newQuote({
  id: '44444444-4444-4444-8444-444444444444',
  serviceId: '55555555-5555-4555-8555-555555555555',
  creatorProfileId: CREATOR,
  requesterProfileId: REQUESTER,
  message: 'hola',
  amountPen: INITIAL_AMOUNT,
  now: NOW,
});
const inStatus = (status: QuoteStatus): QuoteRecord => ({ ...base, status });

const actorFor = (to: QuoteStatus): string =>
  QUOTE_TRANSITION_ACTOR[to] === 'creator' ? CREATOR : REQUESTER;

const pairs = QUOTE_STATUSES.flatMap((from) => QUOTE_STATUSES.map((to) => ({ from, to })));
const valid = pairs.filter((p) => QUOTE_TRANSITIONS[p.from].includes(p.to));
const invalid = pairs.filter((p) => !QUOTE_TRANSITIONS[p.from].includes(p.to));

describe('máquina de estados de cotizaciones', () => {
  it('nace en draft con historial inicial', () => {
    expect(base.status).toBe('draft');
    expect(base.history).toHaveLength(1);
  });

  it.each(valid)('permite $from -> $to con el actor correcto', ({ from, to }) => {
    const r = applyTransition(inStatus(from), { actorProfileId: actorFor(to), to }, NOW);
    expect(r.ok && r.value.status).toBe(to);
    expect(r.ok && r.value.history.at(-1)).toMatchObject({ from, to });
  });

  it.each(invalid)('rechaza $from -> $to con INVALID_TRANSITION', ({ from, to }) => {
    const r = applyTransition(inStatus(from), { actorProfileId: actorFor(to), to }, NOW);
    expect(!r.ok && r.error.code).toBe('INVALID_TRANSITION');
  });

  it.each(valid)('rechaza a un tercero en $from -> $to', ({ from, to }) => {
    const r = applyTransition(inStatus(from), { actorProfileId: STRANGER, to }, NOW);
    expect(!r.ok && r.error.code).toBe('FORBIDDEN');
  });

  const wrongActor = valid.filter((p) => QUOTE_TRANSITION_ACTOR[p.to] !== 'any');
  it.each(wrongActor)('rechaza al actor equivocado en $from -> $to', ({ from, to }) => {
    const wrong = actorFor(to) === CREATOR ? REQUESTER : CREATOR;
    const r = applyTransition(inStatus(from), { actorProfileId: wrong, to }, NOW);
    expect(!r.ok && r.error.code).toBe('FORBIDDEN');
  });

  it('negotiating puede cambiar el monto; otros estados lo ignoran', () => {
    const neg = applyTransition(
      inStatus('sent'),
      { actorProfileId: CREATOR, to: 'negotiating', amountPen: NEGOTIATED_AMOUNT },
      NOW,
    );
    expect(neg.ok && neg.value.amountPen).toBe(NEGOTIATED_AMOUNT);
    const acc = applyTransition(
      inStatus('sent'),
      { actorProfileId: CREATOR, to: 'accepted', amountPen: NEGOTIATED_AMOUNT },
      NOW,
    );
    expect(acc.ok && acc.value.amountPen).toBe(INITIAL_AMOUNT);
  });
});
