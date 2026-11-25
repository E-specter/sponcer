import {
  tierFor,
  type Declared,
  type IgProfileSnapshot,
  type Niche,
  type Tier,
} from '@sponcer/contracts';

export interface ProfileFeatures {
  tier: Tier;
  followers: number;
  /** Promedio de (likes + comentarios) / seguidores sobre los posts del snapshot (≤ 12). */
  engagementRate: number;
  hashtags: string[];
  /** Texto del perfil para el embedding: bio + bio declarada + captions. */
  text: string;
}

const average = (xs: number[]): number =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

export function extractFeatures(
  snapshot: IgProfileSnapshot,
  declared: Declared | null,
): ProfileFeatures {
  const { followers, posts } = snapshot;
  return {
    tier: tierFor(followers),
    followers,
    engagementRate: followers ? average(posts.map((p) => (p.likes + p.comments) / followers)) : 0,
    hashtags: [...new Set(posts.flatMap((p) => p.hashtags))],
    text: [snapshot.biography, declared?.shortBio ?? '', ...posts.map((p) => p.caption)]
      .filter(Boolean)
      .join('. '),
  };
}

export function declaredNiches(declared: Declared | null): Niche[] {
  if (declared?.role === 'creator') return declared.niches;
  if (declared?.role === 'brand') return declared.targetNiches;
  return [];
}
