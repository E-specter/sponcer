import type { ProfileRole } from '@sponcer/contracts';
import type { ClaimRecord } from '../../../domain/claim';

export interface ClaimRow {
  id: string;
  user_id: string;
  ig_handle: string;
  role: ProfileRole;
  code_hash: string;
  expires_at: string;
  consumed: boolean;
}

export const claimFromRow = (r: ClaimRow): ClaimRecord => ({
  id: r.id,
  userId: r.user_id,
  handle: r.ig_handle,
  role: r.role,
  codeHash: r.code_hash,
  expiresAt: new Date(r.expires_at),
  consumed: r.consumed,
});

export const claimToRow = (c: ClaimRecord): ClaimRow => ({
  id: c.id,
  user_id: c.userId,
  ig_handle: c.handle,
  role: c.role,
  code_hash: c.codeHash,
  expires_at: c.expiresAt.toISOString(),
  consumed: c.consumed,
});

/** `Authorization: Bearer <jwt>`; el esquema no distingue mayúsculas. */
export const BEARER_REGEX = /^bearer\s+(\S+)$/i;
const JWT_PARTS = 3;
export const bearerToken = (header: string | undefined): string | null => {
  const token = header?.match(BEARER_REGEX)?.[1];
  return token && token.split('.').length === JWT_PARTS ? token : null;
};
