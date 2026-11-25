export interface RemovalRequestRecord {
  handle: string;
  email: string;
  reason?: string;
  createdAt: Date;
  /** `applied`: lo pidió el dueño verificado y la ficha se retiró; `pending`: espera revisión manual. */
  status?: 'pending' | 'applied';
}

export interface RemovalRequestStore {
  add(request: RemovalRequestRecord): Promise<void>;
}
