import { describe, expect, it } from 'vitest';
import { api } from '@sponcer/contracts';
import { demoUser, fixtureUsers } from '@sponcer/contracts/fixtures';
import {
  buildTestApp,
  call,
  expectError,
  expectMatchesContract,
  OTHER_USER,
  STATUS,
} from '../support/app';

/** Altas manuales de administracion (ADR-008) con adaptadores mock. */
const TWO_ADMINS = 2;
const BURST = 12;
const ENV = { ADMIN_EMAILS: demoUser.email };
const body = (res: { body: unknown }) => res.body as Array<{ email: string; source: string }>;

describe('admin · altas manuales', () => {
  it('los 5 endpoints devuelven 403 a un no administrador', async () => {
    const t = await buildTestApp(undefined, ENV);
    const calls = [
      call(t.app, 'post', api.adminAddProfile.path, OTHER_USER.id, { handle: 'x.y' }),
      call(t.app, 'post', api.adminInviteUser.path, OTHER_USER.id, { email: 'n@x.pe' }),
      call(t.app, 'get', api.adminListAdmins.path, OTHER_USER.id),
      call(t.app, 'post', api.adminGrantAdmin.path, OTHER_USER.id, { email: 'n@x.pe' }),
      call(t.app, 'post', api.adminRevokeAdmin.path, OTHER_USER.id, { email: demoUser.email }),
    ];
    (await Promise.all(calls)).forEach((r) => expectError(r, STATUS.FORBIDDEN, 'FORBIDDEN'));
  });

  it('administradores: listar, nombrar (idempotente), /me lo refleja y revocar con reglas', async () => {
    const t = await buildTestApp(undefined, ENV);
    const list = await call(t.app, 'get', api.adminListAdmins.path, demoUser.id);
    expectMatchesContract(api.adminListAdmins, list.body);
    expect(body(list).map((a) => a.source)).toEqual(['env']);

    const grant = () =>
      call(t.app, 'post', api.adminGrantAdmin.path, demoUser.id, { email: OTHER_USER.email });
    expect((await grant()).status).toBe(STATUS.OK);
    const second = await grant();
    expectMatchesContract(api.adminGrantAdmin, second.body);
    expect(body(second)).toHaveLength(TWO_ADMINS);
    const me = await call(t.app, 'get', api.me.path, OTHER_USER.id);
    expect(me.body.isAdmin).toBe(true);

    const revEnv = await call(t.app, 'post', api.adminRevokeAdmin.path, OTHER_USER.id, {
      email: demoUser.email,
    });
    expectError(revEnv, STATUS.CONFLICT, 'CONFLICT');
    const rev = await call(t.app, 'post', api.adminRevokeAdmin.path, demoUser.id, {
      email: OTHER_USER.email,
    });
    expect(body(rev).map((a) => a.email)).toEqual([demoUser.email]);
    const after = await call(t.app, 'get', api.me.path, OTHER_USER.id);
    expect(after.body.isAdmin).toBe(false);
  });

  it('invitar: sent para un correo nuevo, already_registered para uno existente', async () => {
    const t = await buildTestApp(undefined, ENV);
    const fresh = await call(t.app, 'post', api.adminInviteUser.path, demoUser.id, {
      email: 'Nueva@Persona.pe',
    });
    expectMatchesContract(api.adminInviteUser, fresh.body);
    expect(fresh.body).toMatchObject({ email: 'nueva@persona.pe', status: 'sent' });
    const known = await call(t.app, 'post', api.adminInviteUser.path, demoUser.id, {
      email: fixtureUsers[0]!.email,
    });
    expect(known.body.status).toBe('already_registered');
    const bad = await call(t.app, 'post', api.adminInviteUser.path, demoUser.id, { email: 'no' });
    expectError(bad, STATUS.BAD_REQUEST, 'VALIDATION_ERROR');
  });

  it('agregar perfil: crea la ficha previa, 409 si ya existe y sin limite por hora', async () => {
    const t = await buildTestApp(undefined, ENV);
    const add = (handle: string) =>
      call(t.app, 'post', api.adminAddProfile.path, demoUser.id, { handle, role: 'brand' });
    const first = await add('marca.alta.demo');
    expect(first.status, JSON.stringify(first.body)).toBe(STATUS.OK);
    expectMatchesContract(api.adminAddProfile, first.body);
    expect(first.body).toMatchObject({ status: 'unclaimed', role: 'brand', isOwner: false });
    expectError(await add('marca.alta.demo'), STATUS.CONFLICT, 'CONFLICT');
    const many = await Promise.all(
      Array.from({ length: BURST }, (_, i) => add(`alta.masiva.${i}`)),
    );
    expect(many.every((r) => r.status === STATUS.OK)).toBe(true);
  });
});
