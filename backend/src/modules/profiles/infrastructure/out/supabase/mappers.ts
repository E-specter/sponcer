import { Declared, type ProfileRole, type ProfileStatus, type Service } from '@sponcer/contracts';
import type { Profile } from '../../../domain/profile';

export interface ProfileRow {
  id: string;
  ig_handle: string;
  role: ProfileRole;
  status: ProfileStatus;
  owner_user_id: string | null;
  declared: unknown;
}

export interface ServiceRow {
  id: string;
  profile_id: string;
  type: Service['type'];
  format: Service['format'];
  price_pen: number;
  description: string;
}

export const profileFromRow = (r: ProfileRow): Profile => ({
  id: r.id,
  handle: r.ig_handle,
  role: r.role,
  status: r.status,
  ownerUserId: r.owner_user_id,
  declared: r.declared ? Declared.parse(r.declared) : null,
});

export const profileToRow = (p: Profile, now: Date) => ({
  id: p.id,
  ig_handle: p.handle,
  role: p.role,
  status: p.status,
  owner_user_id: p.ownerUserId,
  declared: p.declared,
  updated_at: now.toISOString(),
});

export const serviceFromRow = (r: ServiceRow): Service => ({
  id: r.id,
  type: r.type,
  format: r.format,
  pricePen: r.price_pen,
  description: r.description,
});
