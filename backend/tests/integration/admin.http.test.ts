import { describe, expect, it } from 'vitest';
import { api, MAX_REASON_LENGTH } from '@sponcer/contracts';
import { demoUser } from '@sponcer/contracts/fixtures';
import {
  buildTestApp,
  call,
  expectError,
  expectMatchesContract,
  OTHER_USER,
  otherCreator,
  profilePath,
  removalPath,
  STATUS,
  type TestApp,
  unclaimedCreator,
  UNKNOWN_UUID,
} from '../support/app';

/**
 * Panel de exclusiones (Ley 29733): solo administradores (`ADMIN_EMAILS`); aplicar retira la ficha y bloquea el handle,
 * rechazar la mantiene; un pedido se revisa una sola vez.
 */
const ADMIN_ENV = { ADMIN_EMAILS: ` ${demoUser.email.toUpperCase()} , otro.admin@sponcer.local ` };
const OVER = 1;
const PAGE = 2;
const SEVERAL = 5;
const EMAIL = 'titular@correo.pe';

const listPath = api.adminListRemovals.path;
const reviewPath = (id: string) => api.adminReviewRemoval.path.replace(':requestId', id);
const admin = (t: TestApp, query = '') => call(t.app, 'get', `${listPath}${query}`, demoUser.id);
const review = (t: TestApp, id: string, user: string | null, body: unknown) =>
  call(t.app, 'post', reviewPath(id), user, body);
/** Un pedido pendiente (anónimo): devuelve su id leyéndolo del panel. */
async function pendingFor(t: TestApp, handle: string): Promise<string> {
  await call(t.app, 'post', removalPath(handle), null, { email: EMAIL, reason: 'ya no quiero' });
  const all = await admin(t, '?limit=50');
  return all.body.items.find((r: { igHandle: string }) => r.igHandle === handle).id;
}

describe('admin · quién es administrador', () => {
  it('GET /me marca isAdmin solo para los correos de ADMIN_EMAILS (sin distinguir mayúsculas ni espacios)', async () => {
    const t = await buildTestApp(undefined, ADMIN_ENV);
    const asAdmin = await call(t.app, 'get', api.me.path, demoUser.id);
    const asOther = await call(t.app, 'get', api.me.path, OTHER_USER.id);
    expectMatchesContract(api.me, asAdmin.body);
    expect([asAdmin.body.isAdmin, asOther.body.isAdmin]).toEqual([true, false]);
  });

  it('sin ADMIN_EMAILS nadie es administrador', async () => {
    const t = await buildTestApp();
    expect((await call(t.app, 'get', api.me.path, demoUser.id)).body.isAdmin).toBe(false);
  });
});

describe('admin · autorización', () => {
  it('401 sin sesión en el listado y en la revisión', async () => {
    const t = await buildTestApp(undefined, ADMIN_ENV);
    expectError(await call(t.app, 'get', listPath, null), STATUS.UNAUTHORIZED, 'UNAUTHORIZED');
    expectError(
      await review(t, UNKNOWN_UUID, null, { decision: 'apply' }),
      STATUS.UNAUTHORIZED,
      'UNAUTHORIZED',
    );
  });

  it('403 FORBIDDEN para un usuario que no es administrador, en listado y revisión', async () => {
    const t = await buildTestApp(undefined, ADMIN_ENV);
    const id = await pendingFor(t, otherCreator.snapshot.handle);
    expectError(await call(t.app, 'get', listPath, OTHER_USER.id), STATUS.FORBIDDEN, 'FORBIDDEN');
    expectError(
      await review(t, id, OTHER_USER.id, { decision: 'apply' }),
      STATUS.FORBIDDEN,
      'FORBIDDEN',
    );
    // y no pasó nada: la ficha sigue visible y el pedido sigue pendiente
    expect(
      (await call(t.app, 'get', profilePath(otherCreator.snapshot.handle), demoUser.id)).status,
    ).toBe(STATUS.OK);
    expect(
      (await admin(t, '?status=pending')).body.items.map((r: { id: string }) => r.id),
    ).toContain(id);
  });

  it('el dueño de la ficha afectada tampoco es administrador por serlo', async () => {
    const t = await buildTestApp(undefined, ADMIN_ENV);
    const id = await pendingFor(t, otherCreator.snapshot.handle);
    expectError(
      await review(t, id, otherCreator.ownerUserId, { decision: 'apply' }),
      STATUS.FORBIDDEN,
      'FORBIDDEN',
    );
  });

  it('sin ADMIN_EMAILS configurado todos reciben 403', async () => {
    const t = await buildTestApp();
    expectError(await admin(t), STATUS.FORBIDDEN, 'FORBIDDEN');
  });
});

describe('admin · listado', () => {
  it('lista los pedidos con el esquema del contrato, el más reciente primero y la ficha afectada', async () => {
    const t = await buildTestApp(undefined, ADMIN_ENV);
    await pendingFor(t, otherCreator.snapshot.handle);
    t.advanceMinutes(OVER); // el reloj del test es fijo: sin esto ambos pedidos tendrían el mismo instante
    await pendingFor(t, 'handle.sin.ficha');
    const res = await admin(t);
    expect(res.status).toBe(STATUS.OK);
    expectMatchesContract(api.adminListRemovals, res.body);
    const [newest, older] = res.body.items;
    expect(newest).toMatchObject({
      igHandle: 'handle.sin.ficha',
      status: 'pending',
      profile: null,
    });
    expect(older).toMatchObject({ igHandle: otherCreator.snapshot.handle, status: 'pending' });
    expect(older.profile).toMatchObject({ id: otherCreator.id });
  });

  it('filtra por estado y valida el filtro', async () => {
    const t = await buildTestApp(undefined, ADMIN_ENV);
    const id = await pendingFor(t, otherCreator.snapshot.handle);
    await review(t, id, demoUser.id, { decision: 'reject' });
    const rejected = await admin(t, '?status=rejected');
    expect(rejected.body.items.every((r: { status: string }) => r.status === 'rejected')).toBe(
      true,
    );
    expect(
      (await admin(t, '?status=pending')).body.items.map((r: { id: string }) => r.id),
    ).not.toContain(id);
    expectError(await admin(t, '?status=inventado'), STATUS.BAD_REQUEST, 'VALIDATION_ERROR');
  });

  it('pagina con cursor sin repetir ni perder pedidos', async () => {
    const t = await buildTestApp(undefined, ADMIN_ENV);
    await Promise.all(
      Array.from({ length: SEVERAL }, (_, n) => pendingFor(t, `handle.pagina.${n}`)),
    );
    const everything = (await admin(t, '?limit=50')).body.items.map((r: { id: string }) => r.id);
    // Recorre las páginas con el cursor hasta que nextCursor es null.
    const walk = async (cursor: string | null, acc: string[][]): Promise<string[][]> => {
      const res = await admin(t, `?limit=${PAGE}${cursor ? `&cursor=${cursor}` : ''}`);
      const page = res.body.items.map((r: { id: string }) => r.id);
      return res.body.nextCursor === null
        ? [...acc, page]
        : walk(res.body.nextCursor, [...acc, page]);
    };
    const pages = await walk(null, []);
    const collected = pages.flat();
    expect(collected).toEqual(everything);
    expect(pages).toHaveLength(Math.ceil(everything.length / PAGE));
  });

  it.each(['0', '-1', '51', 'abc'])('limit inválido (%s) es 400', async (limit) => {
    const t = await buildTestApp(undefined, ADMIN_ENV);
    expectError(await admin(t, `?limit=${limit}`), STATUS.BAD_REQUEST, 'VALIDATION_ERROR');
  });
});

describe('admin · revisión', () => {
  it('apply: retira la ficha, bloquea el handle y deja el pedido como applied con fecha', async () => {
    const t = await buildTestApp(undefined, ADMIN_ENV);
    const handle = otherCreator.snapshot.handle;
    const id = await pendingFor(t, handle);
    const res = await review(t, id, demoUser.id, {
      decision: 'apply',
      note: 'verificado por correo',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(STATUS.OK);
    expectMatchesContract(api.adminReviewRemoval, res.body);
    expect(res.body).toMatchObject({
      id,
      status: 'applied',
      reviewNote: 'verificado por correo',
      profile: { id: otherCreator.id, status: 'removed' },
    });
    expect(res.body.reviewedAt).toEqual(expect.any(String));
    expectError(
      await call(t.app, 'get', profilePath(handle), demoUser.id),
      STATUS.NOT_FOUND,
      'NOT_FOUND',
    );
    const mine = await call(t.app, 'get', api.me.path, otherCreator.ownerUserId);
    expect(mine.body.profiles.map((p: { id: string }) => p.id)).not.toContain(otherCreator.id);
  });

  it('reject: la ficha sigue visible y el pedido queda rejected', async () => {
    const t = await buildTestApp(undefined, ADMIN_ENV);
    const handle = otherCreator.snapshot.handle;
    const id = await pendingFor(t, handle);
    const res = await review(t, id, demoUser.id, { decision: 'reject', note: 'no es el titular' });
    expect(res.body).toMatchObject({ status: 'rejected', reviewNote: 'no es el titular' });
    expect((await call(t.app, 'get', profilePath(handle), demoUser.id)).status).toBe(STATUS.OK);
  });

  it('revisar dos veces el mismo pedido da 409 CONFLICT y no cambia el resultado', async () => {
    const t = await buildTestApp(undefined, ADMIN_ENV);
    const id = await pendingFor(t, otherCreator.snapshot.handle);
    await review(t, id, demoUser.id, { decision: 'reject' });
    expectError(
      await review(t, id, demoUser.id, { decision: 'apply' }),
      STATUS.CONFLICT,
      'CONFLICT',
    );
    expectError(
      await review(t, id, demoUser.id, { decision: 'reject' }),
      STATUS.CONFLICT,
      'CONFLICT',
    );
    expect(
      (await call(t.app, 'get', profilePath(otherCreator.snapshot.handle), demoUser.id)).status,
    ).toBe(STATUS.OK);
  });

  it('dos revisiones simultáneas: exactamente una gana (200) y la otra recibe 409', async () => {
    const t = await buildTestApp(undefined, ADMIN_ENV);
    const id = await pendingFor(t, otherCreator.snapshot.handle);
    const results = await Promise.all([
      review(t, id, demoUser.id, { decision: 'apply' }),
      review(t, id, demoUser.id, { decision: 'apply' }),
      review(t, id, demoUser.id, { decision: 'reject' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([
      STATUS.OK,
      STATUS.CONFLICT,
      STATUS.CONFLICT,
    ]);
  });

  it('apply de un handle que nunca tuvo ficha: 200 sin perfil y el handle queda bloqueado para la ingesta', async () => {
    const t = await buildTestApp(undefined, ADMIN_ENV);
    const handle = 'jamas.visto.zz';
    const id = await pendingFor(t, handle);
    const res = await review(t, id, demoUser.id, { decision: 'apply' });
    expect(res.body).toMatchObject({ status: 'applied', profile: null });
    // un handle profesional desconocido normalmente se ingiere (200); este quedó bloqueado
    expectError(
      await call(t.app, 'get', profilePath(handle), demoUser.id),
      STATUS.NOT_FOUND,
      'NOT_FOUND',
    );
    expect((await call(t.app, 'get', profilePath('otro.desconocido.zz'), demoUser.id)).status).toBe(
      STATUS.OK,
    );
  });

  it('apply sobre una ficha sin dueño (RF-01) también la retira', async () => {
    const t = await buildTestApp(undefined, ADMIN_ENV);
    const handle = unclaimedCreator.snapshot.handle;
    const id = await pendingFor(t, handle);
    const res = await review(t, id, demoUser.id, { decision: 'apply' });
    expect(res.status).toBe(STATUS.OK);
    expect(res.body.profile).toMatchObject({ status: 'removed' });
  });

  it('404 con un pedido inexistente', async () => {
    const t = await buildTestApp(undefined, ADMIN_ENV);
    expectError(
      await review(t, UNKNOWN_UUID, demoUser.id, { decision: 'apply' }),
      STATUS.NOT_FOUND,
      'NOT_FOUND',
    );
  });

  it.each([
    ['sin cuerpo', undefined],
    ['decisión inexistente', { decision: 'maybe' }],
    ['nota sobre el máximo', { decision: 'apply', note: 'x'.repeat(MAX_REASON_LENGTH + OVER) }],
  ])('400 VALIDATION_ERROR con %s, y no revisa nada', async (_name, body) => {
    const t = await buildTestApp(undefined, ADMIN_ENV);
    const id = await pendingFor(t, otherCreator.snapshot.handle);
    expectError(await review(t, id, demoUser.id, body), STATUS.BAD_REQUEST, 'VALIDATION_ERROR');
    expect(
      (await admin(t, '?status=pending')).body.items.map((r: { id: string }) => r.id),
    ).toContain(id);
  });
});
