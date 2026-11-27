import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CONSENT_VERSION, type RegisterRequest } from '@sponcer/contracts';
import { createWorld, hasSupabase, serviceClient } from '../../../../db/tests/support/supabase';
import { createSupabaseAccountStore } from '../../../src/modules/auth/infrastructure/out/supabase/supabase-adapters';
import { createSupabaseProfileClaimer } from '../../../src/modules/profiles/infrastructure/out/supabase/supabase-adapters';
import { createSupabaseCampaignRepository } from '../../../src/modules/quotes/infrastructure/out/supabase/supabase-adapters';
import type { CampaignRecord } from '../../../src/modules/quotes/domain/campaign';

/** Registro de cuentas (RPC `register_account`), vínculo marca-empresa y campañas contra Supabase local (ADR-009). */
const SETUP_TIMEOUT_MS = 60_000;
const BUDGET_PEN = 15_000;
const consent = {
  acceptTerms: true,
  acceptPrivacy: true,
  consentVersion: CONSENT_VERSION,
} as const;
// RUC con dígito verificador válido y cuerpo aleatorio por corrida. NUNCA el RUC de un usuario sembrado
// (20100070970 es el de demo@sponcer.local): el `delete` de limpieza de más abajo le borraba la empresa y la
// cuenta demo quedaba con 500 en /me (auditoría F7).
const RUC_WEIGHTS = '5432765432';
const RUC_SPAN = 90_000_000;
const RUC_BASE = 10_000_000;
const rucBody = `20${RUC_BASE + Math.floor(Math.random() * RUC_SPAN)}`;
const RUC = `${rucBody}${(11 - ([...rucBody].reduce((a, d, i) => a + Number(RUC_WEIGHTS[i]) * Number(d), 0) % 11)) % 10}`;
const company = (documentNumber: string): RegisterRequest => ({
  accountKind: 'company',
  company: {
    personType: 'juridica',
    documentType: 'ruc',
    documentNumber,
    legalName: 'Empresa Real S.A.C.',
    tradeName: 'Real',
    city: 'lima',
  },
  ...consent,
});
const influencer: RegisterRequest = {
  accountKind: 'influencer',
  influencer: { displayName: 'Influencer Real', city: 'cusco', about: 'hola' },
  ...consent,
};

describe.skipIf(!hasSupabase)('cuentas y campañas (Supabase local)', () => {
  const sb = serviceClient();
  const world = createWorld(sb);
  const accounts = createSupabaseAccountStore(sb);

  beforeAll(async () => {
    await world.cleanup();
    // El RUC de prueba es único: un resto de una corrida anterior se limpia con su usuario (cascada).
    await sb.from('companies').delete().eq('document_number', RUC);
  }, SETUP_TIMEOUT_MS);
  afterAll(async () => {
    await world.cleanup();
  }, SETUP_TIMEOUT_MS);

  describe('registro', () => {
    it('antes de registrarse la cuenta está pendiente', async () => {
      const user = await world.newUser();
      expect(await accounts.get(user.id)).toEqual({
        accountKind: null,
        company: null,
        influencer: null,
      });
    });

    it('registra una empresa con su consentimiento y la devuelve completa', async () => {
      const user = await world.newUser();
      await accounts.register(user.id, company(RUC));
      const account = await accounts.get(user.id);
      expect(account).toMatchObject({
        accountKind: 'company',
        influencer: null,
        company: { documentNumber: RUC, tradeName: 'Real', city: 'lima' },
      });
      const consents = await sb.from('consents').select('*').eq('user_id', user.id);
      expect(consents.data).toMatchObject([
        { version: CONSENT_VERSION, terms: true, privacy: true },
      ]);
    });

    it('registra un influencer', async () => {
      const user = await world.newUser();
      await accounts.register(user.id, influencer);
      expect(await accounts.get(user.id)).toEqual({
        accountKind: 'influencer',
        company: null,
        influencer: { displayName: 'Influencer Real', city: 'cusco', about: 'hola' },
      });
    });

    it('409 si el usuario ya está registrado, y no se duplica nada', async () => {
      const user = await world.newUser();
      await accounts.register(user.id, influencer);
      await expect(accounts.register(user.id, influencer)).rejects.toMatchObject({
        code: 'CONFLICT',
        details: { reason: 'already_registered' },
      });
      const consents = await sb.from('consents').select('user_id').eq('user_id', user.id);
      expect(consents.data).toHaveLength(1);
    });

    it('documento duplicado: CONFLICT con mensaje claro y la cuenta queda sin registrar (transacción)', async () => {
      const [first, second] = [await world.newUser(), await world.newUser()];
      await sb.from('companies').delete().eq('document_number', RUC);
      await accounts.register(first.id, company(RUC));
      await expect(accounts.register(second.id, company(RUC))).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'Ya existe una empresa registrada con ese RUC',
      });
      expect((await accounts.get(second.id)).accountKind).toBeNull();
      const rows = await sb.from('accounts').select('user_id').eq('user_id', second.id);
      expect(rows.data).toEqual([]);
    });
  });

  describe('marcas ligadas a la empresa (claim_profile)', () => {
    const claimer = createSupabaseProfileClaimer(sb);

    it('una marca reclamada por una Empresa queda con su company_id; un creador, sin él', async () => {
      const user = await world.newUser();
      await sb.from('companies').delete().eq('document_number', RUC);
      await accounts.register(user.id, company(RUC));
      const companyId = (await accounts.get(user.id)).company!.id;
      const [brandHandle, creatorHandle] = [world.newHandle(), world.newHandle()];
      const brand = await claimer.claim(brandHandle, user.id, 'brand');
      const creator = await claimer.claim(creatorHandle, user.id, 'creator');
      if (brand.status !== 'claimed' || creator.status !== 'claimed') throw new Error('claim');
      const rows = await sb
        .from('profiles')
        .select('id, company_id')
        .in('id', [brand.profileId, creator.profileId]);
      const byId = new Map((rows.data ?? []).map((r) => [r.id, r.company_id]));
      expect([byId.get(brand.profileId), byId.get(creator.profileId)]).toEqual([companyId, null]);
      // Rastrea los perfiles creados por el RPC para que cleanup los borre.
      await sb.from('profiles').delete().in('id', [brand.profileId, creator.profileId]);
    });
  });

  describe('campañas', () => {
    const campaigns = createSupabaseCampaignRepository(sb);
    const record = (
      brandProfileId: string,
      over: Partial<CampaignRecord> = {},
    ): CampaignRecord => ({
      id: randomUUID(),
      brandProfileId,
      name: 'Verano',
      kind: 'season',
      description: null,
      startsOn: '2026-12-15',
      endsOn: '2027-03-15',
      budgetPen: BUDGET_PEN,
      targetNiches: ['moda', 'fitness'],
      targetCities: ['lima'],
      status: 'draft',
      createdAt: '2026-11-27T10:00:00.000Z',
      updatedAt: '2026-11-27T10:00:00.000Z',
      ...over,
    });

    it('save + findById conserva todos los campos, y save de nuevo actualiza', async () => {
      const brand = await world.newProfile('brand');
      const c = record(brand.id);
      await campaigns.save(c);
      expect(await campaigns.findById(c.id)).toEqual(c);
      await campaigns.save({ ...c, status: 'active', endsOn: null, targetNiches: [] });
      expect(await campaigns.findById(c.id)).toMatchObject({
        status: 'active',
        endsOn: null,
        targetNiches: [],
      });
    });

    it('listByBrand filtra por marca y estado, la más reciente primero', async () => {
      const [brand, other] = [await world.newProfile('brand'), await world.newProfile('brand')];
      const old = record(brand.id, { createdAt: '2026-11-01T10:00:00.000Z' });
      const recent = record(brand.id, { status: 'active', createdAt: '2026-11-20T10:00:00.000Z' });
      await Promise.all([old, recent, record(other.id)].map((c) => campaigns.save(c)));
      expect((await campaigns.listByBrand(brand.id)).map((c) => c.id)).toEqual([recent.id, old.id]);
      expect((await campaigns.listByBrand(brand.id, 'active')).map((c) => c.id)).toEqual([
        recent.id,
      ]);
    });

    it('la BD rechaza una campaña que termina antes de empezar', async () => {
      const brand = await world.newProfile('brand');
      await expect(
        campaigns.save(record(brand.id, { startsOn: '2026-12-15', endsOn: '2026-12-01' })),
      ).rejects.toThrow();
    });

    it('una cotización sin campaña la rechaza la BD (campaign_id es obligatorio)', async () => {
      const [creator, brand] = [await world.newProfile('creator'), await world.newProfile('brand')];
      const res = await sb.from('quotes').insert({
        creator_profile_id: creator.id,
        requester_profile_id: brand.id,
        status: 'sent',
        message: 'sin campaña',
      });
      expect(res.error).not.toBeNull();
    });
  });
});
