/** Handles excluidos a pedido del titular (Ley 29733): nunca se ingieren. */
export interface IngestionBlocklist {
  isBlocked(handle: string): Promise<boolean>;
  /** Idempotente. */
  add(handle: string): Promise<void>;
}
