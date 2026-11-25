import type { ProfileCard } from '@sponcer/contracts';

/** Perfil evaluable: tarjeta pública + embedding (null si aún no se clasificó). */
export interface Candidate {
  card: ProfileCard;
  embedding: number[] | null;
  /** Coseno ya calculado por la búsqueda (pgvector); si viene, el scoring no recalcula. */
  similarity?: number;
}

export interface Interaction {
  id: string;
  actorProfileId: string;
  targetProfileId: string;
  kind: 'interest' | 'dismiss';
  createdAt: string;
}

export interface MatchRecord {
  id: string;
  creatorProfileId: string;
  brandProfileId: string;
  createdAt: string;
}
