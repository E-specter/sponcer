import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api } from '@sponcer/contracts';
import { fixtureProfiles } from '@sponcer/contracts/fixtures';
import {
  anonClient,
  clientWithJwt,
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
import { createSupabaseInvitationSender } from '../../../src/modules/admin/infrastructure/out/supabase/supabase-invitation-sender';
import { describeInvitationSenderContract } from '../admin/invitation-sender.contract';
import { STATUS } from '../../support/app';

/**
 * Auditoría F6 (ADR-008) con adaptadores REALES (auth, profiles, ingestion) contra Supabase local y el correo en
 * Mailpit. Cubre lo que el dev dejó sin probar con BD: 403 de los 5 endpoints nuevos, admin nombrado en la app
 * (Me.isAdmin + panel de exclusiones, y se pierde al revocar), normalización de mayúsculas, reglas de revocación,
 * altas por @handle (ARCO, cuentas no profesionales, duplicado, sin límite por hora) y el destino de la invitación.
 */
const SETUP_TIMEOUT_MS = 90_000;
const MAILPIT = process.env.E2E_MAILPIT_URL ?? 'http://127.0.0.1:55524';
const MAIL_TRIES = 60;
const POLL_MS = 250;
const BURST = 12;
const INVITES_PER_HOUR = 20;
const USERS_PAGE = 1000;
const APP_URL = 'https://audit-f6.trycloudflare.com/';
const PASSWORD = 'Audit-test-Passw0rd!';
const SNAP = fixtureProfiles[0]!.snapshot;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (check: () => Promise<boolean>, tries = MAIL_TRIES): Promise<boolean> => {
  if (await check()) return true;
  if (tries <= 0) return false;
  await sleep(POLL_MS);
  return waitFor(check, tries - 1);
};

/** Cuerpo (texto + html) del último correo de Mailpit para `email`, o null si aún no llegó. */
async function mailTo(email: string): Promise<string | null> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
  const { messages } = (await res.json()) as { messages?: Array<{ ID: string }> };
  const id = messages?.[0]?.ID;
  if (!id) return null;
  const detail = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as {
    Text: string;
    HTML: string;
  };
  return `${detail.Text}\n${detail.HTML}`.replaceAll('&amp;', '&');
}

describe.skipIf(!hasSupabase)('F6 · altas manuales y administradores (Supabase local)', () => {
  const sb = serviceClient();
  const world = createWorld(sb);
  const tag = uniqueTag();
  const emailOf = (n: string) => `${n}.${tag}@${TEST_EMAIL_DOMAIN}`;
  const handleOf = (n: string) => `zz.${tag}.${n}`;
  let app: ReturnType<typeof composeApp>['app'];
  let admin: { user: TestUser; jwt: string };
  let plain: { user: TestUser; jwt: string };

  const as = (jwt: string | null) => (jwt ? { Authorization: `Bearer ${jwt}` } : {});
  const get = (jwt: string | null, path: string) => request(app).get(path).set(as(jwt));
  const post = (jwt: string | null, path: string, body: object = {}) =>
    request(app).post(path).set(as(jwt)).send(body);
  const me = async (jwt: string) => (await get(jwt, api.me.path)).body.isAdmin as boolean;
  const adminRows = async (email: string) =>
    (await sb.from('admin_users').select('*').eq('email', email.toLowerCase())).data ?? [];
  const profileRows = async (handle: string) =>
    (await sb.from('profiles').select('*').eq('ig_handle', handle)).data ?? [];
  const newActor = async () => {
    const user = await world.newUser();
    return { user, jwt: await world.signIn(user) };
  };
  const seedSnapshot = async (handle: string, over: Record<string, unknown> = {}) => {
    world.trackHandle(handle);
    const payload = { ...SNAP, handle, fetchedAt: new Date().toISOString(), ...over };
    const res = await sb
      .from('ig_snapshots')
      .insert({ ig_handle: handle, payload, source: 'mock' });
    expect(res.error).toBeNull();
  };
  const authUsersFor = async (email: string) =>
    (await sb.auth.admin.listUsers({ perPage: USERS_PAGE })).data.users.filter(
      (u) => u.email === email.toLowerCase(),
    );

  const clean = async () => {
    await sb.from('admin_users').delete().like('email', `%@${TEST_EMAIL_DOMAIN}`);
    await sb.from('profiles').delete().like('ig_handle', `zz.${tag}.%`);
    // El bloqueo ARCO lo escribe un manejador asíncrono: puede llegar después del cleanup del mundo.
    await Promise.all(
      ['ingestion_blocklist', 'ig_snapshots', 'profile_removal_requests'].map((t) =>
        sb.from(t).delete().like('ig_handle', `zz.${tag}.%`),
      ),
    );
    const users = await sb.auth.admin.listUsers({ perPage: USERS_PAGE });
    await Promise.all(
      users.data.users
        .filter((u) => u.email?.includes(`.${tag}@`))
        .map((u) => sb.auth.admin.deleteUser(u.id)),
    );
  };

  beforeAll(async () => {
    await clean();
    admin = await newActor();
    plain = await newActor();
    const composed = composeApp(
      loadEnv({
        NODE_ENV: 'test',
        ADAPTER_AUTH: 'real',
        ADAPTER_PROFILES: 'real',
        ADAPTER_INGESTION: 'real',
        APIFY_TOKEN: 'token-falso-no-se-debe-usar',
        APP_URL,
        // Mayúsculas y espacios: loadEnv debe normalizar.
        ADMIN_EMAILS: ` ${admin.user.email.toUpperCase()} `,
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

  describe('403 a un usuario autenticado que no es administrador', () => {
    const ENDPOINTS = [
      api.adminAddProfile,
      api.adminInviteUser,
      api.adminListAdmins,
      api.adminGrantAdmin,
      api.adminRevokeAdmin,
    ] as const;

    it.each(ENDPOINTS)('$path ($method) devuelve 403 y no deja rastro', async (endpoint) => {
      const victim = emailOf('victima');
      const handle = handleOf('denegado');
      await seedSnapshot(handle);
      const body =
        endpoint === api.adminAddProfile
          ? { handle, role: 'creator' }
          : { email: endpoint === api.adminRevokeAdmin ? admin.user.email : victim };
      const res =
        endpoint.method === 'get'
          ? await get(plain.jwt, endpoint.path)
          : await post(plain.jwt, endpoint.path, body);
      expect(res.status).toBe(STATUS.FORBIDDEN);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(await adminRows(victim)).toEqual([]);
      expect(await profileRows(handle)).toEqual([]);
      expect(await authUsersFor(victim)).toEqual([]);
      expect(await get(admin.jwt, api.adminListAdmins.path).then((r) => r.body)).toHaveLength(1);
    });

    it('sin sesión: 401 en los 5 endpoints', async () => {
      const calls = ENDPOINTS.map((e) =>
        e.method === 'get' ? get(null, e.path) : post(null, e.path, { email: 'a@b.pe' }),
      );
      (await Promise.all(calls)).forEach((r) => expect(r.status).toBe(STATUS.UNAUTHORIZED));
    });

    it('invitar: un no admin recibe la misma respuesta si el correo existe o no (no hay oráculo)', async () => {
      const existing = await post(plain.jwt, api.adminInviteUser.path, { email: plain.user.email });
      const fresh = await post(plain.jwt, api.adminInviteUser.path, { email: emailOf('nuevo') });
      expect([existing.status, fresh.status]).toEqual([STATUS.FORBIDDEN, STATUS.FORBIDDEN]);
      expect(existing.body).toEqual(fresh.body);
      expect(await authUsersFor(emailOf('nuevo'))).toEqual([]);
    });
  });

  describe('administradores nombrados en la app', () => {
    it('el admin de .env se reconoce con mayúsculas/espacios en ADMIN_EMAILS y figura como env', async () => {
      expect(await me(admin.jwt)).toBe(true);
      const list = await get(admin.jwt, api.adminListAdmins.path);
      expect(list.body).toEqual([
        { email: admin.user.email, source: 'env', grantedAt: null, grantedBy: null },
      ]);
    });

    it('nombrar (correo en MAYÚSCULAS): se guarda en minúsculas, lo ve /me y accede al panel de exclusiones; al revocar lo pierde', async () => {
      const target = await newActor();
      expect(await me(target.jwt)).toBe(false);
      expect((await get(target.jwt, api.adminListRemovals.path)).status).toBe(STATUS.FORBIDDEN);

      const grant = await post(admin.jwt, api.adminGrantAdmin.path, {
        email: target.user.email.toUpperCase(),
      });
      expect(grant.status, JSON.stringify(grant.body)).toBe(STATUS.OK);
      const row = (await adminRows(target.user.email))[0];
      expect(row).toMatchObject({ email: target.user.email, granted_by: admin.user.email });

      // Mismo JWT que antes: el rol se resuelve en cada petición, no queda en el token.
      expect(await me(target.jwt)).toBe(true);
      expect((await get(target.jwt, api.adminListRemovals.path)).status).toBe(STATUS.OK);
      const list = await get(target.jwt, api.adminListAdmins.path);
      expect(list.body.map((a: { email: string }) => a.email)).toContain(target.user.email);

      // Un admin nombrado también puede nombrar, pero idempotente y sin duplicar.
      const again = await post(target.jwt, api.adminGrantAdmin.path, {
        email: target.user.email.toUpperCase(),
      });
      expect(
        again.body.filter((a: { email: string }) => a.email === target.user.email),
      ).toHaveLength(1);

      const revoke = await post(admin.jwt, api.adminRevokeAdmin.path, {
        email: target.user.email.toUpperCase(),
      });
      expect(revoke.status, JSON.stringify(revoke.body)).toBe(STATUS.OK);
      expect(await adminRows(target.user.email)).toEqual([]);
      expect(await me(target.jwt)).toBe(false);
      expect((await get(target.jwt, api.adminListRemovals.path)).status).toBe(STATUS.FORBIDDEN);
      expect(
        (await post(target.jwt, api.adminGrantAdmin.path, { email: emailOf('x') })).status,
      ).toBe(STATUS.FORBIDDEN);
    });

    it('no se puede quitar un admin de .env (409) ni un correo que no es admin (404)', async () => {
      const env = await post(admin.jwt, api.adminRevokeAdmin.path, {
        email: admin.user.email.toUpperCase(),
      });
      expect([env.status, env.body.error.code]).toEqual([STATUS.CONFLICT, 'CONFLICT']);
      const none = await post(admin.jwt, api.adminRevokeAdmin.path, { email: emailOf('nadie') });
      expect([none.status, none.body.error.code]).toEqual([STATUS.NOT_FOUND, 'NOT_FOUND']);
      expect(await me(admin.jwt)).toBe(true);
    });

    it('nombrar a un admin de .env no crea una fila duplicada ni lo vuelve revocable', async () => {
      const res = await post(admin.jwt, api.adminGrantAdmin.path, { email: admin.user.email });
      expect(res.body.filter((a: { email: string }) => a.email === admin.user.email)).toEqual([
        expect.objectContaining({ source: 'env' }),
      ]);
      const rev = await post(admin.jwt, api.adminRevokeAdmin.path, { email: admin.user.email });
      expect(rev.status).toBe(STATUS.CONFLICT);
      expect(await me(admin.jwt)).toBe(true);
      await sb.from('admin_users').delete().eq('email', admin.user.email);
    });

    it('no se puede quitar al último administrador (BD real, sin ADMIN_EMAILS)', async (ctx) => {
      const others = await sb
        .from('admin_users')
        .select('email')
        .not('email', 'like', `%.${tag}@%`);
      if ((others.data ?? []).length > 0) return ctx.skip(); // la BD local ya tiene otros administradores
      const sole = await newActor();
      await sb.from('admin_users').insert({ email: sole.user.email });
      const noEnv = composeApp(
        loadEnv({
          NODE_ENV: 'test',
          ADAPTER_AUTH: 'real',
          ADAPTER_PROFILES: 'real',
          ADAPTER_INGESTION: 'real',
          APIFY_TOKEN: 'token-falso-no-se-debe-usar',
          ...supabaseEnv(),
        }),
      );
      const res = await request(noEnv.app)
        .post(api.adminRevokeAdmin.path)
        .set(as(sole.jwt))
        .send({ email: sole.user.email });
      expect([res.status, res.body.error.code]).toEqual([STATUS.CONFLICT, 'CONFLICT']);
      expect(await adminRows(sole.user.email)).toHaveLength(1);
    });

    // DEFECTO ALTO (F6-A1): el registro público de Supabase (enable_signup + enable_confirmations=false) entrega una
    // sesión con el correo YA "confirmado" sin que el dueño lo verifique. Quien conozca un correo de admin que aún no
    // se registró (ADMIN_EMAILS o nombrado en la app) se hace administrador con `signUp`. Corregido con
    // enable_confirmations=true: el signUp ya no devuelve sesión.
    it('un correo nombrado admin pero no registrado no se puede usurpar con el registro público', async () => {
      const victim = emailOf('sinregistrar');
      await post(admin.jwt, api.adminGrantAdmin.path, { email: victim });
      const signup = await anonClient().auth.signUp({ email: victim, password: PASSWORD });
      // enable_confirmations=true: el registro público no devuelve sesión hasta que el dueño abra su correo.
      expect(signup.error).toBeNull();
      expect(signup.data.session).toBeNull();
      const login = await anonClient().auth.signInWithPassword({
        email: victim,
        password: PASSWORD,
      });
      expect(login.data.session).toBeNull();
      expect(login.error?.code).toBe('email_not_confirmed');
    });
  });

  describe('límite de invitaciones por administrador (F6-M3)', () => {
    it('la invitación 21 de una hora de un administrador da 429 RATE_LIMITED y otro administrador no se ve afectado', async () => {
      const named = await newActor();
      await post(admin.jwt, api.adminGrantAdmin.path, { email: named.user.email });
      const sent = await Array.from({ length: INVITES_PER_HOUR }, (_, i) => i).reduce<
        Promise<number[]>
      >(
        async (acc, i) => [
          ...(await acc),
          (await post(named.jwt, api.adminInviteUser.path, { email: emailOf(`lim${i}`) })).status,
        ],
        Promise.resolve([]),
      );
      expect(sent).toEqual(sent.map(() => STATUS.OK));
      const over = await post(named.jwt, api.adminInviteUser.path, { email: emailOf('lim-extra') });
      expect([over.status, over.body.error.code]).toEqual([STATUS.TOO_MANY, 'RATE_LIMITED']);
      expect(await authUsersFor(emailOf('lim-extra'))).toEqual([]);
      const other = await post(admin.jwt, api.adminInviteUser.path, { email: emailOf('otro') });
      expect(other.status).toBe(STATUS.OK);
    });
  });

  describe('RLS de admin_users desde la API pública (PostgREST)', () => {
    it('anon y authenticated no leen, insertan, actualizan ni borran; se probó UPDATE con filtro y upsert', async () => {
      const email = emailOf('rls');
      expect((await sb.from('admin_users').insert({ email })).error).toBeNull();
      const clients = [anonClient(), clientWithJwt(plain.jwt)];
      await Promise.all(
        clients.map(async (c) => {
          expect((await c.from('admin_users').select('*')).data ?? []).toEqual([]);
          expect(
            (await c.from('admin_users').insert({ email: emailOf('i') })).error,
          ).not.toBeNull();
          expect(
            (await c.from('admin_users').upsert({ email, granted_by: 'hack@x.pe' })).error,
          ).not.toBeNull();
          await c.from('admin_users').update({ granted_by: 'hack@x.pe' }).eq('email', email);
          await c.from('admin_users').delete().neq('email', '');
        }),
      );
      const row = (await adminRows(email))[0];
      expect(row.granted_by).toBeNull();
      expect(await me(plain.jwt)).toBe(false);
    });
  });

  describe('invitaciones (correo en Mailpit)', () => {
    it('invitar a un correo nuevo: sent, crea el usuario y el enlace vuelve a APP_URL/auth/callback', async () => {
      const email = emailOf('invitado');
      const res = await post(admin.jwt, api.adminInviteUser.path, { email: email.toUpperCase() });
      expect(res.status, JSON.stringify(res.body)).toBe(STATUS.OK);
      expect(res.body).toMatchObject({ email, status: 'sent' });
      let body: string | null = null;
      expect(await waitFor(async () => (body = await mailTo(email)) !== null)).toBe(true);
      expect(body).toContain('https://audit-f6.trycloudflare.com/auth/callback?token_hash=');
      expect(body).toContain('type=invite');
      expect(await authUsersFor(email)).toHaveLength(1);
    });

    it('invitar a un correo con cuenta: already_registered y recibe un enlace de acceso (sin crear usuarios)', async () => {
      const before = (await sb.auth.admin.listUsers({ perPage: USERS_PAGE })).data.users.length;
      const res = await post(admin.jwt, api.adminInviteUser.path, { email: plain.user.email });
      expect(res.body.status).toBe('already_registered');
      expect(await waitFor(async () => (await mailTo(plain.user.email)) !== null)).toBe(true);
      expect((await sb.auth.admin.listUsers({ perPage: USERS_PAGE })).data.users.length).toBe(
        before,
      );
    });

    it('correo mal formado: 400 y no se crea nada', async () => {
      const res = await post(admin.jwt, api.adminInviteUser.path, { email: 'no-es-correo' });
      expect(res.status).toBe(STATUS.BAD_REQUEST);
    });
  });

  describe('InvitationSender real (misma suite que el mock)', () => {
    let n = 0;
    let known: TestUser;
    beforeAll(async () => void (known = await world.newUser()));
    // Un correo nuevo por prueba y una pausa: Supabase exige >1 s entre correos (max_frequency).
    describeInvitationSenderContract(() => createSupabaseInvitationSender(sb, APP_URL), {
      knownEmail: () => known.email,
      freshEmail: () => emailOf(`contrato${n++}`),
    });
  });

  describe('alta de perfiles por @handle (ingesta real con caché, sin llamar a Apify)', () => {
    const add = (jwt: string, handle: string, role = 'creator') =>
      post(jwt, api.adminAddProfile.path, { handle, role });

    it('crea una ficha previa sin dueño, clasificable, registrada en la BD; el duplicado da 409', async () => {
      const handle = handleOf('ok');
      await seedSnapshot(handle);
      const first = await add(admin.jwt, handle, 'brand');
      expect(first.status, JSON.stringify(first.body)).toBe(STATUS.OK);
      expect(first.body).toMatchObject({
        handle,
        role: 'brand',
        status: 'unclaimed',
        isOwner: false,
      });
      expect(await profileRows(handle)).toEqual([
        expect.objectContaining({ role: 'brand', status: 'unclaimed', owner_user_id: null }),
      ]);
      const dup = await add(admin.jwt, handle);
      expect([dup.status, dup.body.error.code]).toEqual([STATUS.CONFLICT, 'CONFLICT']);
    });

    it('dos altas simultáneas del mismo handle: una gana (200) y la otra recibe 409, con una sola fila', async () => {
      const handle = handleOf('carrera');
      await seedSnapshot(handle);
      const res = await Promise.all([add(admin.jwt, handle), add(admin.jwt, handle)]);
      expect(res.map((r) => r.status).sort()).toEqual([STATUS.OK, STATUS.CONFLICT]);
      expect(await profileRows(handle)).toHaveLength(1);
    });

    it('no hay límite por hora para administradores (más altas que el tope de búsqueda)', async () => {
      const handles = Array.from({ length: BURST }, (_, i) => handleOf(`masivo${i}`));
      await Promise.all(handles.map((h) => seedSnapshot(h)));
      // En serie: 12 altas en paralelo dejan colgada alguna petición contra el Supabase local (ver reporte).
      const res = await handles.reduce<Promise<number[]>>(
        async (acc, h) => [...(await acc), (await add(admin.jwt, h)).status],
        Promise.resolve([]),
      );
      expect(res).toEqual(handles.map(() => STATUS.OK));
    });

    it('cuenta privada o no profesional: 403 y no se crea ficha', async () => {
      const personal = handleOf('personal');
      const priv = handleOf('privada');
      await seedSnapshot(personal, { isBusiness: false });
      await seedSnapshot(priv, { isPrivate: true });
      await Promise.all(
        [personal, priv].map(async (h) => {
          const res = await add(admin.jwt, h);
          expect([res.status, res.body.error.code]).toEqual([STATUS.FORBIDDEN, 'FORBIDDEN']);
          expect(await profileRows(h)).toEqual([]);
        }),
      );
    });

    it('handle en la lista de exclusión ARCO: 403 aunque haya snapshot fresco, y no se crea ficha', async () => {
      const handle = handleOf('arco');
      await seedSnapshot(handle);
      world.trackHandle(handle);
      expect((await sb.from('ingestion_blocklist').insert({ ig_handle: handle })).error).toBeNull();
      const res = await add(admin.jwt, handle);
      expect([res.status, res.body.error.code]).toEqual([STATUS.FORBIDDEN, 'FORBIDDEN']);
      expect(await profileRows(handle)).toEqual([]);
    });

    it('exclusión aplicada por un admin sobre una ficha: no se puede volver a dar de alta (403)', async () => {
      const handle = handleOf('retirada');
      await seedSnapshot(handle);
      expect((await add(admin.jwt, handle)).status).toBe(STATUS.OK);
      const req = await post(null, api.requestRemoval.path.replace(':handle', handle), {
        email: 'titular@correo.pe',
      });
      expect(req.status).toBe(STATUS.OK);
      const list = await get(admin.jwt, `${api.adminListRemovals.path}?limit=50`);
      const pending = list.body.items.find((r: { igHandle: string }) => r.igHandle === handle);
      const review = await post(
        admin.jwt,
        api.adminReviewRemoval.path.replace(':requestId', pending.id),
        { decision: 'apply' },
      );
      expect(review.status, JSON.stringify(review.body)).toBe(STATUS.OK);
      expect(await waitFor(async () => (await profileRows(handle))[0]?.status === 'removed')).toBe(
        true,
      );
      const again = await add(admin.jwt, handle);
      expect([again.status, again.body.error.code]).toEqual([STATUS.FORBIDDEN, 'FORBIDDEN']);
      expect(await profileRows(handle)).toHaveLength(1);
    });

    it('validación en el borde: handle inválido y rol desconocido dan 400', async () => {
      expect((await add(admin.jwt, 'no válido!')).status).toBe(STATUS.BAD_REQUEST);
      expect((await add(admin.jwt, handleOf('x'), 'dios')).status).toBe(STATUS.BAD_REQUEST);
    });
  });
});
