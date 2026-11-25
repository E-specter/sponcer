export interface RemovalRequestRecord {
  handle: string;
  email: string;
  reason?: string;
  createdAt: Date;
  /** `applied`: lo pidió el dueño verificado y la ficha se retiró; `pending`: espera revisión manual. */
  status?: 'pending' | 'applied';
}

export type RemovalStatus = 'pending' | 'applied' | 'rejected';

/** Pedido tal como se lee para la revisión de administradores. */
export interface StoredRemovalRequest {
  id: string;
  handle: string;
  email: string;
  reason: string | null;
  status: RemovalStatus;
  createdAt: Date;
  reviewedAt: Date | null;
  reviewNote: string | null;
}

export interface RemovalRequestStore {
  add(request: RemovalRequestRecord): Promise<void>;
  /** Más reciente primero. `offset` es la posición ya consumida. */
  list(q: {
    status?: RemovalStatus;
    offset: number;
    limit: number;
  }): Promise<{ items: StoredRemovalRequest[]; total: number }>;
  findById(id: string): Promise<StoredRemovalRequest | null>;
  /** Revisión atómica: solo si el pedido sigue `pending`. `false` si ya estaba revisado (o no existe). */
  review(
    id: string,
    r: { status: 'applied' | 'rejected'; at: Date; by: string; note?: string },
  ): Promise<boolean>;
}
