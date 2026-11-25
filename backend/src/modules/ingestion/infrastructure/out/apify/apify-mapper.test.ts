import { describe, expect, it } from 'vitest';
import { IgProfileSnapshot, MAX_SNAPSHOT_POSTS } from '@sponcer/contracts';
import { mapApifyProfile } from './apify-mapper';

const NOW = new Date('2026-11-25T10:00:00Z');
const MANY_POSTS = 20;
const EXPECTED_LIKES = 120;

const rawPost = (i: number, over: Record<string, unknown> = {}) => ({
  id: `p${i}`,
  type: 'Image',
  caption: 'Hola #moda',
  hashtags: ['Moda'],
  likesCount: EXPECTED_LIKES,
  commentsCount: 8,
  videoViewCount: null,
  timestamp: '2026-11-20T20:00:00.000Z',
  ...over,
});

const raw = {
  username: 'sofi.moda.demo',
  fullName: 'Sofía',
  biography: 'Moda y belleza',
  followersCount: 6520,
  followsCount: 624,
  postsCount: 580,
  isBusinessAccount: false,
  businessCategoryName: 'Fashion Model',
  private: false,
  verified: false,
  profilePicUrl: 'https://cdn.example.com/a.jpg',
  externalUrl: 'no-es-url',
  latestPosts: [
    rawPost(1),
    rawPost(2, { type: 'Video', videoViewCount: 2500 }),
    rawPost(3, { type: 'Sidecar', likesCount: -1, hashtags: ['#Outfit'] }),
  ],
};

describe('ACL de Apify', () => {
  it('traduce el JSON del actor a IgProfileSnapshot válido', () => {
    const r = mapApifyProfile(raw, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(IgProfileSnapshot.safeParse(r.value).success).toBe(true);
    expect(r.value).toMatchObject({
      handle: 'sofi.moda.demo',
      followers: 6520,
      following: 624,
      isBusiness: true, // categoría de negocio presente aunque isBusinessAccount sea false
      businessCategory: 'Fashion Model',
      externalUrl: null, // URL inválida descartada
      source: 'apify',
      fetchedAt: NOW.toISOString(),
    });
    expect(r.value.posts.map((p) => p.type)).toEqual(['image', 'video', 'carousel']);
    expect(r.value.posts.map((p) => p.views)).toEqual([null, 2500, null]);
    expect(r.value.posts[0]?.hashtags).toEqual(['moda']);
    expect(r.value.posts[2]).toMatchObject({ likes: 0, hashtags: ['outfit'] });
  });

  it('limita los posts a MAX_SNAPSHOT_POSTS', () => {
    const many = { ...raw, latestPosts: Array.from({ length: MANY_POSTS }, (_, i) => rawPost(i)) };
    const r = mapApifyProfile(many, NOW);
    expect(r.ok && r.value.posts).toHaveLength(MAX_SNAPSHOT_POSTS);
  });

  it('cuenta privada sin categoría ni business: no profesional', () => {
    const r = mapApifyProfile(
      { ...raw, private: true, businessCategoryName: null, latestPosts: [] },
      NOW,
    );
    expect(r.ok && [r.value.isPrivate, r.value.isBusiness]).toEqual([true, false]);
  });

  it('JSON inesperado: UPSTREAM_ERROR', () => {
    const r = mapApifyProfile({ nada: true }, NOW);
    expect(!r.ok && r.error.code).toBe('UPSTREAM_ERROR');
  });
});
