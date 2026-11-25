import type { Quote, QuoteRecord } from '@sponcer/contracts';
import { DomainError } from '../../../shared/errors';
import { err, ok, type Result } from '../../../shared/result';
import type { ProfilesApi } from '../../profiles';

/** Enriquece el registro con las dos partes y el servicio (lo que devuelve la API). */
export async function toQuoteViews(
  profiles: ProfilesApi,
  records: QuoteRecord[],
): Promise<Result<Quote[], DomainError>> {
  const ids = [...new Set(records.flatMap((r) => [r.creatorProfileId, r.requesterProfileId]))];
  const cards = new Map((await profiles.getCards(ids)).map((c) => [c.id, c]));
  const services = await Promise.all(records.map((r) => profiles.getService(r.serviceId)));
  const views = records.map((r, i) => {
    const [creator, requester, service] = [
      cards.get(r.creatorProfileId),
      cards.get(r.requesterProfileId),
      services[i]?.service,
    ];
    return creator && requester && service ? { ...r, creator, requester, service } : null;
  });
  return views.every((v) => v !== null)
    ? ok(views)
    : err(new DomainError('INTERNAL_ERROR', 'Cotización con perfil o servicio no disponible'));
}

export async function toQuoteView(
  profiles: ProfilesApi,
  record: QuoteRecord,
): Promise<Result<Quote, DomainError>> {
  const r = await toQuoteViews(profiles, [record]);
  return r.ok ? ok(r.value[0]!) : r;
}
