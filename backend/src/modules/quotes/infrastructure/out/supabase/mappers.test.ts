import { describe, expect, it } from 'vitest';
import { quoteFromRow, quoteToRow } from './mappers';

const FIRST = 1;
const SECOND = 2;
const row = {
  id: 'q',
  campaign_id: 'k',
  service_id: null,
  creator_profile_id: 'c',
  requester_profile_id: 'r',
  status: 'sent' as const,
  amount_pen: null,
  message: 'hola',
  created_at: '2026-01-01T10:00:00+00:00',
  updated_at: '2026-01-01T10:00:00+00:00',
};
const event = (seq: number, to: 'draft' | 'sent') => ({
  seq,
  from_status: null,
  to_status: to,
  actor_profile_id: 'r',
  note: null,
  at: '2026-01-01T10:00:00+00:00',
});

describe('quote mappers', () => {
  it('ordena el historial por seq y normaliza fechas a ISO con Z', () => {
    const q = quoteFromRow(row, [event(SECOND, 'sent'), event(FIRST, 'draft')]);
    expect(q.history.map((e) => e.to)).toEqual(['draft', 'sent']);
    expect(q.createdAt).toBe('2026-01-01T10:00:00.000Z');
  });

  it('dominio -> fila conserva las columnas', () => {
    expect(quoteToRow(quoteFromRow(row, []))).toMatchObject({
      id: 'q',
      status: 'sent',
      campaign_id: 'k',
      service_id: null,
      amount_pen: null,
    });
  });
});
