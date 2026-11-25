import { describe, expect, it } from 'vitest';
import { profileFromRow, profileToRow } from './mappers';

describe('profile mappers', () => {
  it('fila -> dominio -> fila conserva los campos', () => {
    const row = {
      id: 'i',
      ig_handle: 'h',
      role: 'creator' as const,
      status: 'verified' as const,
      owner_user_id: 'u',
      declared: null,
    };
    const p = profileFromRow(row);
    expect(p).toEqual({
      id: 'i',
      handle: 'h',
      role: 'creator',
      status: 'verified',
      ownerUserId: 'u',
      declared: null,
    });
    expect(profileToRow(p, new Date(0))).toMatchObject(row);
  });
});
