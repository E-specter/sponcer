import { describe, expect, it } from 'vitest';
import { notificationFromRow } from './supabase-adapters';

describe('notificationFromRow', () => {
  it('mapea columnas y normaliza fechas', () => {
    const n = notificationFromRow({
      id: 'n',
      user_id: 'u',
      kind: 'match_created',
      payload: { matchId: 'm' },
      read_at: null,
      created_at: '2026-01-01T10:00:00+00:00',
    });
    expect(n).toEqual({
      id: 'n',
      userId: 'u',
      kind: 'match_created',
      payload: { matchId: 'm' },
      readAt: null,
      createdAt: '2026-01-01T10:00:00.000Z',
    });
  });
});
