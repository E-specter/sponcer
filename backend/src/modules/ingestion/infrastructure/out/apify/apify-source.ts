import { ApifyClient } from 'apify-client';
import type { IgProfileSnapshot } from '@sponcer/contracts';
import { DomainError } from '../../../../../shared/errors';
import { logger } from '../../../../../shared/logger';
import { err, type Result } from '../../../../../shared/result';
import type { InstagramSource } from '../../../application/ports/out/instagram-source';
import { mapApifyProfile } from './apify-mapper';

const ACTOR_ID = 'apify/instagram-profile-scraper';
const LIVE_URL = 'https://apify--instagram-profile-scraper.apify.actor/';

const MS_PER_SECOND = 1000;
const LIVE_TIMEOUT_SECS = 15;
const LIVE_TIMEOUT_MS = LIVE_TIMEOUT_SECS * MS_PER_SECOND;
/** Tope de espera del run del actor y de cada request del cliente. */
const RUN_WAIT_SECS = 120;
const REQUEST_TIMEOUT_SECS = 30;

/** Los detalles internos del proveedor van al log, nunca al cuerpo de error que llega al cliente. */
const upstream = (message: string, details?: unknown) => {
  if (details !== undefined) logger.warn(message, details);
  return err(new DomainError('UPSTREAM_ERROR', message));
};

/** El proveedor puede responder con otra cuenta (renombrada, coincidencia aproximada): no sirve. */
const onlyRequested = (
  r: Result<IgProfileSnapshot, DomainError>,
  handle: string,
): Result<IgProfileSnapshot, DomainError> =>
  r.ok && r.value.handle.toLowerCase() !== handle
    ? upstream('El proveedor devolvió otra cuenta', r.value.handle)
    : r;
const notFound = (handle: string) =>
  err(new DomainError('NOT_FOUND', `Perfil @${handle} no encontrado`));

/** Adaptador real. Cada llamada cuesta crédito: la caché de 24 h la aplica el caso de uso, no aquí. */
export function createApifySource(deps: { token: string; now: () => Date }): InstagramSource {
  const client = new ApifyClient({ token: deps.token, timeoutSecs: REQUEST_TIMEOUT_SECS });

  // Lote con un solo usuario; `usernames` admite varios para un backfill futuro.
  const fetchProfile = async (handle: string): Promise<Result<IgProfileSnapshot, DomainError>> => {
    try {
      const run = await client
        .actor(ACTOR_ID)
        .call({ usernames: [handle] }, { waitSecs: RUN_WAIT_SECS });
      const { items } = await client.dataset(run.defaultDatasetId).listItems();
      return items[0]
        ? onlyRequested(mapApifyProfile(items[0], deps.now()), handle)
        : notFound(handle);
    } catch (e) {
      return upstream('Falló la ingesta en el proveedor', String(e));
    }
  };

  // Server Actor: no escribe dataset y se cobra como 1 perfil (ADR-001).
  const fetchLiveBio = async (handle: string): Promise<Result<IgProfileSnapshot, DomainError>> => {
    try {
      const res = await fetch(`${LIVE_URL}?username=${encodeURIComponent(handle)}`, {
        headers: { Authorization: `Bearer ${deps.token}` },
        signal: AbortSignal.timeout(LIVE_TIMEOUT_MS),
      });
      if (!res.ok) return upstream(`El proveedor respondió ${res.status}`);
      const json: unknown = await res.json();
      const item = Array.isArray(json) ? json[0] : json;
      return item ? onlyRequested(mapApifyProfile(item, deps.now()), handle) : notFound(handle);
    } catch (e) {
      return upstream('Falló la lectura en vivo en el proveedor', String(e));
    }
  };

  return { fetchProfile, fetchLiveBio };
}
