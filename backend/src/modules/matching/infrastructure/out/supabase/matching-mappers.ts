import type { Interaction, MatchRecord } from '../../../domain/candidate';

/** Filas de `interactions` / `matches` y del RPC: no salen de este adaptador. */
export interface InteractionRow {
  id: string;
  actor_profile_id: string;
  target_profile_id: string;
  kind: 'interest' | 'dismiss';
  created_at: string;
}
export interface MatchRow {
  id: string;
  creator_profile_id: string;
  brand_profile_id: string;
  created_at: string;
}
export interface CandidateRow {
  profile_id: string;
  similarity: number;
}

const iso = (ts: string) => new Date(ts).toISOString();

export const interactionToRow = (i: Interaction) => ({
  id: i.id,
  actor_profile_id: i.actorProfileId,
  target_profile_id: i.targetProfileId,
  kind: i.kind,
  created_at: i.createdAt,
  updated_at: i.createdAt,
});

export const rowToInteraction = (r: InteractionRow): Interaction => ({
  id: r.id,
  actorProfileId: r.actor_profile_id,
  targetProfileId: r.target_profile_id,
  kind: r.kind,
  createdAt: iso(r.created_at),
});

export const matchToRow = (m: MatchRecord) => ({
  id: m.id,
  creator_profile_id: m.creatorProfileId,
  brand_profile_id: m.brandProfileId,
  created_at: m.createdAt,
});

export const rowToMatch = (r: MatchRow): MatchRecord => ({
  id: r.id,
  creatorProfileId: r.creator_profile_id,
  brandProfileId: r.brand_profile_id,
  createdAt: iso(r.created_at),
});
