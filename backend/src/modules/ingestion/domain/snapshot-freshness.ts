/** ADR-001: se reingiere como máximo 1 vez cada 24 h por perfil (cuida el crédito de Apify). */
export const SNAPSHOT_TTL_HOURS = 24;
const MS_PER_HOUR = 3_600_000;

export const isFresh = (fetchedAt: string, now: Date): boolean =>
  now.getTime() - new Date(fetchedAt).getTime() < SNAPSHOT_TTL_HOURS * MS_PER_HOUR;
