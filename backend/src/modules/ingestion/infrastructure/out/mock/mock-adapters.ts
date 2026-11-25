import { randomUUID } from 'node:crypto';
import { MAX_SNAPSHOT_POSTS, type IgPost, type IgProfileSnapshot } from '@sponcer/contracts';
import { fixtureProfiles } from '@sponcer/contracts/fixtures';
import { ok } from '../../../../../shared/result';
import type { IngestionBlocklist } from '../../../application/ports/out/ingestion-blocklist';
import type { ImageStore } from '../../../application/ports/out/image-store';
import type { InstagramSource } from '../../../application/ports/out/instagram-source';
import type {
  SnapshotRepository,
  StoredSnapshot,
} from '../../../application/ports/out/snapshot-repository';

const HASH_MULTIPLIER = 31;
const HASH_MODULUS = 1_000_003;
const GENERIC_BASE_FOLLOWERS = 5_000;
const GENERIC_FOLLOWERS_SPREAD = 50_000;
const GENERIC_POSTS = 6;
const GENERIC_LIKES_RATIO = 0.04;
const GENERIC_COMMENTS_RATIO = 0.004;
const MS_PER_DAY = 86_400_000;
const POST_INTERVAL_DAYS = 3;

const fixtureByHandle = new Map(fixtureProfiles.map((f) => [f.snapshot.handle, f.snapshot]));

const hashOf = (s: string): number =>
  [...s].reduce((h, ch) => (h * HASH_MULTIPLIER + ch.charCodeAt(0)) % HASH_MODULUS, 0);

/** Perfil profesional público genérico y determinista para handles fuera de los fixtures. */
export function genericSnapshot(handle: string, now: Date): IgProfileSnapshot {
  const followers = GENERIC_BASE_FOLLOWERS + (hashOf(handle) % GENERIC_FOLLOWERS_SPREAD);
  const posts: IgPost[] = Array.from(
    { length: Math.min(GENERIC_POSTS, MAX_SNAPSHOT_POSTS) },
    (_, i) => ({
      id: `${handle}-${i + 1}`,
      type: 'image',
      caption: `Publicación ${i + 1} de ${handle} #lifestyle`,
      hashtags: ['lifestyle'],
      likes: Math.round(followers * GENERIC_LIKES_RATIO),
      comments: Math.round(followers * GENERIC_COMMENTS_RATIO),
      views: null,
      postedAt: new Date(now.getTime() - (i + 1) * POST_INTERVAL_DAYS * MS_PER_DAY).toISOString(),
    }),
  );
  return {
    handle,
    fullName: handle,
    biography: `Perfil profesional de ${handle}`,
    followers,
    following: Math.round(followers / GENERIC_POSTS),
    postsCount: posts.length,
    isBusiness: true,
    businessCategory: 'Personal blog',
    isPrivate: false,
    isVerified: false,
    profilePicUrl: null,
    externalUrl: null,
    posts,
    fetchedAt: now.toISOString(),
    source: 'mock',
  };
}

export interface MockInstagramSource extends InstagramSource {
  /** Solo mock: pega el código del reclamo en la bio "en vivo" del handle (ADR-002). */
  setPendingCode(handle: string, code: string): void;
}

export function createMockInstagramSource(now: () => Date): MockInstagramSource {
  const pendingCodes = new Map<string, string>();
  const base = (handle: string): IgProfileSnapshot =>
    fixtureByHandle.get(handle) ?? genericSnapshot(handle, now());
  return {
    setPendingCode: (handle, code) => void pendingCodes.set(handle, code),
    fetchProfile: async (handle) =>
      ok({ ...base(handle), fetchedAt: now().toISOString(), source: 'mock' }),
    async fetchLiveBio(handle) {
      const snap = base(handle);
      const code = pendingCodes.get(handle);
      return ok({ ...snap, biography: code ? `${snap.biography} ${code}` : snap.biography });
    },
  };
}

/** Caché en memoria sembrada con los fixtures; guarda historial por handle como la tabla `ig_snapshots`. */
export function createInMemorySnapshotRepository(): SnapshotRepository & {
  count(handle: string): number;
} {
  const history = new Map<string, StoredSnapshot[]>(
    fixtureProfiles.map((f) => [f.snapshot.handle, [{ id: randomUUID(), snapshot: f.snapshot }]]),
  );
  const newestFirst = (handle: string) =>
    // Estable: ante igual `fetchedAt` gana el guardado más tarde (va antes en el arreglo).
    [...(history.get(handle) ?? [])].sort((a, b) =>
      b.snapshot.fetchedAt.localeCompare(a.snapshot.fetchedAt),
    );
  return {
    async save(snapshot) {
      const stored = { id: randomUUID(), snapshot };
      history.set(snapshot.handle, [stored, ...(history.get(snapshot.handle) ?? [])]);
      return stored;
    },
    latestByHandle: async (handle) => newestFirst(handle)[0] ?? null,
    deleteByHandle: async (handle) => void history.delete(handle),
    prune: async (handle, keep) => void history.set(handle, newestFirst(handle).slice(0, keep)),
    count: (handle) => history.get(handle)?.length ?? 0,
  };
}

/** Mock: la URL de origen (ruta de fixture o null) se conserva tal cual; no hay nada que borrar. */
export const createMockImageStore = (): ImageStore => ({
  store: async (_handle, sourceUrl) => sourceUrl,
  deleteAll: async () => undefined,
});

export function createInMemoryBlocklist(initial: string[] = []): IngestionBlocklist {
  const blocked = new Set(initial);
  return { isBlocked: async (h) => blocked.has(h), add: async (h) => void blocked.add(h) };
}
