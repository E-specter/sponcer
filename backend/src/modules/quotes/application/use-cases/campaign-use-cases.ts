import { randomUUID } from 'node:crypto';
import type { Campaign } from '@sponcer/contracts';
import { decodeCursor, encodeCursor } from '../../../../shared/cursor';
import { DomainError } from '../../../../shared/errors';
import { err, ok, type Result } from '../../../../shared/result';
import type { ProfilesApi } from '../../../profiles';
import { campaignStats, canAdvance, type CampaignRecord } from '../../domain/campaign';
import type {
  CreateCampaign,
  GetCampaign,
  ListCampaigns,
  UpdateCampaign,
} from '../ports/in/quotes-use-cases';
import type { CampaignRepository } from '../ports/out/campaign-repository';
import type { QuoteRepository } from '../ports/out/quote-repository';

interface Deps {
  campaigns: CampaignRepository;
  quotes: QuoteRepository;
  profiles: ProfilesApi;
  now: () => Date;
  newId?: () => string;
}

const notOwner = () => err(new DomainError('FORBIDDEN', 'El perfil no es tuyo'));
const notFound = () => err(new DomainError('NOT_FOUND', 'Campaña no encontrada'));

async function withStats(d: Deps, c: CampaignRecord): Promise<Campaign> {
  return { ...c, stats: campaignStats(await d.quotes.listByCampaign(c.id)) };
}

export const makeListCampaigns =
  (d: Deps): ListCampaigns =>
  async (userId, profileId, page) => {
    if (!(await d.profiles.isOwner(profileId, userId))) return notOwner();
    const all = await d.campaigns.listByBrand(profileId, page.status);
    const parsed = decodeCursor(page.cursor);
    if (!parsed.ok) return parsed;
    const slice = all.slice(parsed.value, parsed.value + page.limit);
    const next = parsed.value + slice.length;
    return ok({
      items: await Promise.all(slice.map((c) => withStats(d, c))),
      nextCursor: next < all.length ? encodeCursor(next) : null,
    });
  };

export const makeGetCampaign =
  (d: Deps): GetCampaign =>
  async (userId, profileId, campaignId) => {
    if (!(await d.profiles.isOwner(profileId, userId))) return notOwner();
    const c = await d.campaigns.findById(campaignId);
    return c && c.brandProfileId === profileId ? ok(await withStats(d, c)) : notFound();
  };

export const makeCreateCampaign =
  (d: Deps): CreateCampaign =>
  async (userId, req) => {
    const brand = (await d.profiles.listByOwner(userId)).find((p) => p.id === req.brandProfileId);
    if (!brand) return notOwner();
    if (brand.role !== 'brand')
      return err(new DomainError('FORBIDDEN', 'Solo las marcas crean campañas'));
    const at = d.now().toISOString();
    const { activate, ...fields } = req;
    const record: CampaignRecord = {
      ...fields,
      id: (d.newId ?? randomUUID)(),
      description: req.description ?? null,
      status: activate ? 'active' : 'draft',
      createdAt: at,
      updatedAt: at,
    };
    await d.campaigns.save(record);
    return ok(await withStats(d, record));
  };

export const makeUpdateCampaign =
  (d: Deps): UpdateCampaign =>
  async (userId, campaignId, req) => {
    if (!(await d.profiles.isOwner(req.brandProfileId, userId))) return notOwner();
    const current = await d.campaigns.findById(campaignId);
    if (!current || current.brandProfileId !== req.brandProfileId) return notFound();

    const { brandProfileId: _brand, status, ...changes } = req;
    // Campo ausente = no tocar; null o [] explícitos = vaciar.
    const patch: Partial<CampaignRecord> = Object.fromEntries(
      Object.entries(changes).filter(([, v]) => v !== undefined),
    );
    if (status && !canAdvance(current.status, status))
      return err(
        new DomainError(
          'INVALID_TRANSITION',
          `La campaña no puede pasar de ${current.status} a ${status}`,
        ),
      );
    const next: CampaignRecord = {
      ...current,
      ...patch,
      status: status ?? current.status,
      updatedAt: d.now().toISOString(),
    };
    if (next.endsOn && next.endsOn < next.startsOn) return invalidDates();
    await d.campaigns.save(next);
    return ok(await withStats(d, next));
  };

const invalidDates = (): Result<never, DomainError> =>
  err(new DomainError('VALIDATION_ERROR', 'La fecha de fin no puede ser anterior al inicio.'));
