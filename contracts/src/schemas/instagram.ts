import { z } from 'zod';
import { MAX_SNAPSHOT_POSTS } from './limits';
import { IgHandle, IsoDate } from './common';

/** Modelo de dominio de un post. El JSON del proveedor nunca sale del adaptador (ACL, ADR-001). */
export const IgPost = z.object({
  id: z.string(),
  type: z.enum(['image', 'video', 'carousel']),
  caption: z.string(),
  hashtags: z.array(z.string()),
  likes: z.number().int().nonnegative(),
  comments: z.number().int().nonnegative(),
  views: z.number().int().nonnegative().nullable(),
  postedAt: IsoDate,
});
export type IgPost = z.infer<typeof IgPost>;

export const IgProfileSnapshot = z.object({
  handle: IgHandle,
  fullName: z.string(),
  biography: z.string(),
  followers: z.number().int().nonnegative(),
  following: z.number().int().nonnegative(),
  postsCount: z.number().int().nonnegative(),
  isBusiness: z.boolean(),
  businessCategory: z.string().nullable(),
  isPrivate: z.boolean(),
  isVerified: z.boolean(),
  profilePicUrl: z.url().nullable(),
  externalUrl: z.url().nullable(),
  posts: z.array(IgPost).max(MAX_SNAPSHOT_POSTS),
  fetchedAt: IsoDate,
  source: z.enum(['mock', 'apify']),
});
export type IgProfileSnapshot = z.infer<typeof IgProfileSnapshot>;
