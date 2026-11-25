import {
  MAX_CARD_BIO,
  type Classification,
  type Declared,
  type IgProfileSnapshot,
  type ProfileCard,
  type ProfileDetail,
  type ProfileRole,
  type ProfileStatus,
  type ProfileSummary,
  type Service,
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

const ELLIPSIS = '…';
const WHITESPACE = /\s+/g; // colapsa saltos de línea y espacios repetidos de la bio

/** Recorta a `max` caracteres sin partir palabras si es posible y añade "…". */
export function truncateBio(text: string, max: number = MAX_CARD_BIO): string {
  const clean = text.replace(WHITESPACE, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}${ELLIPSIS}`;
}

/** Bio de la tarjeta: la declarada en Sponcer o, si no hay, la de Instagram; `null` si no hay ninguna. */
export function cardBio(
  declared: Declared | null,
  snap: IgProfileSnapshot | null,
): Pick<ProfileCard, 'bio' | 'bioSource'> {
  const own = declared?.shortBio?.trim();
  if (own) return { bio: truncateBio(own), bioSource: 'declared' };
  const ig = snap?.biography.trim();
  return ig ? { bio: truncateBio(ig), bioSource: 'instagram' } : { bio: null, bioSource: null };
}

export function toCard(
  summary: ProfileSummary,
  declared: Declared | null,
  classification: Classification | null,
  services: Service[],
  snap: IgProfileSnapshot | null = null,
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
    ...cardBio(declared, snap),
  };
}
