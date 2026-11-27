import { describe, expect, it } from 'vitest';
import {
  demoInfluencer,
  demoUser,
  fixtureProfiles,
  fixtureSocial,
} from '@sponcer/contracts/fixtures';
import { createEventBus } from '../../../../shared/events/event-bus';
import { createProfilesModule } from '../../../profiles';
import {
  createMockCampaignRepository,
  createMockQuoteRepository,
} from '../../infrastructure/out/mock/mock-adapters';
import {
  makeCreateCampaign,
  makeGetCampaign,
  makeListCampaigns,
  makeUpdateCampaign,
} from './campaign-use-cases';

const MISSING = '00000000-0000-4000-8000-000000000001';
const NOW = new Date('2026-11-27T10:00:00Z');
const PAGE = 50;
const BUDGET = 8000;
const profile = (handle: string) => fixtureProfiles.find((p) => p.snapshot.handle === handle)!;
const rumbo = profile('rumbo.viajes.demo');
const andina = profile('andina.snacks.demo');
const kallpa = profile('kallpa.sport.demo');
const sofi = profile('sofi.moda.demo');
const GENERAL = fixtureSocial.campaigns.find((c) => c.brandProfileId === rumbo.id)!;
const DRAFT = fixtureSocial.campaigns.find((c) => c.brandProfileId === andina.id)!;

function setup() {
  const profiles = createProfilesModule({ adapter: 'mock', bus: createEventBus() }).api;
  const d = {
    campaigns: createMockCampaignRepository(),
    quotes: createMockQuoteRepository(),
    profiles,
    now: () => NOW,
    newId: () => '99999999-9999-4999-8999-999999999999',
  };
  return {
    list: makeListCampaigns(d),
    get: makeGetCampaign(d),
    create: makeCreateCampaign(d),
    update: makeUpdateCampaign(d),
  };
}

const newCampaign = {
  brandProfileId: andina.id,
  name: 'Fiestas Patrias',
  kind: 'season' as const,
  description: null,
  startsOn: '2027-07-01',
  endsOn: null,
  budgetPen: BUDGET,
  targetNiches: [],
  targetCities: ['lima' as const],
  activate: false,
};

describe('campañas', () => {
  it('crea en borrador (o activa con activate) con stats en cero, solo para marcas propias', async () => {
    const { create } = setup();
    const draft = await create(demoUser.id, newCampaign);
    expect(draft.ok && [draft.value.status, draft.value.stats]).toEqual([
      'draft',
      { quotes: 0, byStatus: {}, committedPen: 0 },
    ]);
    const active = await create(demoUser.id, { ...newCampaign, activate: true });
    expect(active.ok && active.value.status).toBe('active');
    const code = async (u: string, brandProfileId: string) => {
      const r = await create(u, { ...newCampaign, brandProfileId });
      return !r.ok && r.error.code;
    };
    expect(await code(demoUser.id, kallpa.id)).toBe('FORBIDDEN');
    expect(await code(demoInfluencer.id, sofi.id)).toBe('FORBIDDEN');
  });

  it('lista las de la marca con su avance y pagina; rechaza perfiles ajenos', async () => {
    const { list } = setup();
    const mine = await list(demoUser.id, rumbo.id, { limit: PAGE });
    expect(mine.ok && mine.value.items.map((c) => [c.id, c.stats.quotes])).toEqual([
      [GENERAL.id, 1],
    ]);
    const drafts = await list(demoUser.id, andina.id, { limit: PAGE, status: 'active' });
    expect(drafts.ok && drafts.value.items).toEqual([]);
    const other = await list(demoUser.id, kallpa.id, { limit: PAGE });
    expect(!other.ok && other.error.code).toBe('FORBIDDEN');
  });

  it('el detalle exige que la campaña sea de ese perfil', async () => {
    const { get } = setup();
    const ok = await get(demoUser.id, rumbo.id, GENERAL.id);
    expect(ok.ok && ok.value.stats.byStatus).toEqual({ sent: 1 });
    const wrongBrand = await get(demoUser.id, andina.id, GENERAL.id);
    const missing = await get(demoUser.id, rumbo.id, MISSING);
    expect([wrongBrand, missing].map((r) => !r.ok && r.error.code)).toEqual([
      'NOT_FOUND',
      'NOT_FOUND',
    ]);
  });

  it('el estado solo avanza; editar campos no pisa los que no se envían', async () => {
    const { update, get } = setup();
    const activated = await update(demoUser.id, DRAFT.id, {
      brandProfileId: andina.id,
      status: 'active',
      name: 'Verano 2027 (v2)',
    });
    expect(activated.ok && [activated.value.status, activated.value.name]).toEqual([
      'active',
      'Verano 2027 (v2)',
    ]);
    const kept = await get(demoUser.id, andina.id, DRAFT.id);
    expect(kept.ok && [kept.value.budgetPen, kept.value.targetNiches, kept.value.endsOn]).toEqual([
      DRAFT.budgetPen,
      DRAFT.targetNiches,
      DRAFT.endsOn,
    ]);
    const back = await update(demoUser.id, DRAFT.id, {
      brandProfileId: andina.id,
      status: 'draft',
    });
    expect(!back.ok && back.error.code).toBe('INVALID_TRANSITION');
    const closed = await update(demoUser.id, DRAFT.id, {
      brandProfileId: andina.id,
      status: 'closed',
    });
    expect(closed.ok && closed.value.status).toBe('closed');
    const reopen = await update(demoUser.id, DRAFT.id, {
      brandProfileId: andina.id,
      status: 'active',
    });
    expect(!reopen.ok && reopen.error.code).toBe('INVALID_TRANSITION');
  });

  it('null y [] explícitos vacían budgetPen, endsOn y las listas; un PATCH solo con name no toca el resto', async () => {
    const { update } = setup();
    const renamed = await update(demoUser.id, DRAFT.id, {
      brandProfileId: andina.id,
      name: 'Otro',
    });
    expect(
      renamed.ok && [
        renamed.value.budgetPen,
        renamed.value.targetNiches,
        renamed.value.targetCities,
      ],
    ).toEqual([DRAFT.budgetPen, DRAFT.targetNiches, DRAFT.targetCities]);
    const cleared = await update(demoUser.id, DRAFT.id, {
      brandProfileId: andina.id,
      endsOn: null,
      budgetPen: null,
      targetNiches: [],
      targetCities: [],
    });
    expect(
      cleared.ok && [
        cleared.value.endsOn,
        cleared.value.budgetPen,
        cleared.value.targetNiches,
        cleared.value.targetCities,
      ],
    ).toEqual([null, null, [], []]);
  });

  it('valida fechas al combinar con lo guardado y la titularidad', async () => {
    const { update } = setup();
    const badDates = await update(demoUser.id, DRAFT.id, {
      brandProfileId: andina.id,
      endsOn: '2026-01-01',
    });
    expect(!badDates.ok && badDates.error.code).toBe('VALIDATION_ERROR');
    const stranger = await update(demoInfluencer.id, DRAFT.id, { brandProfileId: andina.id });
    const crossBrand = await update(demoUser.id, DRAFT.id, { brandProfileId: rumbo.id });
    expect([stranger, crossBrand].map((r) => !r.ok && r.error.code)).toEqual([
      'FORBIDDEN',
      'NOT_FOUND',
    ]);
  });
});
