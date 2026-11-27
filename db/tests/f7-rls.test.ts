import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anonClient,
  clientWithJwt,
  createWorld,
  hasSupabase,
  serviceClient,
  uniqueTag,
} from './support/supabase';

/**
 * Auditoría F7 sobre la BD (ADR-009), complementa `rls.test.ts`:
 * - el propio dueño tampoco lee sus documentos ni campañas con su JWT (solo el backend con service_role);
 * - las RPC `register_account`, `claim_profile` y `owns_profile` no se pueden llamar con un JWT de usuario
 *   (si se pudiera, `register_account(p_user_id => otro)` registraría a un tercero);
 * - `profile_views`: el dueño de la ficha vista la lee; visitante, terceros y anon no;
 * - el índice único de cotización abierta por creador y campaña (carrera).
 */
const TODAY = new Date().toISOString().slice(0, 10);
const PG_UNIQUE = '23505';
const NO_UUID = '00000000-0000-4000-8000-000000000000';
const docNumber = () => `8${Date.now()}${Math.floor(Math.random() * 1000)}`;

describe.skipIf(!hasSupabase)('F7 · RLS y RPC (Supabase local)', () => {
  const sb = serviceClient();
  const world = createWorld(sb);
  const anon = anonClient();
  const own = {} as Record<string, string>;
  let asOwner = anon; // dueño de la empresa, de la marca y de la campaña
  let asViewed = anon; // dueño de la ficha visitada
  let asOther = anon;
  const tag = uniqueTag();

  beforeAll(async () => {
    const [owner, viewed, other] = [
      await world.newUser(),
      await world.newUser(),
      await world.newUser(),
    ];
    [asOwner, asViewed, asOther] = (await Promise.all(
      [owner, viewed, other].map(async (u) => clientWithJwt(await world.signIn(u))),
    )) as [typeof anon, typeof anon, typeof anon];
    Object.assign(own, { owner: owner.id, viewed: viewed.id, other: other.id });
    const brand = await world.newProfile('brand', owner.id);
    const creator = await world.newProfile('creator', viewed.id);
    const service = await world.newService(creator.id);
    Object.assign(own, { brand: brand.id, creator: creator.id, service });

    const must = (r: { error: { message: string } | null }, what: string) => {
      if (r.error) throw new Error(`${what}: ${r.error.message}`);
    };
    must(
      await sb.from('accounts').insert({ user_id: owner.id, account_kind: 'company' }),
      'accounts',
    );
    must(
      await sb
        .from('consents')
        .insert({ user_id: owner.id, version: `t-${tag}`, terms: true, privacy: true }),
      'consents',
    );
    const company = await sb
      .from('companies')
      .insert({
        owner_user_id: owner.id,
        person_type: 'juridica',
        document_type: 'ruc',
        document_number: docNumber(),
        legal_name: `Secreta ${tag}`,
        city: 'lima',
      })
      .select('id')
      .single<{ id: string }>();
    must(company, 'companies');
    own.company = company.data!.id;
    const campaign = await sb
      .from('campaigns')
      .insert({
        brand_profile_id: brand.id,
        name: `c-${tag}`,
        kind: 'general',
        starts_on: TODAY,
        status: 'active',
      })
      .select('id')
      .single<{ id: string }>();
    must(campaign, 'campaigns');
    own.campaign = campaign.data!.id;
    must(
      await sb
        .from('profile_views')
        .insert({ viewer_profile_id: brand.id, viewed_profile_id: creator.id, viewed_on: TODAY }),
      'profile_views',
    );
  }, 60_000);

  afterAll(async () => {
    await sb
      .from('companies')
      .delete()
      .eq('owner_user_id', own.owner ?? NO_UUID);
    await world.cleanup();
  }, 60_000);

  describe('el dueño tampoco lee documentos ni campañas con su JWT', () => {
    it.each([
      ['companies', 'document_number'],
      ['accounts', 'account_kind'],
      ['consents', 'version'],
      ['campaigns', 'name'],
    ])('%s: anon, dueño y terceros no leen filas (vacío o 42501)', async (table, column) => {
      for (const client of [anon, asOwner, asViewed, asOther]) {
        const res = await client.from(table).select(column);
        expect(res.data ?? []).toEqual([]);
      }
      // el service_role (backend) sí
      const svc = await sb.from(table).select(column).limit(1);
      expect(svc.error).toBeNull();
      expect((svc.data ?? []).length).toBeGreaterThan(0);
    });

    it('el dueño no puede alterar su empresa, su campaña ni su consentimiento por PostgREST', async () => {
      const [c, k, a] = await Promise.all([
        asOwner.from('companies').update({ legal_name: 'hack' }).eq('id', own.company!).select(),
        asOwner.from('campaigns').update({ status: 'closed' }).eq('id', own.campaign!).select(),
        asOwner
          .from('accounts')
          .update({ account_kind: 'influencer', display_name: 'x', city: 'lima' })
          .eq('user_id', own.owner!)
          .select(),
      ]);
      for (const r of [c, k, a]) expect(r.data ?? []).toEqual([]);
      const row = await sb.from('companies').select('legal_name').eq('id', own.company!).single();
      expect(row.data?.legal_name).toBe(`Secreta ${tag}`);
      const kind = await sb
        .from('accounts')
        .select('account_kind')
        .eq('user_id', own.owner!)
        .single();
      expect(kind.data?.account_kind).toBe('company');
    });

    it('no se puede cambiar de tipo de cuenta ni siendo service_role con la RPC (ya registrada)', async () => {
      const res = await sb.rpc('register_account', {
        p_user_id: own.owner,
        p_kind: 'influencer',
        p_company: null,
        p_influencer: { displayName: 'x', city: 'lima' },
        p_version: 'x',
      });
      expect(res.error?.code).toBe('SP409');
      expect(res.error?.message).toContain('already_registered');
    });

    it('accounts: un influencer sin nombre o ciudad lo rechaza la BD (check)', async () => {
      const user = await world.newUser();
      const res = await sb
        .from('accounts')
        .insert({ user_id: user.id, account_kind: 'influencer' });
      expect(res.error).not.toBeNull();
    });

    it('companies: documento único, tipos y persona restringidos por check', async () => {
      const user = await world.newUser();
      const dup = await sb.from('companies').insert({
        owner_user_id: user.id,
        person_type: 'juridica',
        document_type: 'ruc',
        document_number: (
          await sb.from('companies').select('document_number').eq('id', own.company!).single()
        ).data?.document_number,
        legal_name: 'x',
        city: 'lima',
      });
      expect(dup.error?.code).toBe(PG_UNIQUE);
      const bad = await sb.from('companies').insert({
        owner_user_id: user.id,
        person_type: 'robot',
        document_type: 'ruc',
        document_number: docNumber(),
        legal_name: 'x',
        city: 'lima',
      });
      expect(bad.error).not.toBeNull();
    });
  });

  describe('RPC solo para service_role', () => {
    const args = (userId: string) => ({
      p_user_id: userId,
      p_kind: 'influencer',
      p_company: null,
      p_influencer: { displayName: 'Intruso', city: 'lima' },
      p_version: 'x',
    });

    it('register_account: anon y authenticated reciben permiso denegado, también para otro user_id', async () => {
      const victim = await world.newUser();
      for (const client of [anon, asOwner, asOther]) {
        const res = await client.rpc('register_account', args(victim.id));
        expect(res.error?.code).toBe('42501');
      }
      expect((await sb.from('accounts').select('user_id').eq('user_id', victim.id)).data).toEqual(
        [],
      );
    });

    it('claim_profile: anon y authenticated no pueden reclamar una ficha para otro usuario', async () => {
      const handle = world.newHandle();
      for (const client of [anon, asOwner]) {
        const res = await client.rpc('claim_profile', {
          p_handle: handle,
          p_user_id: own.other,
          p_role: 'brand',
        });
        expect(res.error?.code).toBe('42501');
      }
      expect((await sb.from('profiles').select('id').eq('ig_handle', handle)).data).toEqual([]);
    });

    it('owns_profile: anon denegado; authenticated solo responde por sí mismo', async () => {
      expect((await anon.rpc('owns_profile', { p_profile_id: own.creator })).error?.code).toBe(
        '42501',
      );
      const [mine, theirs, noOne] = await Promise.all([
        asViewed.rpc('owns_profile', { p_profile_id: own.creator }),
        asOther.rpc('owns_profile', { p_profile_id: own.creator }),
        asOther.rpc('owns_profile', { p_profile_id: NO_UUID }),
      ]);
      expect([mine.data, theirs.data, noOne.data]).toEqual([true, false, false]);
    });
  });

  describe('profile_views', () => {
    it('solo el dueño de la ficha vista la lee; el visitante, terceros y anon no', async () => {
      const read = (c: typeof anon) => c.from('profile_views').select('viewer_profile_id');
      expect((await read(asViewed)).data).toEqual([{ viewer_profile_id: own.brand }]);
      for (const c of [asOwner, asOther, anon]) expect((await read(c)).data ?? []).toEqual([]);
    });

    it('nadie, ni el dueño de la ficha, escribe: insert/update/delete por PostgREST se rechazan', async () => {
      const row = {
        viewer_profile_id: own.brand,
        viewed_profile_id: own.creator,
        viewed_on: '2020-01-01',
      };
      for (const c of [asViewed, asOwner, anon]) {
        expect((await c.from('profile_views').insert(row)).error).not.toBeNull();
        expect(
          (
            await c
              .from('profile_views')
              .update({ count: 99 })
              .eq('viewed_profile_id', own.creator)
              .select()
          ).data ?? [],
        ).toEqual([]);
        expect(
          (await c.from('profile_views').delete().eq('viewed_profile_id', own.creator).select())
            .data ?? [],
        ).toEqual([]);
      }
      expect(
        (await sb.from('profile_views').select('count').eq('viewed_profile_id', own.creator!)).data,
      ).toEqual([{ count: 1 }]);
    });

    it('una visita por visitante, ficha y día (clave primaria)', async () => {
      const dup = await sb
        .from('profile_views')
        .insert({ viewer_profile_id: own.brand, viewed_profile_id: own.creator, viewed_on: TODAY });
      expect(dup.error?.code).toBe(PG_UNIQUE);
    });
  });

  describe('cotizaciones: una abierta por creador y campaña', () => {
    const base = () => ({
      campaign_id: own.campaign,
      creator_profile_id: own.creator,
      requester_profile_id: own.brand,
      message: 'hola',
    });

    it('la segunda abierta da 23505 aunque sean servicios distintos; terminales y otra campaña no cuentan', async () => {
      const first = await sb
        .from('quotes')
        .insert({ ...base(), status: 'sent', service_id: own.service })
        .select('id')
        .single();
      expect(first.error).toBeNull();
      const dup = await sb.from('quotes').insert({ ...base(), status: 'draft', service_id: null });
      expect(dup.error?.code).toBe(PG_UNIQUE);
      // terminal: no bloquea
      expect((await sb.from('quotes').insert({ ...base(), status: 'rejected' })).error).toBeNull();
      expect((await sb.from('quotes').insert({ ...base(), status: 'cancelled' })).error).toBeNull();
      // otra campaña de la misma marca: sí
      const other = await world.newCampaign(own.brand!);
      expect(
        (await sb.from('quotes').insert({ ...base(), campaign_id: other, status: 'sent' })).error,
      ).toBeNull();
      // al pasar la primera a terminal, se libera
      await sb.from('quotes').update({ status: 'rejected' }).eq('id', first.data!.id);
      expect((await sb.from('quotes').insert({ ...base(), status: 'sent' })).error).toBeNull();
    });

    it('service_id es opcional (propuesta abierta) y campaign_id obligatorio', async () => {
      const brand2 = await world.newProfile('brand');
      const camp2 = await world.newCampaign(brand2.id);
      const open = await sb.from('quotes').insert({
        ...base(),
        campaign_id: camp2,
        requester_profile_id: brand2.id,
        status: 'draft',
      });
      expect(open.error).toBeNull();
      const noCampaign = await sb
        .from('quotes')
        .insert({ ...base(), campaign_id: null, status: 'sent' });
      expect(noCampaign.error).not.toBeNull();
    });

    it('borrar la campaña borra sus cotizaciones (cascada) y borrar un servicio con cotizaciones es restrict', async () => {
      const brand3 = await world.newProfile('brand');
      const camp3 = await world.newCampaign(brand3.id);
      const q = await sb
        .from('quotes')
        .insert({
          ...base(),
          campaign_id: camp3,
          requester_profile_id: brand3.id,
          status: 'sent',
          service_id: own.service,
        })
        .select('id')
        .single();
      expect(q.error).toBeNull();
      expect((await sb.from('creator_services').delete().eq('id', own.service!)).error?.code).toBe(
        '23503',
      );
      await sb.from('campaigns').delete().eq('id', camp3);
      expect((await sb.from('quotes').select('id').eq('id', q.data!.id)).data).toEqual([]);
    });
  });
});
