/** Límite de ventana deslizante en memoria, por clave. Sin dependencias de negocio. */
export interface WindowLimiter {
  /** `true` y registra el uso si queda cupo en la ventana; `false` si no. */
  tryTake(key: string): boolean;
}

// shortcut: en memoria de un solo proceso; con varias instancias hay que moverlo a la BD (como record_claim_attempt).
export function createWindowLimiter(opts: {
  limit: number;
  windowMs: number;
  now: () => Date;
}): WindowLimiter {
  const uses = new Map<string, number[]>();
  return {
    tryTake(key) {
      const t = opts.now().getTime();
      const recent = (uses.get(key) ?? []).filter((at) => at > t - opts.windowMs);
      if (recent.length >= opts.limit) {
        uses.set(key, recent);
        return false;
      }
      uses.set(key, [...recent, t]);
      return true;
    },
  };
}
