import type { ProfileCard, VisibilityItem } from '@sponcer/contracts';
import { decodeCursor, encodeCursor } from '../../../../shared/cursor';
import { DomainError } from '../../../../shared/errors';
import { adminEmailOf } from '../../../../shared/admin';
import { err, ok } from '../../../../shared/result';
import type { ProfilesApi } from '../../../profiles';
import {
  LONG_DAYS,
  SHORT_DAYS,
  canRecordView,
  dayOf,
  daysAgo,
  groupViews,
  pendingInterests,
} from '../../domain/visibility';
import type {
  GetVisibilitySummary,
  ListVisibility,
  RecordProfileView,
} from '../ports/in/visibility-use-cases';
import type { InteractionRepository } from '../ports/out/interaction-repository';
import type { MatchRepository } from '../ports/out/match-repository';
import type { ProfileViewRepository } from '../ports/out/profile-view-repository';

interface Deps {
  profiles: Pick<ProfilesApi, 'isOwner' | 'getCards' | 'getOwnerUserId'>;
  interactions: InteractionRepository;
  matches: MatchRepository;
  views: ProfileViewRepository;
  isAdmin: (email: string) => Promise<boolean>;
  now: () => Date;
}

interface Entry {
  kind: VisibilityItem['kind'];
  card: ProfileCard;
  at: string;
  count: number;
  reciprocated: boolean;
  inShort: boolean;
}

const notOwner = () => err(new DomainError('FORBIDDEN', 'El perfil no te pertenece'));

/** Todas las entradas de 30 días del perfil, sin perfiles removidos (getCards no los devuelve). */
async function loadEntries(d: Deps, profileId: string, kind: Entry['kind']): Promise<Entry[]> {
  const now = d.now();
  const longSince = daysAgo(now, LONG_DAYS);
  const shortSince = daysAgo(now, SHORT_DAYS);
  const raw =
    kind === 'interest'
      ? await (async () => {
          const [received, mine, matches] = await Promise.all([
            d.interactions.listByTarget(profileId),
            d.interactions.listByActor(profileId),
            d.matches.listByProfile(profileId),
          ]);
          const matched = new Set(
            matches
              .flatMap((m) => [m.creatorProfileId, m.brandProfileId])
              .filter((x) => x !== profileId),
          );
          return pendingInterests(received, mine, matched)
            .filter((i) => i.at >= longSince.toISOString())
            .map((i) => ({
              id: i.actorProfileId,
              at: i.at,
              count: 1,
              reciprocated: i.reciprocated,
              inShort: i.at >= shortSince.toISOString(),
            }));
        })()
      : await (async () => {
          const grouped = groupViews(
            await d.views.listSince(profileId, dayOf(longSince)),
            dayOf(shortSince),
          );
          return [...grouped].map(([id, v]) => ({ id, ...v, reciprocated: false }));
        })();
  const cards = new Map((await d.profiles.getCards(raw.map((r) => r.id))).map((c) => [c.id, c]));
  const mine = kind === 'view' && raw.length ? await d.interactions.listByActor(profileId) : [];
  const interestedIn = new Set(
    mine.filter((i) => i.kind === 'interest').map((i) => i.targetProfileId),
  );
  return raw.flatMap((r) => {
    const card = cards.get(r.id);
    return card
      ? [{ ...r, kind, card, reciprocated: r.reciprocated || interestedIn.has(r.id) }]
      : [];
  });
}

export const makeGetVisibilitySummary =
  (d: Deps): GetVisibilitySummary =>
  async (userId, { profileId }) => {
    if (!(await d.profiles.isOwner(profileId, userId))) return notOwner();
    const [interests, views] = await Promise.all([
      loadEntries(d, profileId, 'interest'),
      loadEntries(d, profileId, 'view'),
    ]);
    return ok({
      interests7d: interests.filter((e) => e.inShort).length,
      interests30d: interests.length,
      views7d: views.filter((e) => e.inShort).length,
      views30d: views.length,
    });
  };

export const makeListVisibility =
  (d: Deps): ListVisibility =>
  async (userId, query) => {
    if (!(await d.profiles.isOwner(query.profileId, userId))) return notOwner();
    const decoded = decodeCursor(query.cursor);
    if (!decoded.ok) return decoded;
    const all = (await loadEntries(d, query.profileId, query.kind))
      .sort((a, b) => b.at.localeCompare(a.at) || a.card.id.localeCompare(b.card.id))
      .map((e): VisibilityItem => ({
        kind: e.kind,
        profile: e.card,
        at: e.at,
        count: e.count,
        reciprocated: e.reciprocated,
      }));
    const end = decoded.value + query.limit;
    return ok({
      items: all.slice(decoded.value, end),
      nextCursor: end < all.length ? encodeCursor(end) : null,
    });
  };

/**
 * Una visita por (visitante, ficha, día UTC): la repetición del mismo día no suma (`recorded: false`).
 * Lo que no aplica (mismo tipo, ficha propia o sin dueño, admin) también devuelve `recorded: false`, sin error.
 */
export const makeRecordProfileView =
  (d: Deps): RecordProfileView =>
  async (user, viewedProfileId, { viewerProfileId }) => {
    const ownsViewer = await d.profiles.isOwner(viewerProfileId, user.userId);
    if (!ownsViewer) return notOwner();
    const [viewer, viewed] = await Promise.all([
      d.profiles.getCards([viewerProfileId]).then((c) => c[0]),
      d.profiles.getCards([viewedProfileId]).then((c) => c[0]),
    ]);
    if (!viewer || !viewed) return err(new DomainError('NOT_FOUND', 'Perfil no encontrado'));
    const applies = canRecordView({
      viewer,
      viewed,
      viewerIsOwnedByUser: ownsViewer,
      viewedOwnerUserId: await d.profiles.getOwnerUserId(viewedProfileId),
      userId: user.userId,
      isAdmin: await d.isAdmin(adminEmailOf(user)),
    });
    if (!applies) return ok({ recorded: false });
    const now = d.now();
    return ok({
      recorded: await d.views.recordOnce(
        viewerProfileId,
        viewedProfileId,
        dayOf(now),
        now.toISOString(),
      ),
    });
  };
