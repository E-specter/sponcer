import type {
  Classification,
  Declared,
  IgProfileSnapshot,
  ProfileCard,
  ProfileDetail,
  ProfileRole,
  ProfileStatus,
  ProfileSummary,
  Service,
} from '@sponcer/contracts';

export interface Profile {
  id: string;
  handle: string;
  role: ProfileRole;
  status: ProfileStatus;
  ownerUserId: string | null;
  declared: Declared | null;
}

export const isRemoved = (p: Profile): boolean => p.status === 'removed';

export function toSummary(p: Profile, snap: IgProfileSnapshot | null): ProfileSummary {
  return {
    id: p.id,
    handle: p.handle,
    role: p.role,
    fullName: snap?.fullName ?? p.handle,
    profilePicUrl: snap?.profilePicUrl ?? null,
    status: p.status,
  };
}

export function toIngested(snap: IgProfileSnapshot | null, now: Date): ProfileDetail['ingested'] {
  return {
    biography: snap?.biography ?? '',
    followers: snap?.followers ?? 0,
    following: snap?.following ?? 0,
    postsCount: snap?.postsCount ?? 0,
    isVerified: snap?.isVerified ?? false,
    externalUrl: snap?.externalUrl ?? null,
    fetchedAt: snap?.fetchedAt ?? now.toISOString(),
  };
}

export function toCard(
  summary: ProfileSummary,
  declared: Declared | null,
  classification: Classification | null,
  services: Service[],
): ProfileCard {
  const brand = declared?.role === 'brand' ? declared : null;
  return {
    ...summary,
    niches: classification?.niches.map((n) => n.niche) ?? [],
    tier: classification?.tier ?? 'nano',
    followers: classification?.followers ?? 0,
    engagementRate: classification?.engagementRate ?? 0,
    sector: brand?.sector ?? null,
    minServicePricePen: services.length ? Math.min(...services.map((s) => s.pricePen)) : null,
    budgetMaxPen: brand?.budgetMaxPen ?? null,
  };
}
