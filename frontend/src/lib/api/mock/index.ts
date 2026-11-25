import {
  CLAIM_TTL_MINUTES,
  QUOTE_TRANSITIONS,
  QUOTE_TRANSITION_ACTOR,
  api,
  type EndpointName,
  type QuoteRecord,
  type VerifyClaimResult,
} from '@sponcer/contracts';
import { fixtureUsers, type FixtureProfile } from '@sponcer/contracts/fixtures';
import type { RawArgs } from '../http';
import type { ParsedArgs, Result } from '../types';
import {
  enrichQuote,
  fail,
  findProfile,
  notify,
  ownProfile,
  ownerOf,
  paginate,
  scoreFor,
  state,
  toCard,
  toDetail,
  toSummary,
  userIdFromToken,
} from './domain';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const MS_PER_MINUTE = 60_000;
const SYNTHETIC_FOLLOWERS = 1200;
const SYNTHETIC_FOLLOWING = 300;
const SYNTHETIC_POSTS = 40;
// Primer intento de verificación: el mock simula "aún no veo el código en tu bio".
const FIRST_ATTEMPT = 1;

const randomCode = (): string =>
  `sponcer-${Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('')}`;

const nowIso = (): string => new Date().toISOString();

type Handlers = {
  [N in EndpointName]: (a: ParsedArgs<N> & { userId: string }) => Result<N> | Promise<Result<N>>;
};

/** Perfil + solicitud del usuario de la cotización: participa si es el creador o el solicitante. */
function quoteActorRole(q: QuoteRecord, actorId: string): 'requester' | 'creator' {
  if (actorId === q.requesterProfileId) return 'requester';
  if (actorId === q.creatorProfileId) return 'creator';
  return fail('FORBIDDEN', 'No participas en esta cotización');
}

function myMatch(userId: string, matchId: string) {
  const match =
    state().matches.find((m) => m.id === matchId) ?? fail('NOT_FOUND', 'Match no encontrado');
  const mine = [match.creatorProfileId, match.brandProfileId].find((id) => ownerOf(id) === userId);
  if (!mine) return fail('FORBIDDEN', 'No participas en este match');
  return { match, mine };
}

function claimResult(
  profile: FixtureProfile,
  attempts: number,
  expiresAt: string,
  userId: string,
): VerifyClaimResult {
  if (new Date(expiresAt).getTime() < Date.now()) return { status: 'expired' };
  if (profile.ownerUserId && profile.ownerUserId !== userId) return { status: 'already_owned' };
  if (profile.snapshot.isPrivate) return { status: 'not_eligible', reason: 'private' };
  if (!profile.snapshot.isBusiness) return { status: 'not_eligible', reason: 'not_professional' };
  if (attempts <= FIRST_ATTEMPT) return { status: 'code_not_found' };
  return { status: 'verified', profileId: profile.id };
}

const handlers: Handlers = {
  health: () => ({ status: 'ok' }),

  me: ({ userId }) => {
    return {
      userId,
      email: fixtureUsers.find((u) => u.id === userId)?.email ?? '',
      profiles: state()
        .profiles.filter((p) => p.ownerUserId === userId)
        .map(toSummary),
    };
  },

  startClaim: ({ userId, body }) => {
    const existing = state().profiles.find((p) => p.snapshot.handle === body.handle);
    if (existing?.ownerUserId && existing.ownerUserId !== userId) {
      return fail('CONFLICT', 'Ese perfil ya fue reclamado por otra persona');
    }
    const claim = {
      claimId: crypto.randomUUID(),
      handle: body.handle,
      role: body.role,
      code: randomCode(),
      expiresAt: new Date(Date.now() + CLAIM_TTL_MINUTES * MS_PER_MINUTE).toISOString(),
    };
    state().claims.push({ claim, userId, attempts: 0 });
    return claim;
  },

  verifyClaim: ({ userId, params }) => {
    const rec = state().claims.find(
      (c) => c.claim.claimId === params.claimId && c.userId === userId,
    );
    if (!rec) return fail('NOT_FOUND', 'Reclamo no encontrado');
    rec.attempts += 1;
    const { handle, role, code, expiresAt } = rec.claim;
    let profile = state().profiles.find((p) => p.snapshot.handle === handle);
    if (!profile) {
      // Handle nuevo: el mock lo "ingiere" como perfil sintético. "privado"/"personal" en el handle simulan casos no elegibles.
      profile = {
        id: crypto.randomUUID(),
        role,
        status: 'unclaimed',
        ownerUserId: null,
        snapshot: {
          handle,
          fullName: handle,
          biography: '',
          followers: SYNTHETIC_FOLLOWERS,
          following: SYNTHETIC_FOLLOWING,
          postsCount: SYNTHETIC_POSTS,
          isBusiness: !handle.includes('personal'),
          businessCategory: null,
          isPrivate: handle.includes('privado'),
          isVerified: false,
          profilePicUrl: null,
          externalUrl: null,
          posts: [],
          fetchedAt: nowIso(),
          source: 'mock',
        },
        declared: null,
        services: [],
      };
      state().profiles.push(profile);
    }
    const result = claimResult(profile, rec.attempts, expiresAt, userId);
    if (result.status === 'verified') {
      profile.ownerUserId = userId;
      profile.status = 'verified';
      profile.snapshot.biography = `${profile.snapshot.biography} ${code}`;
    }
    return result;
  },

  getProfile: ({ userId, params }) => {
    const p = state().profiles.find((x) => x.snapshot.handle === params.handle);
    if (!p || p.status === 'removed') return fail('NOT_FOUND', 'Perfil no encontrado');
    return toDetail(p, userId);
  },

  updateDeclared: ({ userId, params, body }) => {
    const p = ownProfile(userId, params.profileId);
    if (p.role !== body.role)
      return fail('VALIDATION_ERROR', 'El rol de los datos no coincide con el perfil');
    p.declared = body;
    return toDetail(p, userId);
  },

  putServices: ({ userId, params, body }) => {
    const p = ownProfile(userId, params.profileId);
    if (p.role !== 'creator') return fail('FORBIDDEN', 'Solo los creadores tienen servicios');
    p.services = body.services.map((s) => ({ ...s, id: crypto.randomUUID() }));
    return p.services;
  },

  requestRemoval: ({ params, body }) => {
    state().removals.push({ handle: params.handle, email: body.email });
    return { ok: true };
  },

  feed: ({ userId, query }) => {
    const actor = ownProfile(userId, query.profileId);
    const seen = new Set(
      state()
        .interactions.filter((i) => i.actorProfileId === actor.id)
        .map((i) => i.targetProfileId),
    );
    const items = state()
      .profiles.filter((p) => p.role !== actor.role && p.status !== 'removed' && !seen.has(p.id))
      .map((p) => scoreFor(actor, p))
      .filter(({ card }) => {
        const { niches, tiers, minEngagement, maxPricePen, minBudgetPen } = query;
        return (
          (!niches?.length || card.niches.some((n) => niches.includes(n))) &&
          (!tiers?.length || tiers.includes(card.tier)) &&
          (minEngagement === undefined || card.engagementRate >= minEngagement) &&
          (maxPricePen === undefined ||
            (card.minServicePricePen !== null && card.minServicePricePen <= maxPricePen)) &&
          (minBudgetPen === undefined ||
            (card.budgetMaxPen !== null && card.budgetMaxPen >= minBudgetPen))
        );
      })
      .sort((a, b) => b.score - a.score);
    return paginate(items, query.cursor, query.limit);
  },

  interact: ({ userId, body }) => {
    const actor = ownProfile(userId, body.actorProfileId);
    const target = findProfile(body.targetProfileId);
    if (actor.role === target.role)
      return fail('VALIDATION_ERROR', 'Solo se conectan marcas con creadores');
    const s = state();
    s.interactions.push({
      id: crypto.randomUUID(),
      actorProfileId: actor.id,
      targetProfileId: target.id,
      kind: body.kind,
      createdAt: nowIso(),
    });
    const reciprocal = s.interactions.some(
      (i) =>
        i.actorProfileId === target.id && i.targetProfileId === actor.id && i.kind === 'interest',
    );
    if (body.kind !== 'interest' || !reciprocal) return { matched: false, matchId: null };
    const existing = s.matches.find(
      (m) =>
        [m.creatorProfileId, m.brandProfileId].includes(actor.id) &&
        [m.creatorProfileId, m.brandProfileId].includes(target.id),
    );
    if (existing) return { matched: true, matchId: existing.id };
    const [creator, brand] = actor.role === 'creator' ? [actor, target] : [target, actor];
    const match = {
      id: crypto.randomUUID(),
      creatorProfileId: creator.id,
      brandProfileId: brand.id,
      createdAt: nowIso(),
    };
    s.matches.push(match);
    notify(actor.ownerUserId, 'match_created', { matchId: match.id, profileId: target.id });
    notify(target.ownerUserId, 'match_created', { matchId: match.id, profileId: actor.id });
    return { matched: true, matchId: match.id };
  },

  matches: ({ userId, query }) => {
    ownProfile(userId, query.profileId);
    return state()
      .matches.filter((m) => [m.creatorProfileId, m.brandProfileId].includes(query.profileId))
      .map((m) => ({
        id: m.id,
        creator: toCard(findProfile(m.creatorProfileId)),
        brand: toCard(findProfile(m.brandProfileId)),
        createdAt: m.createdAt,
      }));
  },

  listQuotes: ({ userId, query }) => {
    ownProfile(userId, query.profileId);
    return state()
      .quotes.filter(
        (q) => q.creatorProfileId === query.profileId || q.requesterProfileId === query.profileId,
      )
      .map(enrichQuote);
  },

  createQuote: ({ userId, body }) => {
    const requester = ownProfile(userId, body.requesterProfileId);
    if (requester.role !== 'brand')
      return fail('FORBIDDEN', 'Solo las marcas solicitan cotizaciones');
    const creator =
      state().profiles.find((p) => p.services.some((s) => s.id === body.serviceId)) ??
      fail('NOT_FOUND', 'Servicio no encontrado');
    const at = nowIso();
    const history: QuoteRecord['history'] = [
      { from: null, to: 'draft', actorProfileId: requester.id, note: null, at },
    ];
    if (body.send)
      history.push({ from: 'draft', to: 'sent', actorProfileId: requester.id, note: null, at });
    const quote: QuoteRecord = {
      id: crypto.randomUUID(),
      serviceId: body.serviceId,
      creatorProfileId: creator.id,
      requesterProfileId: requester.id,
      status: body.send ? 'sent' : 'draft',
      amountPen: body.amountPen ?? null,
      message: body.message,
      history,
      createdAt: at,
      updatedAt: at,
    };
    state().quotes.push(quote);
    if (body.send)
      notify(creator.ownerUserId, 'quote_status_changed', { quoteId: quote.id, to: 'sent' });
    return enrichQuote(quote);
  },

  transitionQuote: ({ userId, params, body }) => {
    const quote =
      state().quotes.find((q) => q.id === params.quoteId) ??
      fail('NOT_FOUND', 'Cotización no encontrada');
    ownProfile(userId, body.actorProfileId);
    const role = quoteActorRole(quote, body.actorProfileId);
    const required = QUOTE_TRANSITION_ACTOR[body.to];
    if (!QUOTE_TRANSITIONS[quote.status].includes(body.to)) {
      return fail('INVALID_TRANSITION', `No se puede pasar de ${quote.status} a ${body.to}`);
    }
    if (required !== 'any' && required !== role) {
      return fail('FORBIDDEN', 'Tu rol no puede hacer este cambio');
    }
    const at = nowIso();
    quote.history.push({
      from: quote.status,
      to: body.to,
      actorProfileId: body.actorProfileId,
      note: body.note ?? null,
      at,
    });
    quote.status = body.to;
    quote.amountPen = body.amountPen ?? quote.amountPen;
    quote.updatedAt = at;
    const otherId = role === 'creator' ? quote.requesterProfileId : quote.creatorProfileId;
    notify(ownerOf(otherId), 'quote_status_changed', { quoteId: quote.id, to: body.to });
    return enrichQuote(quote);
  },

  notifications: ({ userId, query }) => {
    const mine = state()
      .notifications.filter((n) => n.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(({ userId: _owner, ...n }) => n);
    return paginate(mine, query.cursor, query.limit);
  },

  markNotificationRead: ({ userId, params }) => {
    const n = state().notifications.find(
      (x) => x.id === params.notificationId && x.userId === userId,
    );
    if (!n) return fail('NOT_FOUND', 'Notificación no encontrada');
    n.readAt ??= nowIso();
    const { userId: _owner, ...rest } = n;
    return rest;
  },

  listMessages: ({ userId, params, query }) => {
    myMatch(userId, params.matchId);
    const all = state()
      .messages.filter((m) => m.matchId === params.matchId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return paginate(all, query.cursor, query.limit);
  },

  sendMessage: ({ userId, params, body }) => {
    const { match, mine } = myMatch(userId, params.matchId);
    if (mine !== body.senderProfileId)
      return fail('FORBIDDEN', 'No puedes escribir como ese perfil');
    const message = {
      id: crypto.randomUUID(),
      matchId: match.id,
      senderProfileId: mine,
      body: body.body,
      createdAt: nowIso(),
    };
    state().messages.push(message);
    const otherId = mine === match.creatorProfileId ? match.brandProfileId : match.creatorProfileId;
    notify(ownerOf(otherId), 'message_received', { matchId: match.id, profileId: mine });
    return message;
  },
};

/** Implementación `mock`: ejecuta el endpoint contra el estado en memoria. */
export async function mockCall(name: EndpointName, args: RawArgs): Promise<unknown> {
  const endpoint = api[name];
  const needsAuth = !('auth' in endpoint) || endpoint.auth !== false;
  const userId = needsAuth ? userIdFromToken(args.token) : '';
  const handler = handlers[name] as (a: unknown) => unknown;
  return handler({ ...args, userId });
}
