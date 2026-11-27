import {
  CLAIM_TTL_MINUTES,
  QUOTE_TRANSITIONS,
  QUOTE_TRANSITION_ACTOR,
  api,
  type EndpointName,
  type Account,
  type ProfileCard,
  type QuoteRecord,
  type VisibilityItem,
  type RemovalRequestItem,
  type VerifyClaimResult,
} from '@sponcer/contracts';
import { demoUser, fixtureUsers, type FixtureProfile } from '@sponcer/contracts/fixtures';
import type { RawArgs } from '../http';
import type { ParsedArgs, Result } from '../types';
import {
  isMockNewUser,
  campaignOf,
  enrichQuote,
  isOpenQuote,
  withStats,
  fail,
  findProfile,
  notify,
  ownProfile,
  ownerOf,
  paginate,
  scoreFor,
  state,
  type MockRemoval,
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

/** Marcas diacríticas combinadas (acentos) tras normalizar a NFD: "á" -> "a". */
// Acepta el acento combinado de "á" en NFD; rechaza "a" sin acento.
// Probar: https://regex101.com/?regex=%5B%CC%80-%CD%AF%5D&testString=a%CC%81&flavor=javascript
const DIACRITICS = /[̀-ͯ]/g;

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

function requireAdmin(userId: string): void {
  if (userId !== demoUser.id) fail('FORBIDDEN', 'Solo administradores');
}

const findByHandle = (handle: string): FixtureProfile | undefined =>
  state().profiles.find((p) => p.snapshot.handle === handle);

function removalItem(r: MockRemoval): RemovalRequestItem {
  const profile = findByHandle(r.handle);
  return {
    id: r.id,
    igHandle: r.handle,
    email: r.email,
    reason: r.reason,
    status: r.status,
    createdAt: r.createdAt,
    reviewedAt: r.reviewedAt,
    reviewNote: r.reviewNote,
    profile: profile ? toSummary(profile) : null,
  };
}

/** Búsqueda `q` del feed: nombre, handle o nichos (sin tildes ni mayúsculas). */
function matchesText(card: ProfileCard, q: string | undefined): boolean {
  if (!q) return true;
  const needle = normalize(q);
  return [card.fullName, card.handle, ...card.niches].some((t) => normalize(t).includes(needle));
}

const normalize = (s: string): string => s.normalize('NFD').replace(DIACRITICS, '').toLowerCase();

const MS_PER_DAY = 86_400_000;
const WEEK_DAYS = 7;
const MONTH_DAYS = 30;
const CAMPAIGN_ORDER = ['draft', 'active', 'closed'] as const;
const emptyAccount: Account = { accountKind: null, company: null, influencer: null };

/** Cuenta del usuario: la del fixture, la registrada en esta sesión o "sin registrar". */
function accountOf(userId: string): Account {
  const registered = state().registrations[userId];
  if (registered) return registered;
  const u = fixtureUsers.find((x) => x.id === userId);
  return u
    ? { accountKind: u.accountKind, company: u.company, influencer: u.influencer }
    : emptyAccount;
}

const within = (iso: string, days: number): boolean =>
  (Date.now() - new Date(iso).getTime()) / MS_PER_DAY <= days;

/** Intereses recibidos que aún no son match. */
function receivedInterests(profileId: string) {
  const s = state();
  return s.interactions.filter(
    (i) =>
      i.targetProfileId === profileId &&
      i.kind === 'interest' &&
      !s.matches.some(
        (m) =>
          [m.creatorProfileId, m.brandProfileId].includes(profileId) &&
          [m.creatorProfileId, m.brandProfileId].includes(i.actorProfileId),
      ),
  );
}

const ownBrand = (userId: string, profileId: string): FixtureProfile => {
  const p = ownProfile(userId, profileId);
  return p.role === 'brand' ? p : fail('FORBIDDEN', 'Solo las marcas tienen campañas');
};

const handlers: Handlers = {
  health: () => ({ status: 'ok' }),

  me: ({ userId }) => {
    return {
      userId,
      email: isMockNewUser(userId)
        ? `nuevo-${userId.slice(-12)}@sponcer.local`
        : (fixtureUsers.find((u) => u.id === userId)?.email ?? ''),
      account: accountOf(userId),
      // Mock: el usuario demo es administrador.
      isAdmin: userId === demoUser.id,
      profiles: state()
        .profiles.filter((p) => p.ownerUserId === userId)
        .map(toSummary),
    };
  },

  register: ({ userId, body }) => {
    if (accountOf(userId).accountKind) return fail('CONFLICT', 'Tu cuenta ya está registrada');
    state().registrations[userId] =
      body.accountKind === 'company'
        ? {
            accountKind: 'company',
            company: {
              id: crypto.randomUUID(),
              ...body.company,
              tradeName: body.company.tradeName ?? null,
              createdAt: nowIso(),
            },
            influencer: null,
          }
        : {
            accountKind: 'influencer',
            company: null,
            influencer: { ...body.influencer, about: body.influencer.about ?? null },
          };
    return handlers.me({ userId }) as Result<'me'>;
  },

  startClaim: ({ userId, body }) => {
    const kind = accountOf(userId).accountKind;
    if (kind && (kind === 'company') !== (body.role === 'brand'))
      return fail('FORBIDDEN', 'Tu tipo de cuenta no permite reclamar ese tipo de perfil');
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
    state().removals.push({
      id: crypto.randomUUID(),
      handle: params.handle,
      email: body.email,
      reason: body.reason ?? null,
      status: 'pending',
      createdAt: nowIso(),
      reviewedAt: null,
      reviewNote: null,
    });
    return { ok: true };
  },

  adminListRemovals: ({ userId, query }) => {
    requireAdmin(userId);
    const items = state()
      .removals.filter((r) => !query.status || r.status === query.status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(removalItem);
    return paginate(items, query.cursor, query.limit);
  },

  adminReviewRemoval: ({ userId, params, body }) => {
    requireAdmin(userId);
    const request = state().removals.find((r) => r.id === params.requestId);
    if (!request) return fail('NOT_FOUND', 'Pedido no encontrado');
    if (request.status !== 'pending') return fail('CONFLICT', 'El pedido ya fue revisado');
    request.status = body.decision === 'apply' ? 'applied' : 'rejected';
    request.reviewedAt = nowIso();
    request.reviewNote = body.note ?? null;
    const profile = findByHandle(request.handle);
    if (body.decision === 'apply' && profile) profile.status = 'removed';
    return removalItem(request);
  },

  adminAddProfile: ({ userId, body }) => {
    requireAdmin(userId);
    if (findByHandle(body.handle)) return fail('CONFLICT', 'Esa ficha ya existe');
    const profile: FixtureProfile = {
      id: crypto.randomUUID(),
      role: body.role,
      status: 'unclaimed',
      ownerUserId: null,
      snapshot: {
        handle: body.handle,
        fullName: body.handle,
        biography: '',
        followers: SYNTHETIC_FOLLOWERS,
        following: SYNTHETIC_FOLLOWING,
        postsCount: SYNTHETIC_POSTS,
        isBusiness: true,
        businessCategory: null,
        isPrivate: false,
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
    return toDetail(profile, userId);
  },

  adminInviteUser: ({ userId, body }) => {
    requireAdmin(userId);
    const registered = fixtureUsers.some((u) => u.email === body.email.toLowerCase());
    return {
      email: body.email,
      status: registered ? 'already_registered' : 'sent',
      invitedAt: nowIso(),
    };
  },

  adminListAdmins: ({ userId }) => {
    requireAdmin(userId);
    return state().admins;
  },

  adminGrantAdmin: ({ userId, body }) => {
    requireAdmin(userId);
    const email = body.email.toLowerCase();
    if (!state().admins.some((a) => a.email === email)) {
      state().admins.push({
        email,
        source: 'app',
        grantedAt: nowIso(),
        grantedBy: fixtureUsers.find((u) => u.id === userId)?.email ?? null,
      });
    }
    return state().admins;
  },

  adminRevokeAdmin: ({ userId, body }) => {
    requireAdmin(userId);
    const target = state().admins.find((a) => a.email === body.email.toLowerCase());
    if (!target) return fail('NOT_FOUND', 'Esa persona no es administradora');
    if (target.source === 'env')
      return fail('CONFLICT', 'Es administrador fijo (ADMIN_EMAILS): solo se quita desde el .env');
    if (state().admins.length <= 1)
      return fail('CONFLICT', 'No se puede quitar al último administrador');
    state().admins = state().admins.filter((a) => a !== target);
    return state().admins;
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
        const { niches, tiers, minEngagement, maxPricePen, minBudgetPen, q, city } = query;
        return (
          matchesText(card, q) &&
          (!city || card.city === city) &&
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
    const items = state()
      .matches.filter((m) => [m.creatorProfileId, m.brandProfileId].includes(query.profileId))
      .map((m) => ({
        id: m.id,
        creator: toCard(findProfile(m.creatorProfileId)),
        brand: toCard(findProfile(m.brandProfileId)),
        createdAt: m.createdAt,
      }));
    return paginate(items, query.cursor, query.limit);
  },

  listQuotes: ({ userId, query }) => {
    ownProfile(userId, query.profileId);
    const items = state()
      .quotes.filter(
        (q) =>
          (q.creatorProfileId === query.profileId || q.requesterProfileId === query.profileId) &&
          (!query.campaignId || q.campaignId === query.campaignId),
      )
      .map(enrichQuote);
    return paginate(items, query.cursor, query.limit);
  },

  createQuote: ({ userId, body }) => {
    const requester = ownBrand(userId, body.requesterProfileId);
    const campaign = campaignOf(body.campaignId);
    if (campaign.brandProfileId !== requester.id)
      return fail('FORBIDDEN', 'Esa campaña no es de tu marca');
    if (campaign.status !== 'active')
      return fail('VALIDATION_ERROR', 'Solo se cotiza dentro de una campaña activa');
    const at = nowIso();
    const result: Result<'createQuote'> = { created: [], failed: [] };
    const seen = new Set<string>();
    body.targets.forEach(({ creatorProfileId, serviceId }) => {
      const creator = state().profiles.find((p) => p.id === creatorProfileId);
      const reject = (code: 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_ERROR', message: string) =>
        result.failed.push({ creatorProfileId, code, message });
      if (!creator || creator.role !== 'creator')
        return reject('NOT_FOUND', 'Influencer no encontrado');
      if (serviceId && !creator.services.some((s) => s.id === serviceId))
        return reject('NOT_FOUND', 'Ese servicio no existe en su catálogo');
      const open = state().quotes.some(
        (q) => q.campaignId === campaign.id && q.creatorProfileId === creator.id && isOpenQuote(q),
      );
      if (open || seen.has(creator.id))
        return reject('CONFLICT', 'Ya tiene una cotización abierta en esta campaña');
      seen.add(creator.id);
      const history: QuoteRecord['history'] = [
        { from: null, to: 'draft', actorProfileId: requester.id, note: null, at },
      ];
      if (body.send)
        history.push({ from: 'draft', to: 'sent', actorProfileId: requester.id, note: null, at });
      const quote: QuoteRecord = {
        id: crypto.randomUUID(),
        campaignId: campaign.id,
        serviceId: serviceId ?? null,
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
      result.created.push(enrichQuote(quote));
    });
    return result;
  },

  listCampaigns: ({ userId, query }) => {
    ownBrand(userId, query.profileId);
    const items = state()
      .campaigns.filter(
        (c) => c.brandProfileId === query.profileId && (!query.status || c.status === query.status),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(withStats);
    return paginate(items, query.cursor, query.limit);
  },

  getCampaign: ({ userId, params, query }) => {
    ownBrand(userId, query.profileId);
    const c = campaignOf(params.campaignId);
    return c.brandProfileId === query.profileId
      ? withStats(c)
      : fail('NOT_FOUND', 'Campaña no encontrada');
  },

  createCampaign: ({ userId, body }) => {
    const brand = ownBrand(userId, body.brandProfileId);
    const { brandProfileId: _brand, activate, ...fields } = body;
    const at = nowIso();
    const campaign = {
      id: crypto.randomUUID(),
      brandProfileId: brand.id,
      ...fields,
      description: fields.description ?? null,
      status: activate ? ('active' as const) : ('draft' as const),
      createdAt: at,
      updatedAt: at,
    };
    state().campaigns.push(campaign);
    return withStats(campaign);
  },

  updateCampaign: ({ userId, params, body }) => {
    ownBrand(userId, body.brandProfileId);
    const c = campaignOf(params.campaignId);
    if (c.brandProfileId !== body.brandProfileId) return fail('NOT_FOUND', 'Campaña no encontrada');
    const { brandProfileId: _brand, status, description, ...fields } = body;
    if (status && CAMPAIGN_ORDER.indexOf(status) < CAMPAIGN_ORDER.indexOf(c.status))
      return fail('INVALID_TRANSITION', 'Una campaña no vuelve a un estado anterior');
    Object.assign(c, fields, {
      ...(description !== undefined && { description }),
      status: status ?? c.status,
      updatedAt: nowIso(),
    });
    return withStats(c);
  },

  visibilitySummary: ({ userId, query }) => {
    ownProfile(userId, query.profileId);
    const interests = receivedInterests(query.profileId);
    const views = state().views.filter((v) => v.viewedProfileId === query.profileId);
    const distinct = (days: number) =>
      new Set(views.filter((v) => within(v.at, days)).map((v) => v.viewerProfileId)).size;
    return {
      interests7d: interests.filter((i) => within(i.createdAt, WEEK_DAYS)).length,
      interests30d: interests.filter((i) => within(i.createdAt, MONTH_DAYS)).length,
      views7d: distinct(WEEK_DAYS),
      views30d: distinct(MONTH_DAYS),
    };
  },

  visibility: ({ userId, query }) => {
    ownProfile(userId, query.profileId);
    const reciprocated = (targetId: string) =>
      state().interactions.some(
        (i) => i.actorProfileId === query.profileId && i.targetProfileId === targetId,
      );
    const toItem = (
      kind: VisibilityItem['kind'],
      actorId: string,
      at: string,
      count: number,
    ): VisibilityItem => ({
      kind,
      profile: toSummary(findProfile(actorId)),
      at,
      count,
      reciprocated: reciprocated(actorId),
    });
    const recentViews = state().views.filter(
      (v) => v.viewedProfileId === query.profileId && within(v.at, MONTH_DAYS),
    );
    const byViewer = Map.groupBy(recentViews, (v) => v.viewerProfileId);
    const items =
      query.kind === 'interest'
        ? receivedInterests(query.profileId).map((i) =>
            toItem('interest', i.actorProfileId, i.createdAt, 1),
          )
        : [...byViewer].map(([viewer, list]) =>
            toItem(
              'view',
              viewer,
              list
                .map((v) => v.at)
                .sort()
                .at(-1) ?? '',
              list.length,
            ),
          );
    items.sort((a, b) => b.at.localeCompare(a.at));
    return paginate(items, query.cursor, query.limit);
  },

  recordProfileView: ({ userId, params, body }) => {
    const viewer = ownProfile(userId, body.viewerProfileId);
    const viewed = findProfile(params.profileId);
    const today = nowIso().slice(0, 10);
    // shortcut: el mock no excluye a administradores (el demo lo es y nunca registraría visitas).
    const applies =
      viewed.ownerUserId !== null &&
      viewed.ownerUserId !== userId &&
      viewed.role !== viewer.role &&
      !state().views.some(
        (v) =>
          v.viewerProfileId === viewer.id &&
          v.viewedProfileId === viewed.id &&
          v.at.startsWith(today),
      );
    if (applies)
      state().views.push({ viewerProfileId: viewer.id, viewedProfileId: viewed.id, at: nowIso() });
    return { recorded: applies };
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
