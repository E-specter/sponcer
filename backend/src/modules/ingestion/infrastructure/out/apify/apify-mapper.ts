// Capa anticorrupción (ADR-001): único lugar que conoce los nombres de campos de Apify.
import { z } from 'zod';
import { IgProfileSnapshot, MAX_SNAPSHOT_POSTS, type IgPost } from '@sponcer/contracts';
import { DomainError } from '../../../../../shared/errors';
import { logger } from '../../../../../shared/logger';
import { err, ok, type Result } from '../../../../../shared/result';

const ApifyPost = z.object({
  id: z.string(),
  type: z.string().nullish(),
  caption: z.string().nullish(),
  hashtags: z.array(z.string()).nullish(),
  likesCount: z.number().nullish(),
  commentsCount: z.number().nullish(),
  videoViewCount: z.number().nullish(),
  timestamp: z.string(),
});
type ApifyPost = z.infer<typeof ApifyPost>;

export const ApifyProfile = z.object({
  username: z.string(),
  fullName: z.string().nullish(),
  biography: z.string().nullish(),
  followersCount: z.number().nullish(),
  followsCount: z.number().nullish(),
  postsCount: z.number().nullish(),
  isBusinessAccount: z.boolean().nullish(),
  businessCategoryName: z.string().nullish(),
  private: z.boolean().nullish(),
  verified: z.boolean().nullish(),
  profilePicUrl: z.string().nullish(),
  profilePicUrlHD: z.string().nullish(),
  externalUrl: z.string().nullish(),
  latestPosts: z.array(ApifyPost).nullish(),
});

const POST_TYPES: Record<string, IgPost['type']> = {
  Image: 'image',
  Video: 'video',
  Sidecar: 'carousel',
};

// Primer "#" de un hashtag. Coincide con "#moda" (lo quita); no coincide con "moda".
// Probar: https://regex101.com/?regex=%5E%23&testString=%23moda&flavor=javascript
const LEADING_HASH = /^#/;

// Apify usa -1 cuando el autor oculta los "me gusta"; el dominio no admite negativos.
const nonNegative = (n: number | null | undefined): number => Math.max(0, Math.round(n ?? 0));
const validUrl = (v: string | null | undefined): string | null =>
  z.url().safeParse(v).success ? (v as string) : null;

function mapPost(p: ApifyPost): IgPost {
  const type = POST_TYPES[p.type ?? ''] ?? 'image';
  return {
    id: p.id,
    type,
    caption: p.caption ?? '',
    hashtags: (p.hashtags ?? []).map((h) => h.replace(LEADING_HASH, '').toLowerCase()),
    likes: nonNegative(p.likesCount),
    comments: nonNegative(p.commentsCount),
    views: type === 'video' && p.videoViewCount != null ? nonNegative(p.videoViewCount) : null,
    postedAt: new Date(p.timestamp).toISOString(),
  };
}

/** JSON crudo del actor → `IgProfileSnapshot`. Cualquier forma inesperada es UPSTREAM_ERROR. */
export function mapApifyProfile(raw: unknown, now: Date): Result<IgProfileSnapshot, DomainError> {
  const parsed = ApifyProfile.safeParse(raw);
  if (!parsed.success) {
    logger.warn('respuesta inesperada del proveedor', parsed.error.issues);
    return err(new DomainError('UPSTREAM_ERROR', 'Respuesta inesperada del proveedor'));
  }
  const a = parsed.data;
  const snapshot = IgProfileSnapshot.safeParse({
    handle: a.username,
    fullName: a.fullName ?? '',
    biography: a.biography ?? '',
    followers: nonNegative(a.followersCount),
    following: nonNegative(a.followsCount),
    postsCount: nonNegative(a.postsCount),
    // ADR-001 §4: profesional si es business o tiene categoría de negocio.
    isBusiness: a.isBusinessAccount === true || Boolean(a.businessCategoryName),
    businessCategory: a.businessCategoryName || null,
    // Falla cerrado: si el proveedor omite el flag, la cuenta se trata como privada.
    isPrivate: a.private !== false,
    isVerified: a.verified === true,
    // Prefiere HD; la URL es de Instagram y caduca: ingest-profile la copia a Storage.
    profilePicUrl: validUrl(a.profilePicUrlHD) ?? validUrl(a.profilePicUrl),
    externalUrl: validUrl(a.externalUrl),
    posts: (a.latestPosts ?? []).slice(0, MAX_SNAPSHOT_POSTS).map(mapPost),
    fetchedAt: now.toISOString(),
    source: 'apify',
  });
  if (!snapshot.success) {
    logger.warn('perfil del proveedor inválido', snapshot.error.issues);
    return err(new DomainError('UPSTREAM_ERROR', 'Perfil del proveedor inválido'));
  }
  return ok(snapshot.data);
}
