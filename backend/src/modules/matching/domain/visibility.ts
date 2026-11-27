// Reglas puras de Visibilidad (ADR-009 decisión 5).
import type { Interaction } from './candidate';

const DAY_MS = 86_400_000;
export const SHORT_DAYS = 7;
export const LONG_DAYS = 30;

/** Día UTC `YYYY-MM-DD` (la PK de profile_views usa este día). */
const DAY_LENGTH = 'YYYY-MM-DD'.length;
export const dayOf = (d: Date): string => d.toISOString().slice(0, DAY_LENGTH);
export const daysAgo = (now: Date, days: number): Date => new Date(now.getTime() - days * DAY_MS);

export interface ViewRow {
  viewerProfileId: string;
  viewedOn: string;
  count: number;
  lastAt: string;
}

/** Quién puede registrar una visita: perfil propio, tipo opuesto, ficha ajena con dueño, y no admin. */
export function canRecordView(c: {
  viewer: { id: string; role: string };
  viewed: { id: string; role: string };
  viewerIsOwnedByUser: boolean;
  viewedOwnerUserId: string | null;
  userId: string;
  isAdmin: boolean;
}): boolean {
  return (
    !c.isAdmin &&
    c.viewerIsOwnedByUser &&
    c.viewer.id !== c.viewed.id &&
    c.viewer.role !== c.viewed.role &&
    c.viewedOwnerUserId !== null &&
    c.viewedOwnerUserId !== c.userId
  );
}

/**
 * Intereses recibidos sin match: `interest` cuyo actor no tiene match conmigo y al que yo no descarté.
 * `reciprocated` = yo ya le marqué interés (lo normal es false: si fuera true ya habría match).
 */
export function pendingInterests(
  received: Interaction[],
  mine: Interaction[],
  matchedWith: ReadonlySet<string>,
): Array<{ actorProfileId: string; at: string; reciprocated: boolean }> {
  const myKind = new Map(mine.map((i) => [i.targetProfileId, i.kind]));
  return received
    .filter(
      (i) =>
        i.kind === 'interest' &&
        !matchedWith.has(i.actorProfileId) &&
        myKind.get(i.actorProfileId) !== 'dismiss',
    )
    .map((i) => ({
      actorProfileId: i.actorProfileId,
      at: i.createdAt,
      reciprocated: myKind.get(i.actorProfileId) === 'interest',
    }));
}

/** Una entrada por visitante: última visita, visitas en 30 días y visitas dentro de `sinceDay` (7d). */
export function groupViews(rows: ViewRow[], shortSinceDay: string) {
  return rows.reduce((by, r) => {
    const cur = by.get(r.viewerProfileId);
    return by.set(r.viewerProfileId, {
      at: cur && cur.at > r.lastAt ? cur.at : r.lastAt,
      count: (cur?.count ?? 0) + r.count,
      inShort: Boolean(cur?.inShort) || r.viewedOn >= shortSinceDay,
    });
  }, new Map<string, { at: string; count: number; inShort: boolean }>());
}
