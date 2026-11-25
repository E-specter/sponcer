import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api } from '@sponcer/contracts';
import { demoUser } from '@sponcer/contracts/fixtures';
import {
  anonClient,
  clientWithJwt,
  createWorld,
  hasSupabase,
  serviceClient,
  supabaseEnv,
  TEST_EMAIL_DOMAIN,
  uniqueTag,
} from '../../../../db/tests/support/supabase';
import { createApp } from '../../../src/app';
import { loadEnv } from '../../../src/config/env';
import { createAdminModule } from '../../../src/modules/admin';
import { createAuthMiddleware } from '../../../src/modules/auth/infrastructure/in/http/auth.middleware';
import { createMockIdentityProvider } from '../../../src/modules/auth/infrastructure/out/mock/mock-adapters';
import { createAdminDirectory } from '../../../src/shared/admin';
import { createSupabaseAdminStore } from '../../../src/shared/supabase/admin-store';
import { call, expectError, OTHER_USER, STATUS } from '../../support/app';

/**
 * admin_users (ADR-008) contra Supabase local: RLS sin politicas (solo service_role) y los endpoints de
 * administradores e invitaciones con adaptadores REALES (el correo de invitacion llega a Mailpit local).
 */
const SETUP_TIMEOUT_MS = 60_000;
const PAGE = 1000;
const APP_URL = 'http://localhost:4321';

describe.skipIf(!hasSupabase)('admin_users y altas manuales (Supabase local)', () => {
  const sb = serviceClient();
  const world = createWorld(sb);
  const tag = uniqueTag();
  const added = (n: string) => `${n}.${tag}@${TEST_EMAIL_DOMAIN}`;
  let app: ReturnType<typeof createApp>;

  const clean = async () => {
    await sb.from('admin_users').delete().like('email', `%@${TEST_EMAIL_DOMAIN}`);
    const users = await sb.auth.admin.listUsers({ perPage: PAGE });
    await Promise.all(
      users.data.users
        .filter((u) => u.email?.includes(`.${tag}@`))
        .map((u) => sb.auth.admin.deleteUser(u.id)),
    );
  };

  beforeAll(async () => {
    const env = loadEnv({ ADMIN_EMAILS: demoUser.email, ...supabaseEnv() });
    const admins = createAdminDirectory(env.ADMIN_EMAILS, createSupabaseAdminStore(sb));
    app = createApp({
      env,
      authMiddleware: createAuthMiddleware(createMockIdentityProvider()),
      routers: [
        createAdminModule({ adapter: 'real', admins, supabase: sb, appUrl: APP_URL }).router,
      ],
    });
    await clean();
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await clean();
    await world.cleanup();
  }, SETUP_TIMEOUT_MS);

  it(
    'RLS: anon y authenticated no leen ni escriben admin_users; service_role si',
    async () => {
      const user = await world.newUser();
      const jwt = await world.signIn(user);
      const email = added('rls');
      expect((await sb.from('admin_users').insert({ email })).error).toBeNull();
      await Promise.all(
        [anonClient(), clientWithJwt(jwt)].map(async (client) => {
          expect((await client.from('admin_users').select('*')).data ?? []).toEqual([]);
          expect(
            (await client.from('admin_users').insert({ email: added('x') })).error,
          ).not.toBeNull();
          await client.from('admin_users').delete().eq('email', email);
        }),
      );
      expect((await sb.from('admin_users').select('email').eq('email', email)).data).toHaveLength(
        1,
      );
    },
    SETUP_TIMEOUT_MS,
  );

  it('un no admin recibe 403 (con la BD real)', async () => {
    const res = await call(app, 'get', api.adminListAdmins.path, OTHER_USER.id);
    expectError(res, STATUS.FORBIDDEN, 'FORBIDDEN');
  });

  it('nombrar y revocar persiste en la BD, con granted_by y reglas de ADMIN_EMAILS', async () => {
    const email = added('nuevo');
    const grant = () =>
      call(app, 'post', api.adminGrantAdmin.path, demoUser.id, { email: email.toUpperCase() });
    expect((await grant()).status).toBe(STATUS.OK);
    const again = await grant();
    expect(again.body.filter((a: { email: string }) => a.email === email)).toHaveLength(1);
    const row = (await sb.from('admin_users').select('*').eq('email', email)).data?.[0];
    expect(row).toMatchObject({ email, granted_by: demoUser.email });

    const env = await call(app, 'post', api.adminRevokeAdmin.path, demoUser.id, {
      email: demoUser.email,
    });
    expectError(env, STATUS.CONFLICT, 'CONFLICT');
    const rev = await call(app, 'post', api.adminRevokeAdmin.path, demoUser.id, { email });
    expect(rev.status).toBe(STATUS.OK);
    expect((await sb.from('admin_users').select('email').eq('email', email)).data).toEqual([]);
  });

  it(
    'invitar: sent para un correo nuevo y already_registered si ya tenia cuenta',
    async () => {
      const fresh = added('invitado');
      const first = await call(app, 'post', api.adminInviteUser.path, demoUser.id, {
        email: fresh,
      });
      expect(first.body).toMatchObject({ email: fresh, status: 'sent' });
      const existing = await world.newUser();
      const second = await call(app, 'post', api.adminInviteUser.path, demoUser.id, {
        email: existing.email,
      });
      expect(second.status, JSON.stringify(second.body)).toBe(STATUS.OK);
      expect(second.body.status).toBe('already_registered');
    },
    SETUP_TIMEOUT_MS,
  );
});
