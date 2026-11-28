import type { ProfileCard, ProfileSummary, Quote, QuoteRecord } from '@sponcer/contracts';
import { DomainError } from '../../../shared/errors';
import { err, ok, type Result } from '../../../shared/result';
import type { ProfilesApi } from '../../profiles';
import type { CampaignRepository } from './ports/out/campaign-repository';

/** Exactamente `ProfileSummary` (el contrato no lleva la tarjeta completa): no depender del recorte del esquema. */
const toSummary = (c: ProfileCard): ProfileSummary => ({
  id: c.id,
  handle: c.handle,
  role: c.role,
  fullName: c.fullName,
  profilePicUrl: c.profilePicUrl,
  status: c.status,
});

/** Enriquece el registro con las dos partes, el servicio (si lo hay) y la campaña (lo que devuelve la API). */
export async function toQuoteViews(
  deps: { profiles: ProfilesApi; campaigns: CampaignRepository },
  records: QuoteRecord[],
): Promise<Result<Quote[], DomainError>> {
  const ids = [...new Set(records.flatMap((r) => [r.creatorProfileId, r.requesterProfileId]))];
  const campaignIds = [...new Set(records.map((r) => r.campaignId))];
  const [cardList, services, campaignList] = await Promise.all([
    deps.profiles.getCards(ids),
    Promise.all(records.map((r) => (r.serviceId ? deps.profiles.getService(r.serviceId) : null))),
    Promise.all(campaignIds.map((id) => deps.campaigns.findById(id))),
  ]);
  const cards = new Map(cardList.map((c) => [c.id, c]));
  const campaigns = new Map(campaignList.flatMap((c) => (c ? [[c.id, c] as const] : [])));
  const views = records.map((r, i) => {
    const [creator, requester, campaign] = [
      cards.get(r.creatorProfileId),
      cards.get(r.requesterProfileId),
      campaigns.get(r.campaignId),
    ];
    const service = r.serviceId ? (services[i]?.service ?? null) : null;
    if (!creator || !requester || !campaign || (r.serviceId && !service)) return null;
    return {
      ...r,
      creator: toSummary(creator),
      requester: toSummary(requester),
      service,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        kind: campaign.kind,
        status: campaign.status,
      },
    };
  });
  return views.every((v) => v !== null)
    ? ok(views)
    : err(
        new DomainError(
          'INTERNAL_ERROR',
          'Cotización con perfil, servicio o campaña no disponible',
        ),
      );
}

export async function toQuoteView(
  deps: { profiles: ProfilesApi; campaigns: CampaignRepository },
  record: QuoteRecord,
): Promise<Result<Quote, DomainError>> {
  const r = await toQuoteViews(deps, [record]);
  return r.ok ? ok(r.value[0]!) : r;
}
