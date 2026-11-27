import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, CONSENT_VERSION, QUOTES_PER_BRAND_PER_HOUR } from '@sponcer/contracts';
import {
  createWorld,
  hasSupabase,
  serviceClient,
  supabaseEnv,
  TEST_EMAIL_DOMAIN,
  uniqueTag,
  type TestUser,
} from '../../../../db/tests/support/supabase';
import { composeApp } from '../../../src/compose';
import { loadEnv } from '../../../src/config/env';
import { STATUS } from '../../support/app';

/**
 * Auditoría F7 (ADR-009) con TODOS los adaptadores reales contra Supabase local y HTTP real (supertest, JWT reales):
 * registro, campañas, cotización múltiple, visibilidad y privacidad. Las rutas se llaman como lo hace el frontend.
 * Los defectos de producto se dejan como `it.fails` (pasan hoy; al corregirlos fallarán y hay que quitar `.fails`).
 */
const SETUP_TIMEOUT_MS = 90_000;
const DAY_MS = 86_400_000;
const WEIGHTS = '5432765432';
const ISO_DAY = 10;
const BULK = 20;

/** RUC válido con el prefijo dado: 10 dígitos de cuerpo + dígito verificador SUNAT. */
const SEED_BASE = 100_000_000;
const rucWith = (prefix: '10' | '20', seq: number): string => {
  const body = `${prefix}${String(SEED_BASE + seq).slice(-8)}`;
  const sum = [...body].reduce((a, d, i) => a + Number(WEIGHTS[i]) * Number(d), 0);
  return `${body}${(11 - (sum % 11)) % 10}`;
};
const uniqueSeq = () => Math.floor(Math.random() * 90_000_000);
const dniOf = () => String(10_000_000 + uniqueSeq()).slice(0, 8);

const consent = { acceptTerms: true, acceptPrivacy: true, consentVersion: CONSENT_VERSION };
const companyBody = (documentNumber: string, over: object = {}) => ({
  accountKind: 'company',
  company: {
    personType: 'juridica',
    documentType: 'ruc',
    documentNumber,
    legalName: 'Auditoria F7 S.A.C.',
    tradeName: 'Audit',
    city: 'lima',
    ...over,
  },
  ...consent,
});
const influencerBody = {
  accountKind: 'influencer',
  influencer: { displayName: 'Influencer Audit', city: 'cusco', about: 'prueba' },
  ...consent,
};
const dayAgo = (n: number) => new Date(Date.now() - n * DAY_MS);

describe.skipIf(!hasSupabase)('F7 · empresas, campañas y visibilidad (Supabase local)', () => {
  const sb = serviceClient();
  const world = createWorld(sb);
  const tag = uniqueTag();
  const taken: string[] = []; // RUC/DNI usados, para limpiar
  let app: ReturnType<typeof composeApp>['app'];

  type Actor = { user: TestUser; jwt: string };
  const as = (jwt: string | null) => (jwt ? { Authorization: `Bearer ${jwt}` } : {});
  const get = (a: Actor | null, path: string) =>
    request(app)
      .get(path)
      .set(as(a?.jwt ?? null));
  const post = (a: Actor | null, path: string, body: object = {}) =>
    request(app)
      .post(path)
      .set(as(a?.jwt ?? null))
      .send(body);
  const patch = (a: Actor | null, path: string, body: object = {}) =>
    request(app)
      .patch(path)
      .set(as(a?.jwt ?? null))
      .send(body);
  const newActor = async (): Promise<Actor> => {
    const user = await world.newUser();
    return { user, jwt: await world.signIn(user) };
  };
  const register = (a: Actor, body: object) => post(a, api.register.path, body);
  const newRuc = (prefix: '10' | '20' = '20') => {
    const r = rucWith(prefix, uniqueSeq());
    taken.push(r);
    return r;
  };
  /** Empresa registrada con una marca propia (perfil verificado en la BD, sin pasar por Instagram). */
  const newCompany = async () => {
    const actor = await newActor();
    const res = await register(actor, companyBody(newRuc()));
    expect(res.status, JSON.stringify(res.body)).toBe(STATUS.OK);
    const brand = await world.newProfile('brand', actor.user.id);
    return { actor, brand, companyId: res.body.account.company.id as string };
  };
  const newInfluencer = async () => {
    const actor = await newActor();
    const res = await register(actor, influencerBody);
    expect(res.status, JSON.stringify(res.body)).toBe(STATUS.OK);
    const creator = await world.newProfile('creator', actor.user.id);
    return { actor, creator };
  };
  const campaignBody = (brandProfileId: string, over: object = {}) => ({
    brandProfileId,
    name: 'Verano 2027',
    kind: 'season',
    description: 'Lanzamiento',
    startsOn: '2026-12-01',
    endsOn: '2027-03-01',
    budgetPen: 5000,
    targetNiches: ['moda', 'fitness'],
    targetCities: ['lima', 'cusco'],
    activate: true,
    ...over,
  });
  const campaignUrl = (id: string) => api.getCampaign.path.replace(':campaignId', id);
  const newCampaign = async (c: { actor: Actor; brand: { id: string } }, over: object = {}) => {
    const res = await post(c.actor, api.createCampaign.path, campaignBody(c.brand.id, over));
    expect(res.status, JSON.stringify(res.body)).toBe(STATUS.OK);
    return res.body as { id: string; status: string; stats: { quotes: number } };
  };
  const quote = (
    c: { actor: Actor; brand: { id: string } },
    campaignId: string,
    targets: object[],
    over: object = {},
  ) =>
    post(c.actor, api.createQuote.path, {
      requesterProfileId: c.brand.id,
      campaignId,
      targets,
      message: 'Hola, ¿colaboramos?',
      ...over,
    });

  const clean = async () => {
    await sb.from('companies').delete().in('document_number', taken);
    const users = await sb.auth.admin.listUsers({ perPage: 1000 });
    await Promise.all(
      users.data.users
        .filter((u) => u.email?.includes(`.${tag}@`))
        .map((u) => sb.auth.admin.deleteUser(u.id)),
    );
  };

  let admin: Actor;
  beforeAll(async () => {
    admin = await newActor();
    const composed = composeApp(
      loadEnv({
        NODE_ENV: 'test',
        ADAPTER_AUTH: 'real',
        ADAPTER_PROFILES: 'real',
        ADAPTER_INGESTION: 'mock',
        ADAPTER_CLASSIFICATION: 'real',
        ADAPTER_MATCHING: 'real',
        ADAPTER_QUOTES: 'real',
        ADAPTER_NOTIFICATIONS: 'real',
        ADAPTER_CHAT: 'real',
        ADMIN_EMAILS: admin.user.email,
        ...supabaseEnv(),
      }),
    );
    app = composed.app;
    await composed.backfill;
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await clean();
    await world.cleanup();
  }, SETUP_TIMEOUT_MS);

  // ---------------------------------------------------------------------------------------------------------
  describe('registro', () => {
    it('401 sin sesión', async () => {
      expect((await register(null as unknown as Actor, influencerBody)).status).toBe(
        STATUS.UNAUTHORIZED,
      );
    });

    it('un usuario sin registro (Me.account.accountKind null) no puede reclamar un perfil', async () => {
      const a = await newActor();
      const me = await get(a, api.me.path);
      expect(me.body.account).toEqual({ accountKind: null, company: null, influencer: null });
      const res = await post(a, api.startClaim.path, { handle: 'sin.registro', role: 'brand' });
      expect(res.status).toBe(STATUS.FORBIDDEN);
      expect(res.body.error.details).toMatchObject({ reason: 'registration_required' });
    });

    it('Empresa jurídica con RUC válido: 200, Me completo y consentimiento con la versión', async () => {
      const a = await newActor();
      const ruc = newRuc('20');
      const res = await register(a, companyBody(ruc));
      expect(res.status).toBe(STATUS.OK);
      expect(res.body.account).toMatchObject({
        accountKind: 'company',
        influencer: null,
        company: { documentNumber: ruc, personType: 'juridica', city: 'lima' },
      });
      const rows = await sb.from('consents').select('*').eq('user_id', a.user.id);
      expect(rows.data).toMatchObject([{ version: CONSENT_VERSION, terms: true, privacy: true }]);
      expect(typeof rows.data?.[0]?.accepted_at).toBe('string');
    });

    it('persona natural: RUC 10… válido o DNI de 8 dígitos', async () => {
      const [a, b] = [await newActor(), await newActor()];
      const ruc = newRuc('10');
      expect(
        (await register(a, companyBody(ruc, { personType: 'natural', documentType: 'ruc' })))
          .status,
      ).toBe(STATUS.OK);
      const dni = dniOf();
      taken.push(dni);
      expect(
        (await register(b, companyBody(dni, { personType: 'natural', documentType: 'dni' })))
          .status,
      ).toBe(STATUS.OK);
    });

    it.each([
      ['RUC con dígito verificador incorrecto', { documentNumber: '20100070971' }],
      ['RUC de 10 dígitos', { documentNumber: '2010007097' }],
      ['RUC con letras', { documentNumber: '2010007097A' }],
      [
        'RUC 20 declarado como persona natural',
        { personType: 'natural', documentNumber: '20100070970' },
      ],
      ['RUC 10 declarado como persona jurídica', { documentNumber: rucWith('10', 55) }],
      ['persona jurídica con DNI', { documentType: 'dni', documentNumber: '45678912' }],
      [
        'DNI de 7 dígitos',
        { personType: 'natural', documentType: 'dni', documentNumber: '4567891' },
      ],
      ['DNI con letra', { personType: 'natural', documentType: 'dni', documentNumber: '4567891X' }],
      ['ciudad fuera del catálogo', { city: 'atlantida' }],
      ['razón social de 1 letra', { legalName: 'A' }],
    ])('400 y sin cuenta creada: %s', async (_name, over) => {
      const a = await newActor();
      const res = await register(a, companyBody('20100070970', over));
      expect(res.status).toBe(STATUS.BAD_REQUEST);
      expect((await sb.from('accounts').select('user_id').eq('user_id', a.user.id)).data).toEqual(
        [],
      );
    });

    it.each([
      ['términos sin aceptar', { acceptTerms: false }],
      ['privacidad sin aceptar', { acceptPrivacy: false }],
      ['versión de consentimiento vieja', { consentVersion: '2020-01-01' }],
      ['sin versión', { consentVersion: undefined }],
    ])('400 sin consentimiento válido: %s', async (_n, over) => {
      const a = await newActor();
      const res = await register(a, { ...influencerBody, ...over });
      expect(res.status).toBe(STATUS.BAD_REQUEST);
      expect((await sb.from('consents').select('user_id').eq('user_id', a.user.id)).data).toEqual(
        [],
      );
    });

    it('documento duplicado: 409 document_taken, y el segundo usuario puede registrarse con otro', async () => {
      const [a, b] = [await newActor(), await newActor()];
      const ruc = newRuc();
      expect((await register(a, companyBody(ruc))).status).toBe(STATUS.OK);
      const dup = await register(b, companyBody(ruc));
      expect(dup.status).toBe(STATUS.CONFLICT);
      expect(dup.body.error.details).toMatchObject({ reason: 'document_taken' });
      expect((await get(b, api.me.path)).body.account.accountKind).toBeNull();
      expect((await register(b, companyBody(newRuc()))).status).toBe(STATUS.OK);
    });

    it('un DNI ya usado como RUC/DNI de otra empresa también da 409 (documento único global)', async () => {
      const [a, b] = [await newActor(), await newActor()];
      const dni = dniOf();
      taken.push(dni);
      const body = companyBody(dni, { personType: 'natural', documentType: 'dni' });
      expect((await register(a, body)).status).toBe(STATUS.OK);
      expect((await register(b, body)).status).toBe(STATUS.CONFLICT);
    });

    it('tipo exclusivo: no se re-registra ni se cambia de tipo; la cuenta no se toca', async () => {
      const c = await newCompany();
      const before = (await get(c.actor, api.me.path)).body.account;
      const same = await register(c.actor, companyBody(newRuc()));
      const other = await register(c.actor, influencerBody);
      expect([same.status, other.status]).toEqual([STATUS.CONFLICT, STATUS.CONFLICT]);
      expect(same.body.error.details).toMatchObject({ reason: 'already_registered' });
      expect((await get(c.actor, api.me.path)).body.account).toEqual(before);
      const rows = await sb.from('accounts').select('account_kind').eq('user_id', c.actor.user.id);
      expect(rows.data).toEqual([{ account_kind: 'company' }]);
      const consents = await sb.from('consents').select('user_id').eq('user_id', c.actor.user.id);
      expect(consents.data).toHaveLength(1);
    });

    it('carrera: dos registros simultáneos de tipos distintos dejan una sola cuenta', async () => {
      const a = await newActor();
      const [r1, r2] = await Promise.all([
        register(a, companyBody(newRuc())),
        register(a, influencerBody),
      ]);
      expect([r1.status, r2.status].sort()).toEqual([STATUS.OK, STATUS.CONFLICT]);
      const accounts = await sb.from('accounts').select('account_kind').eq('user_id', a.user.id);
      expect(accounts.data).toHaveLength(1);
      const companies = await sb.from('companies').select('id').eq('owner_user_id', a.user.id);
      expect(companies.data).toHaveLength(accounts.data?.[0]?.account_kind === 'company' ? 1 : 0);
      expect(
        (await sb.from('consents').select('user_id').eq('user_id', a.user.id)).data,
      ).toHaveLength(1);
    });

    it('el cuerpo no puede traer campos de otra cuenta: un influencer no crea empresa', async () => {
      const a = await newActor();
      const res = await register(a, { ...influencerBody, company: companyBody(newRuc()).company });
      expect(res.status).toBe(STATUS.OK);
      expect((await sb.from('companies').select('id').eq('owner_user_id', a.user.id)).data).toEqual(
        [],
      );
    });

    it('Empresa solo reclama marcas (queda con company_id); Influencer solo creadores', async () => {
      const [co, inf] = [await newActor(), await newActor()];
      await register(co, companyBody(newRuc()));
      await register(inf, influencerBody);
      const handle = `zz.${uniqueTag()}`;
      world.trackHandle(handle);
      const bad = await post(co, api.startClaim.path, { handle, role: 'creator' });
      expect(bad.status).toBe(STATUS.BAD_REQUEST);
      expect(bad.body.error.details).toMatchObject({ reason: 'role_mismatch' });
      const bad2 = await post(inf, api.startClaim.path, { handle, role: 'brand' });
      expect(bad2.status).toBe(STATUS.BAD_REQUEST);

      const start = await post(co, api.startClaim.path, { handle, role: 'brand' });
      expect(start.status, JSON.stringify(start.body)).toBe(STATUS.OK);
      const verify = await post(
        co,
        api.verifyClaim.path.replace(':claimId', start.body.claimId as string),
      );
      expect(verify.status, JSON.stringify(verify.body)).toBe(STATUS.OK);
      const me = await get(co, api.me.path);
      const brand = me.body.profiles.find((p: { handle: string }) => p.handle === handle);
      const row = await sb.from('profiles').select('company_id').eq('ig_handle', handle).single();
      expect(brand).toMatchObject({ role: 'brand' });
      expect(row.data?.company_id).toBe(me.body.account.company.id);
      await sb.from('profiles').delete().eq('ig_handle', handle);
    });

    it('ninguna ruta de la API devuelve el documento de una empresa a otro usuario', async () => {
      const c = await newCompany();
      const other = await newActor();
      const probes = [
        get(other, api.me.path),
        get(other, `${api.getProfile.path.replace(':handle', c.brand.handle)}`),
        get(other, `${api.feed.path}?profileId=${c.brand.id}`),
      ];
      const ruc = c.companyId;
      const docs = (await sb.from('companies').select('document_number').eq('id', ruc)).data?.[0]
        ?.document_number as string;
      for (const r of await Promise.all(probes)) {
        expect(JSON.stringify(r.body)).not.toContain(docs);
        expect(JSON.stringify(r.body)).not.toContain('document');
      }
    });

    // F7-M1: /registration no tiene límite de peticiones. Con un solo usuario (sin registrar) se prueban DNI/RUC
    // indefinidamente: 409 `document_taken` revela que ese DNI ya es de una empresa. El DNI es dato personal.
    it.fails(
      'F7-M1 · /registration limita los intentos (hoy 60 intentos seguidos con 409 y sin 429)',
      async () => {
        const victim = await newActor();
        const dni = dniOf();
        taken.push(dni);
        await register(victim, companyBody(dni, { personType: 'natural', documentType: 'dni' }));
        const prober = await newActor();
        const statuses: number[] = [];
        for (let i = 0; i < 60; i += 1)
          statuses.push(
            (
              await register(
                prober,
                companyBody(dni, { personType: 'natural', documentType: 'dni' }),
              )
            ).status,
          );
        expect(statuses).toContain(STATUS.TOO_MANY);
      },
      60_000,
    );
    // F7-B3: si falta la fila de `companies` de una cuenta Empresa (p. ej. borrada a mano; un test de F7 la borró de demo@),
    // `AccountStore.get` usa `.single()` y /me responde 500: la persona queda fuera de TODA la app (el middleware llama a /me).
    it.fails(
      'F7-B3 · /me no responde 500 si a una cuenta Empresa le falta su fila de companies',
      async () => {
        const c = await newCompany();
        await sb.from('companies').delete().eq('id', c.companyId);
        const me = await get(c.actor, api.me.path);
        expect(me.status).toBe(STATUS.OK);
      },
    );

    it('cotizar a una ficha sin dueño se acepta (crea la cotización): nadie la recibirá hasta que se reclame', async () => {
      const c = await newCompany();
      const orphan = await world.newProfile('creator');
      const camp = await newCampaign(c);
      const res = await quote(c, camp.id, [{ creatorProfileId: orphan.id }]);
      // Decisión de producto pendiente (informativo): no hay aviso ni dueño; cuenta contra el límite por hora.
      expect(res.body.created).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------------------------------------
  describe('campañas', () => {
    it('crea (borrador por defecto), lista, lee y devuelve stats vacías', async () => {
      const c = await newCompany();
      const draft = await post(
        c.actor,
        api.createCampaign.path,
        campaignBody(c.brand.id, { activate: false }),
      );
      expect(draft.status).toBe(STATUS.OK);
      expect(draft.body).toMatchObject({
        status: 'draft',
        stats: { quotes: 0, byStatus: {}, committedPen: 0 },
        targetNiches: ['moda', 'fitness'],
      });
      const list = await get(c.actor, `${api.listCampaigns.path}?profileId=${c.brand.id}`);
      expect(list.body.items.map((x: { id: string }) => x.id)).toEqual([draft.body.id]);
      const one = await get(c.actor, `${campaignUrl(draft.body.id)}?profileId=${c.brand.id}`);
      expect(one.body.id).toBe(draft.body.id);
    });

    it('solo marcas propias: un creador, otra empresa y un perfil inexistente reciben 403', async () => {
      const [c, other, inf] = [await newCompany(), await newCompany(), await newInfluencer()];
      const mk = (a: Actor, id: string) =>
        post(a, api.createCampaign.path, campaignBody(id, { activate: false }));
      expect((await mk(other.actor, c.brand.id)).status).toBe(STATUS.FORBIDDEN);
      expect((await mk(inf.actor, inf.creator.id)).status).toBe(STATUS.FORBIDDEN);
      expect((await mk(c.actor, inf.creator.id)).status).toBe(STATUS.FORBIDDEN);
      expect((await mk(c.actor, '00000000-0000-4000-8000-000000000000')).status).toBe(
        STATUS.FORBIDDEN,
      );
      expect((await post(null, api.createCampaign.path, campaignBody(c.brand.id))).status).toBe(
        STATUS.UNAUTHORIZED,
      );
    });

    it('nadie lee ni edita campañas ajenas (ni con su propio profileId ni con el de la víctima)', async () => {
      const [c, atk] = [await newCompany(), await newCompany()];
      const camp = await newCampaign(c);
      const url = campaignUrl(camp.id);
      // con el perfil de la víctima: 403
      expect((await get(atk.actor, `${url}?profileId=${c.brand.id}`)).status).toBe(
        STATUS.FORBIDDEN,
      );
      expect(
        (await patch(atk.actor, url, { brandProfileId: c.brand.id, name: 'hack' })).status,
      ).toBe(STATUS.FORBIDDEN);
      // con el propio profileId pero el id de la campaña ajena: 404, sin cambios
      expect((await get(atk.actor, `${url}?profileId=${atk.brand.id}`)).status).toBe(
        STATUS.NOT_FOUND,
      );
      expect(
        (await patch(atk.actor, url, { brandProfileId: atk.brand.id, name: 'hack' })).status,
      ).toBe(STATUS.NOT_FOUND);
      expect(
        (await sb.from('campaigns').select('name').eq('id', camp.id).single()).data?.name,
      ).toBe('Verano 2027');
      const list = await get(atk.actor, `${api.listCampaigns.path}?profileId=${atk.brand.id}`);
      expect(list.body.items).toEqual([]);
    });

    it('estados solo hacia adelante: draft→active→closed; no vuelve', async () => {
      const c = await newCompany();
      const camp = await newCampaign(c, { activate: false });
      const url = campaignUrl(camp.id);
      const setStatus = (status: string) =>
        patch(c.actor, url, { brandProfileId: c.brand.id, status });
      expect((await setStatus('active')).body.status).toBe('active');
      const back = await setStatus('draft');
      expect([back.status, back.body.error.code]).toEqual([STATUS.CONFLICT, 'INVALID_TRANSITION']);
      expect((await setStatus('closed')).body.status).toBe('closed');
      for (const s of ['active', 'draft']) {
        const r = await setStatus(s);
        expect([r.status, r.body.error.code]).toEqual([STATUS.CONFLICT, 'INVALID_TRANSITION']);
      }
      expect(
        (await sb.from('campaigns').select('status').eq('id', camp.id).single()).data?.status,
      ).toBe('closed');
    });

    it('PATCH parcial no borra campos; null y [] explícitos los vacían', async () => {
      const c = await newCompany();
      const camp = await newCampaign(c);
      const url = campaignUrl(camp.id);
      const p = (body: object) => patch(c.actor, url, { brandProfileId: c.brand.id, ...body });
      const renamed = await p({ name: 'Renombrada' });
      expect(renamed.body).toMatchObject({
        name: 'Renombrada',
        description: 'Lanzamiento',
        endsOn: '2027-03-01',
        budgetPen: 5000,
        targetNiches: ['moda', 'fitness'],
        targetCities: ['lima', 'cusco'],
        status: 'active',
      });
      const cleared = await p({
        endsOn: null,
        budgetPen: null,
        targetNiches: [],
        targetCities: [],
      });
      expect(cleared.body).toMatchObject({
        name: 'Renombrada',
        endsOn: null,
        budgetPen: null,
        targetNiches: [],
        targetCities: [],
        description: 'Lanzamiento',
      });
      // la fecha de fin no puede quedar antes del inicio guardado
      const bad = await p({ endsOn: '2026-01-01' });
      expect(bad.status).toBe(STATUS.BAD_REQUEST);
      expect((await p({ startsOn: '2030-01-01', endsOn: '2029-01-01' })).status).toBe(
        STATUS.BAD_REQUEST,
      );
    });

    // F7-B1: el contrato dice "null o [] explícitos vacían", pero `description` no admite null: no se puede vaciar.
    it.fails('F7-B1 · PATCH description:null vacía la descripción', async () => {
      const c = await newCompany();
      const camp = await newCampaign(c);
      const res = await patch(c.actor, campaignUrl(camp.id), {
        brandProfileId: c.brand.id,
        description: null,
      });
      expect(res.status).toBe(STATUS.OK);
      expect(res.body.description).toBeNull();
    });

    it('validación de bordes: presupuesto negativo/enorme, >5 ciudades, nombre vacío, fecha inválida, campos de más', async () => {
      const c = await newCompany();
      const bad = (over: object) =>
        post(c.actor, api.createCampaign.path, campaignBody(c.brand.id, over));
      expect((await bad({ budgetPen: -1 })).status).toBe(STATUS.BAD_REQUEST);
      expect((await bad({ budgetPen: 99_999_999 })).status).toBe(STATUS.BAD_REQUEST);
      expect((await bad({ targetCities: Array(6).fill('lima') })).status).toBe(STATUS.BAD_REQUEST);
      expect((await bad({ name: ' ' })).status).toBe(STATUS.BAD_REQUEST);
      expect((await bad({ startsOn: '2026-13-45' })).status).toBe(STATUS.BAD_REQUEST);
      expect((await bad({ startsOn: '2027-05-01', endsOn: '2027-04-01' })).status).toBe(
        STATUS.BAD_REQUEST,
      );
      expect((await bad({ kind: 'viral' })).status).toBe(STATUS.BAD_REQUEST);
      // un `status: closed` colado en la creación no se respeta (solo `activate`)
      const sneaky = await bad({ status: 'closed', activate: false });
      expect(sneaky.body.status).toBe('draft');
    });

    // F7-M2: PATCH lee-modifica-escribe el registro completo (upsert por id) sin control de concurrencia. Una edición
    // de campos concurrente con "cerrar" puede reescribir el estado viejo y REABRIR la campaña (cerrada → activa).
    it.fails('F7-M2 · una edición concurrente no reabre una campaña cerrada', async () => {
      const c = await newCompany();
      const outcomes = await Promise.all(
        Array.from({ length: 12 }, async (_, i) => {
          const camp = await newCampaign(c);
          const url = campaignUrl(camp.id);
          await Promise.all([
            patch(c.actor, url, { brandProfileId: c.brand.id, status: 'closed' }),
            patch(c.actor, url, { brandProfileId: c.brand.id, name: `Editada ${i}` }),
          ]);
          return (await sb.from('campaigns').select('status').eq('id', camp.id).single()).data
            ?.status;
        }),
      );
      expect(outcomes).toEqual(outcomes.map(() => 'closed'));
    });

    it('stats: cotizaciones por estado y monto comprometido solo con aceptadas o completadas', async () => {
      const c = await newCompany();
      const camp = await newCampaign(c);
      const creators = await Promise.all([1, 2, 3, 4].map(() => newInfluencer()));
      const res = await quote(
        c,
        camp.id,
        creators.map((x) => ({ creatorProfileId: x.creator.id })),
        { amountPen: 700 },
      );
      expect(res.body.created).toHaveLength(4);
      const ids = res.body.created.map((q: { id: string }) => q.id);
      const tr = (who: Actor, actorProfileId: string, id: string, to: string) =>
        post(who, api.transitionQuote.path.replace(':quoteId', id), { actorProfileId, to });
      // 0 sigue enviada; 1 aceptada; 2 aceptada→completada; 3 rechazada
      expect(
        (await tr(creators[1]!.actor, creators[1]!.creator.id, ids[1], 'accepted')).status,
      ).toBe(STATUS.OK);
      expect(
        (await tr(creators[2]!.actor, creators[2]!.creator.id, ids[2], 'accepted')).status,
      ).toBe(STATUS.OK);
      expect((await tr(c.actor, c.brand.id, ids[2], 'completed')).status).toBe(STATUS.OK);
      expect(
        (await tr(creators[3]!.actor, creators[3]!.creator.id, ids[3], 'rejected')).status,
      ).toBe(STATUS.OK);
      const stats = (await get(c.actor, `${campaignUrl(camp.id)}?profileId=${c.brand.id}`)).body
        .stats;
      expect(stats).toEqual({
        quotes: 4,
        byStatus: { sent: 1, accepted: 1, completed: 1, rejected: 1 },
        committedPen: 1400,
      });
    });
  });

  // ---------------------------------------------------------------------------------------------------------
  describe('cotización múltiple sin match', () => {
    it('cotiza sin match: uno con servicio (monto = precio) y otro propuesta abierta', async () => {
      const c = await newCompany();
      const [a, b] = [await newInfluencer(), await newInfluencer()];
      const service = await world.newService(a.creator.id);
      const camp = await newCampaign(c);
      const res = await quote(c, camp.id, [
        { creatorProfileId: a.creator.id, serviceId: service },
        { creatorProfileId: b.creator.id },
      ]);
      expect(res.status, JSON.stringify(res.body)).toBe(STATUS.OK);
      expect(res.body.failed).toEqual([]);
      const byCreator = new Map(
        res.body.created.map((q: { creatorProfileId: string }) => [q.creatorProfileId, q]),
      ) as Map<
        string,
        {
          serviceId: string | null;
          amountPen: number | null;
          status: string;
          campaign: { id: string };
        }
      >;
      expect(byCreator.get(a.creator.id)).toMatchObject({
        serviceId: service,
        amountPen: 100,
        status: 'sent',
      });
      expect(byCreator.get(b.creator.id)).toMatchObject({ serviceId: null, amountPen: null });
      expect(byCreator.get(b.creator.id)?.campaign.id).toBe(camp.id);
      expect(
        (await sb.from('matches').select('id').eq('brand_profile_id', c.brand.id)).data,
      ).toEqual([]);
      // el creador la ve, con la campaña, sin presupuesto ni datos de la marca
      const inbox = await get(a.actor, `${api.listQuotes.path}?profileId=${a.creator.id}`);
      expect(inbox.body.items).toHaveLength(1);
      const text = JSON.stringify(inbox.body);
      expect(text).not.toContain('budgetPen');
      expect(text).not.toContain(c.actor.user.email);
    });

    it('send:false deja borrador; campaña en borrador o cerrada se rechaza con 400 y sin filas', async () => {
      const c = await newCompany();
      const inf = await newInfluencer();
      const draftCamp = await newCampaign(c, { activate: false });
      const r1 = await quote(c, draftCamp.id, [{ creatorProfileId: inf.creator.id }]);
      expect([r1.status, r1.body.error.details]).toEqual([
        STATUS.BAD_REQUEST,
        { reason: 'campaign_not_active' },
      ]);
      const camp = await newCampaign(c);
      await patch(c.actor, campaignUrl(camp.id), { brandProfileId: c.brand.id, status: 'closed' });
      const r2 = await quote(c, camp.id, [{ creatorProfileId: inf.creator.id }]);
      expect(r2.status).toBe(STATUS.BAD_REQUEST);
      expect(
        (await sb.from('quotes').select('id').eq('creator_profile_id', inf.creator.id)).data,
      ).toEqual([]);
      const live = await newCampaign(c);
      const d = await quote(c, live.id, [{ creatorProfileId: inf.creator.id }], { send: false });
      expect(d.body.created[0].status).toBe('draft');
    });

    it('campaña ajena: 404; perfil solicitante ajeno o de creador: 403', async () => {
      const [c, atk, inf] = [await newCompany(), await newCompany(), await newInfluencer()];
      const camp = await newCampaign(c);
      expect((await quote(atk, camp.id, [{ creatorProfileId: inf.creator.id }])).status).toBe(
        STATUS.NOT_FOUND,
      );
      const asVictim = await post(atk.actor, api.createQuote.path, {
        requesterProfileId: c.brand.id,
        campaignId: camp.id,
        targets: [{ creatorProfileId: inf.creator.id }],
        message: 'x',
      });
      expect(asVictim.status).toBe(STATUS.FORBIDDEN);
      const asCreator = await post(inf.actor, api.createQuote.path, {
        requesterProfileId: inf.creator.id,
        campaignId: camp.id,
        targets: [{ creatorProfileId: inf.creator.id }],
        message: 'x',
      });
      expect(asCreator.status).toBe(STATUS.FORBIDDEN);
    });

    it('failed por destinatario: servicio de otro creador, creador inexistente, marca como destino, ficha retirada', async () => {
      const c = await newCompany();
      const [ok, other, removed] = [
        await newInfluencer(),
        await newInfluencer(),
        await newInfluencer(),
      ];
      const foreignService = await world.newService(other.creator.id);
      const brandTarget = await world.newProfile('brand', (await newActor()).user.id);
      await sb.from('profiles').update({ status: 'removed' }).eq('id', removed.creator.id);
      const camp = await newCampaign(c);
      const res = await quote(c, camp.id, [
        { creatorProfileId: ok.creator.id },
        { creatorProfileId: ok.creator.id, serviceId: foreignService },
        { creatorProfileId: '00000000-0000-4000-8000-000000000000' },
        { creatorProfileId: brandTarget.id },
        { creatorProfileId: removed.creator.id },
      ]);
      expect(res.status).toBe(STATUS.OK);
      expect(res.body.created).toHaveLength(1);
      expect(
        res.body.failed.map((f: { creatorProfileId: string; code: string }) => [
          f.creatorProfileId.slice(0, 8),
          f.code,
        ]),
      ).toEqual([
        [ok.creator.id.slice(0, 8), 'VALIDATION_ERROR'],
        ['00000000', 'NOT_FOUND'],
        [brandTarget.id.slice(0, 8), 'NOT_FOUND'],
        [removed.creator.id.slice(0, 8), 'NOT_FOUND'],
      ]);
    });

    it('duplicado abierto por creador y campaña → CONFLICT; tras rechazar se puede cotizar de nuevo; otra campaña sí', async () => {
      const c = await newCompany();
      const inf = await newInfluencer();
      const camp = await newCampaign(c);
      const t = [{ creatorProfileId: inf.creator.id }];
      expect((await quote(c, camp.id, t)).body.created).toHaveLength(1);
      const dup = await quote(c, camp.id, t);
      expect(dup.body.created).toEqual([]);
      expect(dup.body.failed[0]).toMatchObject({ code: 'CONFLICT' });
      // mismo creador dos veces dentro de la misma petición
      const camp2 = await newCampaign(c);
      const twice = await quote(c, camp2.id, [...t, ...t]);
      expect([
        twice.body.created.length,
        twice.body.failed.map((f: { code: string }) => f.code),
      ]).toEqual([1, ['CONFLICT']]);
      // el creador rechaza la primera → se puede volver a cotizar en esa campaña
      const first = (
        await get(
          inf.actor,
          `${api.listQuotes.path}?profileId=${inf.creator.id}&campaignId=${camp.id}`,
        )
      ).body.items[0];
      await post(inf.actor, api.transitionQuote.path.replace(':quoteId', first.id), {
        actorProfileId: inf.creator.id,
        to: 'rejected',
      });
      expect((await quote(c, camp.id, t)).body.created).toHaveLength(1);
    });

    it('carrera: 6 peticiones simultáneas al mismo creador y campaña crean exactamente una cotización', async () => {
      const c = await newCompany();
      const inf = await newInfluencer();
      const camp = await newCampaign(c);
      const rs = await Promise.all(
        Array.from({ length: 6 }, () => quote(c, camp.id, [{ creatorProfileId: inf.creator.id }])),
      );
      for (const r of rs) expect(r.status, JSON.stringify(r.body)).toBe(STATUS.OK);
      expect(rs.reduce((n, r) => n + r.body.created.length, 0)).toBe(1);
      expect(rs.filter((r) => r.body.failed[0]?.code === 'CONFLICT')).toHaveLength(5);
      expect((await sb.from('quotes').select('id').eq('campaign_id', camp.id)).data).toHaveLength(
        1,
      );
    });

    it('listQuotes por campaignId filtra; una campaña ajena no devuelve nada ni filtra existencia', async () => {
      const [c, other] = [await newCompany(), await newCompany()];
      const [inf1, inf2] = [await newInfluencer(), await newInfluencer()];
      const [k1, k2] = [await newCampaign(c), await newCampaign(c)];
      await quote(c, k1.id, [{ creatorProfileId: inf1.creator.id }]);
      await quote(c, k2.id, [{ creatorProfileId: inf2.creator.id }]);
      const all = await get(c.actor, `${api.listQuotes.path}?profileId=${c.brand.id}`);
      const only1 = await get(
        c.actor,
        `${api.listQuotes.path}?profileId=${c.brand.id}&campaignId=${k1.id}`,
      );
      expect([all.body.items.length, only1.body.items.length]).toEqual([2, 1]);
      expect(only1.body.items[0].campaign.id).toBe(k1.id);
      const foreign = await get(
        other.actor,
        `${api.listQuotes.path}?profileId=${other.brand.id}&campaignId=${k1.id}`,
      );
      expect(foreign.body.items).toEqual([]);
      expect(
        (await get(other.actor, `${api.listQuotes.path}?profileId=${c.brand.id}`)).status,
      ).toBe(STATUS.FORBIDDEN);
    });

    it('el creador destino y la marca transicionan; un tercero no (403/404) y nada cambia', async () => {
      const c = await newCompany();
      const [inf, intruder] = [await newInfluencer(), await newInfluencer()];
      const camp = await newCampaign(c);
      const q = (await quote(c, camp.id, [{ creatorProfileId: inf.creator.id }])).body.created[0];
      const url = api.transitionQuote.path.replace(':quoteId', q.id);
      const asThird = await post(intruder.actor, url, {
        actorProfileId: inf.creator.id,
        to: 'accepted',
      });
      expect(asThird.status).toBe(STATUS.FORBIDDEN); // se hace pasar por el destinatario
      const own = await post(intruder.actor, url, {
        actorProfileId: intruder.creator.id,
        to: 'accepted',
      });
      expect([STATUS.FORBIDDEN, STATUS.NOT_FOUND]).toContain(own.status);
      const requesterAccepts = await post(c.actor, url, {
        actorProfileId: c.brand.id,
        to: 'accepted',
      });
      expect(requesterAccepts.status).toBeGreaterThanOrEqual(STATUS.BAD_REQUEST);
      expect(
        (await post(inf.actor, url, { actorProfileId: inf.creator.id, to: 'accepted' })).status,
      ).toBe(STATUS.OK);
    });

    it('validación en el borde: 0 y 21 destinatarios, mensaje vacío, monto negativo, ids no UUID', async () => {
      const c = await newCompany();
      const camp = await newCampaign(c);
      const t = { creatorProfileId: '00000000-0000-4000-8000-000000000000' };
      expect((await quote(c, camp.id, [])).status).toBe(STATUS.BAD_REQUEST);
      expect((await quote(c, camp.id, Array(BULK + 1).fill(t))).status).toBe(STATUS.BAD_REQUEST);
      expect((await quote(c, camp.id, [t], { message: '  ' })).status).toBe(STATUS.BAD_REQUEST);
      expect((await quote(c, camp.id, [t], { amountPen: -5 })).status).toBe(STATUS.BAD_REQUEST);
      expect((await quote(c, 'no-uuid', [t])).status).toBe(STATUS.BAD_REQUEST);
    });

    it(`límite por marca y hora (${QUOTES_PER_BRAND_PER_HOUR}): lo excedente va a failed; todo rechazado = 429; otra marca no se afecta`, async () => {
      const [c, other] = [await newCompany(), await newCompany()];
      const ids: string[] = [];
      for (let i = 0; i < QUOTES_PER_BRAND_PER_HOUR + 5; i += 1)
        ids.push((await world.newProfile('creator')).id);
      const camp = await newCampaign(c);
      const batches = [ids.slice(0, 20), ids.slice(20, 40), ids.slice(40, 55), ids.slice(55, 65)];
      const sent: Awaited<ReturnType<typeof quote>>[] = [];
      for (const b of batches)
        sent.push(
          await quote(
            c,
            camp.id,
            b.map((id) => ({ creatorProfileId: id })),
          ),
        );
      const created = sent.reduce((n, r) => n + (r.body.created?.length ?? 0), 0);
      expect(created).toBe(QUOTES_PER_BRAND_PER_HOUR);
      const partial = sent.find((r) => r.status === STATUS.OK && r.body.failed.length > 0)!;
      expect(partial.body.failed[0]).toMatchObject({ code: 'VALIDATION_ERROR' });
      const full = await quote(c, camp.id, [{ creatorProfileId: ids[64]! }]);
      expect([full.status, full.body.error.code]).toEqual([STATUS.TOO_MANY, 'RATE_LIMITED']);
      const otherCamp = await newCampaign(other);
      expect(
        (await quote(other, otherCamp.id, [{ creatorProfileId: ids[0]! }])).body.created,
      ).toHaveLength(1);
    }, 120_000);

    it('quote sin servicio no rompe notificaciones: el creador recibe aviso de la cotización', async () => {
      const c = await newCompany();
      const inf = await newInfluencer();
      const camp = await newCampaign(c);
      const res = await quote(c, camp.id, [{ creatorProfileId: inf.creator.id }]);
      expect(res.body.created).toHaveLength(1);
      // el manejador de eventos es asíncrono: damos un margen
      await new Promise((r) => setTimeout(r, 800));
      const n = await get(inf.actor, `${api.notifications.path}`);
      expect(n.status, JSON.stringify(n.body)).toBe(STATUS.OK);
      expect(JSON.stringify(n.body)).toContain('quote');
    });
  });

  // ---------------------------------------------------------------------------------------------------------
  describe('visibilidad', () => {
    const view = (a: Actor, viewer: string, viewed: string) =>
      post(a, api.recordProfileView.path.replace(':profileId', viewed), {
        viewerProfileId: viewer,
      });
    const list = (a: Actor, profileId: string, kind: 'interest' | 'view') =>
      get(a, `${api.visibility.path}?profileId=${profileId}&kind=${kind}`);
    const summary = (a: Actor, profileId: string) =>
      get(a, `${api.visibilitySummary.path}?profileId=${profileId}`);
    const interest = (a: Actor, from: string, to: string, kind = 'interest') =>
      post(a, api.interact.path, { actorProfileId: from, targetProfileId: to, kind });

    it('visita de la marca a un creador con dueño: se registra una vez al día y el dueño la ve', async () => {
      const c = await newCompany();
      const inf = await newInfluencer();
      expect((await view(c.actor, c.brand.id, inf.creator.id)).body).toEqual({ recorded: true });
      expect((await view(c.actor, c.brand.id, inf.creator.id)).body).toEqual({ recorded: false });
      const l = await list(inf.actor, inf.creator.id, 'view');
      expect(l.body.items).toHaveLength(1);
      expect(l.body.items[0]).toMatchObject({ kind: 'view', count: 1, reciprocated: false });
      expect(l.body.items[0].profile.id).toBe(c.brand.id);
      expect((await summary(inf.actor, inf.creator.id)).body).toMatchObject({
        views7d: 1,
        views30d: 1,
      });
      // la marca visitante no ve quién la visitó a ella ni la ficha visitada
      expect((await list(c.actor, inf.creator.id, 'view')).status).toBe(STATUS.FORBIDDEN);
    });

    it('no se registran: ficha sin dueño, mismo tipo, administrador, perfil retirado', async () => {
      const [c, c2] = [await newCompany(), await newCompany()];
      const orphan = await world.newProfile('creator');
      const inf = await newInfluencer();
      expect((await view(c.actor, c.brand.id, orphan.id)).body).toEqual({ recorded: false });
      expect((await view(c.actor, c.brand.id, c2.brand.id)).body).toEqual({ recorded: false });
      expect((await view(inf.actor, inf.creator.id, inf.creator.id)).body).toEqual({
        recorded: false,
      });
      // admin con una marca propia
      const adminBrand = await world.newProfile('brand', admin.user.id);
      expect((await view(admin, adminBrand.id, inf.creator.id)).body).toEqual({ recorded: false });
      // ficha retirada (ARCO)
      const gone = await newInfluencer();
      await sb.from('profiles').update({ status: 'removed' }).eq('id', gone.creator.id);
      expect((await view(c.actor, c.brand.id, gone.creator.id)).status).toBe(STATUS.NOT_FOUND);
      const rows = await sb
        .from('profile_views')
        .select('viewer_profile_id')
        .in('viewer_profile_id', [c.brand.id, adminBrand.id, inf.creator.id]);
      expect(rows.data).toEqual([]);
    });

    it('cuenta con marca y creador propios (datos antiguos): la visita a sí misma no cuenta', async () => {
      const c = await newCompany();
      const mine = await world.newProfile('creator', c.actor.user.id);
      expect((await view(c.actor, c.brand.id, mine.id)).body).toEqual({ recorded: false });
    });

    it('403 al registrar con un perfil visitante ajeno o al consultar la visibilidad de un perfil ajeno', async () => {
      const [c, atk] = [await newCompany(), await newCompany()];
      const inf = await newInfluencer();
      expect((await view(atk.actor, c.brand.id, inf.creator.id)).status).toBe(STATUS.FORBIDDEN);
      for (const kind of ['interest', 'view'] as const)
        expect((await list(atk.actor, c.brand.id, kind)).status).toBe(STATUS.FORBIDDEN);
      expect((await summary(atk.actor, inf.creator.id)).status).toBe(STATUS.FORBIDDEN);
      expect((await summary(null as unknown as Actor, inf.creator.id)).status).toBe(
        STATUS.UNAUTHORIZED,
      );
    });

    it('intereses sin match: aparecen, desaparecen al hacer match o al descartar; devolver interés crea el match', async () => {
      const [c1, c2] = [await newCompany(), await newCompany()];
      const inf = await newInfluencer();
      await interest(c1.actor, c1.brand.id, inf.creator.id);
      await interest(c2.actor, c2.brand.id, inf.creator.id);
      const l = await list(inf.actor, inf.creator.id, 'interest');
      expect(l.body.items.map((i: { profile: { id: string } }) => i.profile.id).sort()).toEqual(
        [c1.brand.id, c2.brand.id].sort(),
      );
      expect((await summary(inf.actor, inf.creator.id)).body).toMatchObject({
        interests7d: 2,
        interests30d: 2,
      });
      // descarta c2 → sale de la lista
      await interest(inf.actor, inf.creator.id, c2.brand.id, 'dismiss');
      // devuelve el interés a c1 → match → sale de la lista
      const back = await interest(inf.actor, inf.creator.id, c1.brand.id);
      expect(back.body.matched).toBe(true);
      expect((await list(inf.actor, inf.creator.id, 'interest')).body.items).toEqual([]);
      expect((await summary(inf.actor, inf.creator.id)).body.interests30d).toBe(0);
    });

    it('contadores 7d y 30d: ventanas por fecha (3, 10 y 40 días) para visitas e intereses', async () => {
      const inf = await newInfluencer();
      const brands = await Promise.all([1, 2, 3, 4, 5, 6].map(() => newCompany()));
      const today = new Date().toISOString().slice(0, ISO_DAY);
      const ago = (n: number) => dayAgo(n).toISOString();
      const [v3, v10, v40] = [brands[0]!, brands[1]!, brands[2]!];
      const ins = await sb.from('profile_views').insert([
        {
          viewer_profile_id: v3.brand.id,
          viewed_profile_id: inf.creator.id,
          viewed_on: ago(3).slice(0, ISO_DAY),
          last_at: ago(3),
        },
        {
          viewer_profile_id: v10.brand.id,
          viewed_profile_id: inf.creator.id,
          viewed_on: ago(10).slice(0, ISO_DAY),
          last_at: ago(10),
        },
        {
          viewer_profile_id: v40.brand.id,
          viewed_profile_id: inf.creator.id,
          viewed_on: ago(40).slice(0, ISO_DAY),
          last_at: ago(40),
        },
        // dos días distintos del mismo visitante (3 y 10): una entrada con count 2
        {
          viewer_profile_id: v3.brand.id,
          viewed_profile_id: inf.creator.id,
          viewed_on: ago(10).slice(0, ISO_DAY),
          last_at: ago(10),
        },
      ]);
      expect(ins.error).toBeNull();
      const ints = await sb.from('interactions').insert([
        {
          actor_profile_id: brands[3]!.brand.id,
          target_profile_id: inf.creator.id,
          kind: 'interest',
          created_at: ago(2),
        },
        {
          actor_profile_id: brands[4]!.brand.id,
          target_profile_id: inf.creator.id,
          kind: 'interest',
          created_at: ago(20),
        },
        {
          actor_profile_id: brands[5]!.brand.id,
          target_profile_id: inf.creator.id,
          kind: 'interest',
          created_at: ago(45),
        },
      ]);
      expect(ints.error).toBeNull();
      const s = (await summary(inf.actor, inf.creator.id)).body;
      expect(s).toEqual({ interests7d: 1, interests30d: 2, views7d: 1, views30d: 2 });
      expect(today).toHaveLength(ISO_DAY);
      const l = (await list(inf.actor, inf.creator.id, 'view')).body.items;
      const mine = l.find((i: { profile: { id: string } }) => i.profile.id === v3.brand.id);
      expect(mine.count).toBe(2);
      expect(l.map((i: { profile: { id: string } }) => i.profile.id)).not.toContain(v40.brand.id);
    });

    it('paginación con cursor y orden más reciente primero', async () => {
      const inf = await newInfluencer();
      const brands = await Promise.all([1, 2, 3].map(() => newCompany()));
      await sb.from('profile_views').insert(
        brands.map((b, i) => ({
          viewer_profile_id: b.brand.id,
          viewed_profile_id: inf.creator.id,
          viewed_on: dayAgo(i).toISOString().slice(0, ISO_DAY),
          last_at: dayAgo(i).toISOString(),
        })),
      );
      const p1 = await get(
        inf.actor,
        `${api.visibility.path}?profileId=${inf.creator.id}&kind=view&limit=2`,
      );
      expect(p1.body.items).toHaveLength(2);
      expect(p1.body.nextCursor).not.toBeNull();
      const p2 = await get(
        inf.actor,
        `${api.visibility.path}?profileId=${inf.creator.id}&kind=view&limit=2&cursor=${p1.body.nextCursor}`,
      );
      const ids = [...p1.body.items, ...p2.body.items].map(
        (i: { profile: { id: string } }) => i.profile.id,
      );
      expect(ids).toEqual(brands.map((b) => b.brand.id));
      expect(p2.body.nextCursor).toBeNull();
    });

    it('ARCO: el perfil retirado desaparece de las listas y de los contadores', async () => {
      const c = await newCompany();
      const inf = await newInfluencer();
      await view(c.actor, c.brand.id, inf.creator.id);
      await interest(c.actor, c.brand.id, inf.creator.id);
      expect((await summary(inf.actor, inf.creator.id)).body).toMatchObject({
        views30d: 1,
        interests30d: 1,
      });
      await sb.from('profiles').update({ status: 'removed' }).eq('id', c.brand.id);
      expect((await summary(inf.actor, inf.creator.id)).body).toEqual({
        interests7d: 0,
        interests30d: 0,
        views7d: 0,
        views30d: 0,
      });
      expect((await list(inf.actor, inf.creator.id, 'view')).body.items).toEqual([]);
    });

    it('privacidad: la lista de visitas no filtra correo, documento, userId ni datos de la empresa del visitante', async () => {
      const c = await newCompany();
      const inf = await newInfluencer();
      await view(c.actor, c.brand.id, inf.creator.id);
      await interest(c.actor, c.brand.id, inf.creator.id);
      const doc = (
        await sb
          .from('companies')
          .select('document_number, legal_name')
          .eq('id', c.companyId)
          .single()
      ).data!;
      const bodies = JSON.stringify([
        (await list(inf.actor, inf.creator.id, 'view')).body,
        (await list(inf.actor, inf.creator.id, 'interest')).body,
        (await summary(inf.actor, inf.creator.id)).body,
      ]);
      for (const secret of [
        c.actor.user.email,
        c.actor.user.id,
        c.companyId,
        doc.document_number,
        doc.legal_name,
      ])
        expect(bodies).not.toContain(secret);
      for (const key of ['email', 'ownerUserId', 'documentNumber', 'companyId', 'legalName'])
        expect(bodies).not.toContain(key);
    });

    it('al borrar la cuenta del visitante se borran sus visitas (cascada, "se borra con la cuenta")', async () => {
      const c = await newCompany();
      const inf = await newInfluencer();
      await view(c.actor, c.brand.id, inf.creator.id);
      await sb.auth.admin.deleteUser(c.actor.user.id);
      await sb.from('profiles').delete().eq('id', c.brand.id);
      expect(
        (
          await sb
            .from('profile_views')
            .select('viewer_profile_id')
            .eq('viewed_profile_id', inf.creator.id)
        ).data,
      ).toEqual([]);
      expect(
        (await sb.from('consents').select('user_id').eq('user_id', c.actor.user.id)).data,
      ).toEqual([]);
      expect((await sb.from('companies').select('id').eq('id', c.companyId)).data).toEqual([]);
    });
  });
});

// Un correo de prueba nunca debe parecer real.
void TEST_EMAIL_DOMAIN;
