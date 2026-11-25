import {
  NICHES,
  tierFor,
  type AdminEntry,
  type Claim,
  type Classification,
  type FeedItem,
  type Message,
  type Niche,
  type Quote,
  type QuoteRecord,
  type ProfileCard,
  type ProfileDetail,
  type ProfileSummary,
  type ScoreComponent,
  MAX_CARD_BIO,
  MAX_MATCH_REASONS,
} from '@sponcer/contracts';
import {
  fixtureProfiles,
  fixtureSocial,
  fixtureUsers,
  type FixtureProfile,
  type FixtureSocial,
} from '@sponcer/contracts/fixtures';
import { ApiError } from '../errors';

export const MOCK_TOKEN_PREFIX = 'mock:';
const PERCENT = 100;
const ENGAGEMENT_CAP_PERCENT = 10;
const NEUTRAL = 0.5;
const MAX_NICHES_INFERRED = 3;

const WEIGHT_NICHES = 0.4;
const WEIGHT_SIMILARITY = 0.25;
const WEIGHT_BUDGET = 0.2;
const WEIGHT_ENGAGEMENT = 0.15;
const ROUND_DECIMALS = 2;
const SCORE_DECIMALS = 3;

const WEIGHTS: Record<ScoreComponent, number> = {
  niches: WEIGHT_NICHES,
  similarity: WEIGHT_SIMILARITY,
  budget: WEIGHT_BUDGET,
  engagement: WEIGHT_ENGAGEMENT,
};

export interface ClaimRecord {
  claim: Claim;
  userId: string;
  attempts: number;
}

export interface MockState {
  profiles: FixtureProfile[];
  interactions: FixtureSocial['interactions'];
  matches: FixtureSocial['matches'];
  messages: Message[];
  quotes: FixtureSocial['quotes'];
  notifications: FixtureSocial['notifications'];
  claims: ClaimRecord[];
  removals: MockRemoval[];
  admins: AdminEntry[];
}

const MS_PER_DAY = 86_400_000;

export interface MockRemoval {
  id: string;
  handle: string;
  email: string;
  reason: string | null;
  status: 'pending' | 'applied' | 'rejected';
  createdAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
}

const SEED_REMOVALS = [
  { index: 3, email: 'titular@example.com', reason: 'No quiero aparecer en la plataforma.' },
  { index: 7, email: 'prensa@example.com', reason: null },
];

declare global {
  var __sponcerMock: MockState | undefined;
}

/** Estado en memoria compartido por todas las peticiones del proceso (se reinicia al reiniciar el servidor). */
export function state(): MockState {
  globalThis.__sponcerMock ??= {
    profiles: structuredClone(fixtureProfiles),
    interactions: structuredClone(fixtureSocial.interactions),
    matches: structuredClone(fixtureSocial.matches),
    messages: structuredClone(fixtureSocial.messages),
    quotes: structuredClone(fixtureSocial.quotes),
    notifications: structuredClone(fixtureSocial.notifications),
    claims: [],
    // El administrador de arranque (ADMIN_EMAILS) no se puede quitar desde la app.
    admins: [{ email: 'demo@sponcer.local', source: 'env', grantedAt: null, grantedBy: null }],
    removals: SEED_REMOVALS.map(({ index, email, reason }, i) => ({
      id: crypto.randomUUID(),
      handle: fixtureProfiles[index]?.snapshot.handle ?? 'sin.handle',
      email,
      reason,
      status: 'pending' as const,
      createdAt: new Date(Date.now() - (i + 1) * MS_PER_DAY).toISOString(),
      reviewedAt: null,
      reviewNote: null,
    })),
  };
  return globalThis.__sponcerMock;
}

export const fail = (code: ConstructorParameters<typeof ApiError>[0], message: string): never => {
  throw new ApiError(code, message);
};

export function userIdFromToken(token: string | undefined): string {
  const id = token?.startsWith(MOCK_TOKEN_PREFIX) ? token.slice(MOCK_TOKEN_PREFIX.length) : null;
  if (!id || !fixtureUsers.some((u) => u.id === id))
    return fail('UNAUTHORIZED', 'Sesión no válida');
  return id;
}

export const findProfile = (id: string): FixtureProfile =>
  state().profiles.find((p) => p.id === id) ?? fail('NOT_FOUND', 'Perfil no encontrado');

/** El perfil debe pertenecer al usuario (si no, 403). */
export function ownProfile(userId: string, profileId: string): FixtureProfile {
  const p = findProfile(profileId);
  return p.ownerUserId === userId ? p : fail('FORBIDDEN', 'Ese perfil no es tuyo');
}

export const ownerOf = (profileId: string): string | null => findProfile(profileId).ownerUserId;

export function notify(
  userId: string | null,
  kind: FixtureSocial['notifications'][number]['kind'],
  payload: Record<string, string>,
): void {
  if (!userId) return;
  state().notifications.push({
    id: crypto.randomUUID(),
    userId,
    kind,
    payload,
    readAt: null,
    createdAt: new Date().toISOString(),
  });
}

// ---- Derivados del snapshot ----

const tokens = (s: string): string[] =>
  s.split('-').flatMap((a) => a.split('.').flatMap((b) => b.split('_')));

/** Nichos declarados; si no hay, se infieren de hashtags y handle (regla simple de mock). */
export function nichesOf(p: FixtureProfile): Niche[] {
  const d = p.declared;
  if (d) return d.role === 'creator' ? d.niches : d.targetNiches;
  const words = new Set([
    ...p.snapshot.posts.flatMap((post) => post.hashtags),
    ...tokens(p.snapshot.handle),
  ]);
  return NICHES.filter((n) => tokens(n).some((t) => words.has(t))).slice(0, MAX_NICHES_INFERRED);
}

export function engagementOf(p: FixtureProfile): number {
  const { posts, followers } = p.snapshot;
  if (!posts.length || !followers) return 0;
  const interactions = posts.reduce((sum, post) => sum + post.likes + post.comments, 0);
  return Number(((interactions / posts.length / followers) * PERCENT).toFixed(ROUND_DECIMALS));
}

const minPrice = (p: FixtureProfile): number | null =>
  p.services.length ? Math.min(...p.services.map((s) => s.pricePen)) : null;

const budgetMax = (p: FixtureProfile): number | null =>
  p.declared?.role === 'brand' ? p.declared.budgetMaxPen : null;

export const toSummary = (p: FixtureProfile): ProfileSummary => ({
  id: p.id,
  handle: p.snapshot.handle,
  role: p.role,
  fullName: p.snapshot.fullName,
  profilePicUrl: p.snapshot.profilePicUrl,
  status: p.status,
});

/** Igual que el backend: bio declarada > biografía de Instagram, recortada a MAX_CARD_BIO + "…". */
function cardBio(p: FixtureProfile): Pick<ProfileCard, 'bio' | 'bioSource'> {
  const declared = p.declared?.shortBio?.trim();
  const ig = p.snapshot.biography.trim();
  const text = declared || ig;
  if (!text) return { bio: null, bioSource: null };
  const bio = text.length > MAX_CARD_BIO ? `${text.slice(0, MAX_CARD_BIO).trimEnd()}…` : text;
  return { bio, bioSource: declared ? 'declared' : 'instagram' };
}

export const toCard = (p: FixtureProfile): ProfileCard => ({
  ...toSummary(p),
  ...cardBio(p),
  city: p.declared?.city ?? null,
  niches: nichesOf(p),
  tier: tierFor(p.snapshot.followers),
  followers: p.snapshot.followers,
  engagementRate: engagementOf(p),
  sector: p.declared?.role === 'brand' ? p.declared.sector : null,
  minServicePricePen: minPrice(p),
  budgetMaxPen: budgetMax(p),
});

export function classify(p: FixtureProfile): Classification {
  return {
    niches: nichesOf(p).map((niche) => ({
      niche,
      confidence: p.declared ? 1 : NEUTRAL,
      source: p.declared ? 'declared' : 'rules',
    })),
    tier: tierFor(p.snapshot.followers),
    followers: p.snapshot.followers,
    engagementRate: engagementOf(p),
    classifiedAt: p.snapshot.fetchedAt,
  };
}

export function toDetail(p: FixtureProfile, userId: string): ProfileDetail {
  const s = p.snapshot;
  return {
    ...toSummary(p),
    ingested: {
      biography: s.biography,
      followers: s.followers,
      following: s.following,
      postsCount: s.postsCount,
      isVerified: s.isVerified,
      externalUrl: s.externalUrl,
      fetchedAt: s.fetchedAt,
    },
    declared: p.declared,
    classification: classify(p),
    services: p.services,
    isOwner: p.ownerUserId === userId,
  };
}

// ---- Puntaje del feed (RF-10) ----

const jaccard = <T>(a: T[], b: T[]): number => {
  const [setA, setB] = [new Set(a), new Set(b)];
  const union = new Set([...setA, ...setB]).size;
  return union ? [...setA].filter((x) => setB.has(x)).length / union : 0;
};

const affordability = (budget: number | null, price: number | null): number => {
  if (budget === null || price === null) return NEUTRAL;
  return Math.min(1, budget / Math.max(price, 1));
};

export function scoreFor(actor: FixtureProfile, target: FixtureProfile): FeedItem {
  const brand = actor.role === 'brand' ? actor : target;
  const creator = actor.role === 'brand' ? target : actor;
  const hashtags = (p: FixtureProfile) => p.snapshot.posts.flatMap((post) => post.hashtags);

  const parts: Record<ScoreComponent, number> = {
    niches: jaccard(nichesOf(actor), nichesOf(target)),
    similarity: jaccard(hashtags(actor), hashtags(target)),
    budget: affordability(budgetMax(brand), minPrice(creator)),
    engagement: Math.min(engagementOf(target) / ENGAGEMENT_CAP_PERCENT, 1),
  };
  const contribution = (c: ScoreComponent) => parts[c] * WEIGHTS[c];
  const components = Object.keys(parts) as ScoreComponent[];
  const score = components.reduce((sum, c) => sum + contribution(c), 0);
  const reasons = components
    .filter((c) => contribution(c) > 0)
    .sort((a, b) => contribution(b) - contribution(a))
    .slice(0, MAX_MATCH_REASONS);
  return { card: toCard(target), score: Number(score.toFixed(SCORE_DECIMALS)), reasons };
}

// ---- Paginación por cursor (offset serializado) ----

export function paginate<T>(items: T[], cursor: string | undefined, limit: number) {
  const start = cursor ? Number(cursor) || 0 : 0;
  const end = start + limit;
  return { items: items.slice(start, end), nextCursor: end < items.length ? String(end) : null };
}

/** Añade las dos partes y el servicio a la cotización persistida (como hará la API real). */
export function enrichQuote(q: QuoteRecord): Quote {
  const service =
    findProfile(q.creatorProfileId).services.find((s) => s.id === q.serviceId) ??
    fail('NOT_FOUND', 'Servicio no encontrado');
  return {
    ...q,
    creator: toSummary(findProfile(q.creatorProfileId)),
    requester: toSummary(findProfile(q.requesterProfileId)),
    service,
  };
}
