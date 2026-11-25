import { describe, expect, it } from 'vitest';
import {
  api,
  MAX_PRICE_PEN,
  MAX_REASON_LENGTH,
  MAX_SERVICES,
  MAX_SHORT_TEXT,
  NICHES,
} from '@sponcer/contracts';
import { demoUser, fixtureProfiles } from '@sponcer/contracts/fixtures';
import {
  buildTestApp,
  call,
  claimsPath,
  declaredPath,
  demoBrand,
  demoCreator,
  expectError,
  expectMatchesContract,
  OTHER_USER,
  otherCreator,
  profilePath,
  removalPath,
  servicesPath,
  STATUS,
  type TestApp,
  UNKNOWN_UUID,
  unclaimedCreator,
  verifyPath,
} from '../support/app';

const MAX_NICHES_CREATOR = 3;
const OVER = 1;
const REMOVAL_LIMIT_PER_HOUR = 20;
const EXTRA_PRICE = 150;
const NEGATIVE_PRICE = -5;
const FRACTIONAL_PRICE = 10.5;
const VALID_SERVICE = {
  type: demoCreator.services[0]!.type,
  format: demoCreator.services[0]!.format,
  pricePen: EXTRA_PRICE,
  description: 'Reel de prueba',
};
const CREATOR_DECLARED = demoCreator.declared!;
const BRAND_DECLARED = demoBrand.declared!;
const EMAIL = 'titular@correo.pe';
const MINUTES_PER_HOUR = 60;

const get = (t: TestApp, handle: string, user: string | null) =>
  call(t.app, 'get', profilePath(handle), user);

describe('GET /profiles/:handle', () => {
  it('401 sin token (las fichas solo son visibles para usuarios autenticados, RNF-05)', async () => {
    expectError(
      await get(await buildTestApp(), demoCreator.snapshot.handle, null),
      STATUS.UNAUTHORIZED,
      'UNAUTHORIZED',
    );
  });

  it('200 de un perfil propio: cumple el esquema y marca isOwner', async () => {
    const res = await get(await buildTestApp(), demoCreator.snapshot.handle, demoUser.id);
    expect(res.status).toBe(STATUS.OK);
    expectMatchesContract(api.getProfile, res.body);
    expect(res.body).toMatchObject({ id: demoCreator.id, isOwner: true, role: 'creator' });
    expect(res.body.services).toEqual(demoCreator.services);
  });

  it('200 de un perfil ajeno: isOwner false y sin datos de su dueño', async () => {
    const res = await get(await buildTestApp(), otherCreator.snapshot.handle, demoUser.id);
    expect(res.status).toBe(STATUS.OK);
    expectMatchesContract(api.getProfile, res.body);
    expect(res.body.isOwner).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain(OTHER_USER.id);
    expect(JSON.stringify(res.body)).not.toContain(OTHER_USER.email);
  });

  it('200 de una ficha sin dueño (RF-01): declared null', async () => {
    const res = await get(await buildTestApp(), unclaimedCreator.snapshot.handle, demoUser.id);
    expectMatchesContract(api.getProfile, res.body);
    expect(res.body).toMatchObject({ isOwner: false, status: 'unclaimed', declared: null });
  });

  it('404 NOT_FOUND si la ficha existe pero fue retirada (handle bloqueado)', async () => {
    const t = await buildTestApp();
    const handle = demoCreator.snapshot.handle;
    await call(t.app, 'post', removalPath(handle), demoUser.id, { email: demoUser.email });
    expectError(await get(t, handle, demoUser.id), STATUS.NOT_FOUND, 'NOT_FOUND');
  });

  it.each(['%00', '..%2F..%2Fetc%2Fpasswd', "'%20OR%201%3D1"])(
    'no revienta con el handle hostil %s',
    async (h) => {
      const res = await get(await buildTestApp(), h, demoUser.id);
      expect(res.status).toBeLessThan(STATUS.SERVER_ERROR);
    },
  );

  it('M-3: el handle de la ruta es insensible a mayúsculas y al @, como IgHandle', async () => {
    const t = await buildTestApp();
    const upper = await get(t, demoCreator.snapshot.handle.toUpperCase(), demoUser.id);
    expect(upper.status).toBe(STATUS.OK);
    expect(upper.body.id).toBe(demoCreator.id);
    const withAt = await get(t, `%40${demoCreator.snapshot.handle}`, demoUser.id);
    expect(withAt.body.id).toBe(demoCreator.id);
  });

  it('un handle de la ruta con formato inválido es 400, no 404', async () => {
    expectError(
      await get(await buildTestApp(), 'con%20espacio', demoUser.id),
      STATUS.BAD_REQUEST,
      'VALIDATION_ERROR',
    );
  });
});

describe('GET /profiles/:handle · ingesta bajo demanda (RF-01)', () => {
  const NEW_HANDLE = 'marca.nueva.demo';
  const ON_DEMAND_LIMIT = 10;
  const OVER_LIMIT = 1;
  const handleN = (n: number) => `nuevo.perfil.${n}`;

  it('un handle profesional desconocido se ingiere: 200 con una ficha unclaimed de rol creator', async () => {
    const t = await buildTestApp();
    const res = await get(t, NEW_HANDLE, demoUser.id);
    expect(res.status, JSON.stringify(res.body)).toBe(STATUS.OK);
    expectMatchesContract(api.getProfile, res.body);
    expect(res.body).toMatchObject({
      handle: NEW_HANDLE,
      status: 'unclaimed',
      role: 'creator',
      declared: null,
      isOwner: false,
    });
    expect(res.body.ingested.biography).toContain(NEW_HANDLE);
  });

  it('es idempotente: repetir la consulta devuelve la misma ficha, sin duplicarla ni repetir el evento', async () => {
    const t = await buildTestApp();
    const first = await get(t, NEW_HANDLE, demoUser.id);
    const eventsAfterFirst = t.events.length;
    const second = await get(t, NEW_HANDLE, OTHER_USER.id);
    expect(second.status).toBe(STATUS.OK);
    expect(second.body.id).toBe(first.body.id);
    expect(t.events).toHaveLength(eventsAfterFirst);
  });

  it('la ficha creada se reclama sin duplicarse (ADR-002 paso 4)', async () => {
    const t = await buildTestApp();
    const created = await get(t, NEW_HANDLE, demoUser.id);
    const claim = await call(t.app, 'post', claimsPath, demoUser.id, {
      handle: NEW_HANDLE,
      role: 'brand',
    });
    const verified = await call(t.app, 'post', verifyPath(claim.body.claimId), demoUser.id);
    expect(verified.body).toEqual({ status: 'verified', profileId: created.body.id });
    const me = await call(t.app, 'get', api.me.path, demoUser.id);
    expect(
      me.body.profiles.filter((p: { handle: string }) => p.handle === NEW_HANDLE),
    ).toHaveLength(1);
  });

  it('un handle ya conocido no consume el cupo de ingestas', async () => {
    const t = await buildTestApp();
    const calls = Array.from({ length: ON_DEMAND_LIMIT + OVER_LIMIT }, () =>
      get(t, demoCreator.snapshot.handle, demoUser.id),
    );
    expect((await Promise.all(calls)).every((r) => r.status === STATUS.OK)).toBe(true);
  });

  it('el límite es de 10 ingestas nuevas por hora y usuario: la 11.ª da 429 RATE_LIMITED', async () => {
    const t = await buildTestApp();
    const within = await Promise.all(
      Array.from({ length: ON_DEMAND_LIMIT }, (_, n) => get(t, handleN(n), demoUser.id)),
    );
    expect(within.every((r) => r.status === STATUS.OK)).toBe(true);
    expectError(
      await get(t, handleN(ON_DEMAND_LIMIT), demoUser.id),
      STATUS.TOO_MANY,
      'RATE_LIMITED',
    );
    // el límite es por usuario: otro usuario sigue pudiendo
    expect((await get(t, handleN(ON_DEMAND_LIMIT), OTHER_USER.id)).status).toBe(STATUS.OK);
  });

  it('el cupo se libera pasada la hora', async () => {
    const t = await buildTestApp();
    await Promise.all(
      Array.from({ length: ON_DEMAND_LIMIT }, (_, n) => get(t, handleN(n), demoUser.id)),
    );
    t.advanceMinutes(MINUTES_PER_HOUR + OVER_LIMIT);
    expect((await get(t, handleN(ON_DEMAND_LIMIT), demoUser.id)).status).toBe(STATUS.OK);
  });

  it('sin sesión no se ingiere nada (401)', async () => {
    expectError(
      await get(await buildTestApp(), NEW_HANDLE, null),
      STATUS.UNAUTHORIZED,
      'UNAUTHORIZED',
    );
  });
});

describe('PATCH /profiles/:profileId/declared', () => {
  const patch = (t: TestApp, id: string, user: string | null, body?: unknown) =>
    call(t.app, 'patch', declaredPath(id), user, body);

  it('401 sin token', async () => {
    expectError(
      await patch(await buildTestApp(), demoCreator.id, null, CREATOR_DECLARED),
      STATUS.UNAUTHORIZED,
      'UNAUTHORIZED',
    );
  });

  it('403 FORBIDDEN si el perfil es de otro usuario, y no cambia nada ni publica evento', async () => {
    const t = await buildTestApp();
    const res = await patch(t, otherCreator.id, demoUser.id, {
      ...CREATOR_DECLARED,
      niches: ['gaming'],
    });
    expectError(res, STATUS.FORBIDDEN, 'FORBIDDEN');
    const after = await get(t, otherCreator.snapshot.handle, OTHER_USER.id);
    expect(after.body.declared).toEqual(otherCreator.declared);
    expect(t.events).toEqual([]);
  });

  it('403 sobre una ficha sin dueño (nadie puede editarla)', async () => {
    expectError(
      await patch(await buildTestApp(), unclaimedCreator.id, demoUser.id, CREATOR_DECLARED),
      STATUS.FORBIDDEN,
      'FORBIDDEN',
    );
  });

  it.each([UNKNOWN_UUID, 'no-es-uuid'])('404 NOT_FOUND con el profileId %s', async (id) => {
    expectError(
      await patch(await buildTestApp(), id, demoUser.id, CREATOR_DECLARED),
      STATUS.NOT_FOUND,
      'NOT_FOUND',
    );
  });

  it('200: el dueño actualiza, la respuesta cumple el esquema y se publica el evento', async () => {
    const t = await buildTestApp();
    const next = { ...CREATOR_DECLARED, niches: ['gaming', 'musica'], city: 'lima' };
    const res = await patch(t, demoCreator.id, demoUser.id, next);
    expect(res.status).toBe(STATUS.OK);
    expectMatchesContract(api.updateDeclared, res.body);
    expect(res.body.declared).toMatchObject({ niches: ['gaming', 'musica'], city: 'lima' });
    expect(t.events).toEqual([{ type: 'ProfileDeclaredDataChanged', profileId: demoCreator.id }]);
    const reread = await get(t, demoCreator.snapshot.handle, demoUser.id);
    expect(reread.body.declared).toEqual(res.body.declared);
  });

  it('200 de una marca con sus propios datos declarados', async () => {
    const res = await patch(await buildTestApp(), demoBrand.id, demoUser.id, {
      ...BRAND_DECLARED,
      budgetMinPen: 1,
    });
    expect(res.status).toBe(STATUS.OK);
    expectMatchesContract(api.updateDeclared, res.body);
  });

  it('ignora campos de más (ownerUserId, status): no hay asignación masiva', async () => {
    const t = await buildTestApp();
    const res = await patch(t, demoCreator.id, demoUser.id, {
      ...CREATOR_DECLARED,
      ownerUserId: OTHER_USER.id,
      status: 'removed',
      isOwner: false,
    });
    expect(res.status).toBe(STATUS.OK);
    expect(res.body).toMatchObject({ status: 'verified', isOwner: true });
    expect((await get(t, demoCreator.snapshot.handle, demoUser.id)).body.isOwner).toBe(true);
  });

  it('400 si el rol del cuerpo no coincide con el del perfil (marca sobre creador)', async () => {
    const t = await buildTestApp();
    expectError(
      await patch(t, demoCreator.id, demoUser.id, BRAND_DECLARED),
      STATUS.BAD_REQUEST,
      'VALIDATION_ERROR',
    );
  });

  it.each([
    ['sin cuerpo', undefined],
    ['cuerpo vacío', {}],
    ['rol inexistente', { ...CREATOR_DECLARED, role: 'admin' }],
    ['sin nichos', { ...CREATOR_DECLARED, niches: [] }],
    ['nicho fuera del catálogo', { ...CREATOR_DECLARED, niches: ['astrologia'] }],
    [
      'demasiados nichos',
      { ...CREATOR_DECLARED, niches: NICHES.slice(0, MAX_NICHES_CREATOR + OVER) },
    ],
    [
      'texto libre sobre el máximo',
      { ...CREATOR_DECLARED, shortBio: 'x'.repeat(MAX_SHORT_TEXT + OVER) },
    ],
    ['tipo de cuenta inválido', { ...CREATOR_DECLARED, accountType: 'vip' }],
    [
      'presupuesto mínimo mayor que el máximo',
      {
        ...BRAND_DECLARED,
        budgetMinPen: BRAND_DECLARED.role === 'brand' ? BRAND_DECLARED.budgetMaxPen + OVER : 0,
      },
    ],
    ['sector inexistente', { ...BRAND_DECLARED, sector: 'minería' }],
  ])('400 VALIDATION_ERROR con %s', async (_name, body) => {
    const t = await buildTestApp();
    const id =
      (body as { role?: string } | undefined)?.role === 'brand' ? demoBrand.id : demoCreator.id;
    expectError(await patch(t, id, demoUser.id, body), STATUS.BAD_REQUEST, 'VALIDATION_ERROR');
  });
});

describe('PUT /profiles/:profileId/services', () => {
  const put = (t: TestApp, id: string, user: string | null, body?: unknown) =>
    call(t.app, 'put', servicesPath(id), user, body);

  it('401 sin token', async () => {
    expectError(
      await put(await buildTestApp(), demoCreator.id, null, { services: [] }),
      STATUS.UNAUTHORIZED,
      'UNAUTHORIZED',
    );
  });

  it('403 si el perfil es de otro usuario, y su catálogo no cambia', async () => {
    const t = await buildTestApp();
    expectError(
      await put(t, otherCreator.id, demoUser.id, { services: [VALID_SERVICE] }),
      STATUS.FORBIDDEN,
      'FORBIDDEN',
    );
    const after = await get(t, otherCreator.snapshot.handle, OTHER_USER.id);
    expect(after.body.services).toEqual(otherCreator.services);
  });

  it('403 si el perfil propio es una marca (solo los creadores tienen catálogo)', async () => {
    expectError(
      await put(await buildTestApp(), demoBrand.id, demoUser.id, { services: [VALID_SERVICE] }),
      STATUS.FORBIDDEN,
      'FORBIDDEN',
    );
  });

  it('404 con un perfil inexistente', async () => {
    expectError(
      await put(await buildTestApp(), UNKNOWN_UUID, demoUser.id, { services: [] }),
      STATUS.NOT_FOUND,
      'NOT_FOUND',
    );
  });

  it('200: reemplaza el catálogo y la ficha lo refleja', async () => {
    const t = await buildTestApp();
    const res = await put(t, demoCreator.id, demoUser.id, {
      services: [VALID_SERVICE, { ...VALID_SERVICE, pricePen: 1 }],
    });
    expect(res.status).toBe(STATUS.OK);
    expectMatchesContract(api.putServices, res.body);
    expect(res.body.map((s: { description: string }) => s.description)).toEqual([
      'Reel de prueba',
      'Reel de prueba',
    ]);
    expect((await get(t, demoCreator.snapshot.handle, demoUser.id)).body.services).toEqual(
      res.body,
    );
  });

  it('los ids de las filas idénticas se conservan (las cotizaciones apuntan a ellos)', async () => {
    const t = await buildTestApp();
    const unchanged = demoCreator.services.map(({ id: _id, ...rest }) => rest);
    const same = await put(t, demoCreator.id, demoUser.id, { services: unchanged });
    expect(same.body.map((s: { id: string }) => s.id)).toEqual(
      demoCreator.services.map((s) => s.id),
    );
    const grown = await put(t, demoCreator.id, demoUser.id, {
      services: [...unchanged, VALID_SERVICE],
    });
    expect(grown.body.slice(0, unchanged.length).map((s: { id: string }) => s.id)).toEqual(
      demoCreator.services.map((s) => s.id),
    );
    expect(demoCreator.services.map((s) => s.id)).not.toContain(grown.body.at(-1).id);
  });

  it('200 con [] vacía el catálogo', async () => {
    const res = await put(await buildTestApp(), demoCreator.id, demoUser.id, { services: [] });
    expect(res.status).toBe(STATUS.OK);
    expect(res.body).toEqual([]);
  });

  it('200 en el límite exacto de servicios, 400 un servicio más', async () => {
    const t = await buildTestApp();
    const many = (n: number) => ({ services: Array.from({ length: n }, () => VALID_SERVICE) });
    expect((await put(t, demoCreator.id, demoUser.id, many(MAX_SERVICES))).status).toBe(STATUS.OK);
    expectError(
      await put(t, demoCreator.id, demoUser.id, many(MAX_SERVICES + OVER)),
      STATUS.BAD_REQUEST,
      'VALIDATION_ERROR',
    );
  });

  it.each([
    ['sin cuerpo', undefined],
    ['sin la clave services', {}],
    ['services no es arreglo', { services: 'x' }],
    ['precio negativo', { services: [{ ...VALID_SERVICE, pricePen: NEGATIVE_PRICE }] }],
    ['precio fraccionario', { services: [{ ...VALID_SERVICE, pricePen: FRACTIONAL_PRICE }] }],
    [
      'precio sobre el máximo',
      { services: [{ ...VALID_SERVICE, pricePen: MAX_PRICE_PEN + OVER }] },
    ],
    ['tipo de servicio inexistente', { services: [{ ...VALID_SERVICE, type: 'otro-tipo' }] }],
    ['formato inexistente', { services: [{ ...VALID_SERVICE, format: 'podcast' }] }],
    [
      'descripción sobre el máximo',
      { services: [{ ...VALID_SERVICE, description: 'x'.repeat(MAX_SHORT_TEXT + OVER) }] },
    ],
  ])('400 VALIDATION_ERROR con %s y el catálogo queda intacto', async (_name, body) => {
    const t = await buildTestApp();
    expectError(
      await put(t, demoCreator.id, demoUser.id, body),
      STATUS.BAD_REQUEST,
      'VALIDATION_ERROR',
    );
    expect((await get(t, demoCreator.snapshot.handle, demoUser.id)).body.services).toEqual(
      demoCreator.services,
    );
  });
});

describe('POST /profiles/:handle/removal-requests (público, Ley 29733)', () => {
  const remove = (t: TestApp, handle: string, body?: unknown, user: string | null = null) =>
    call(t.app, 'post', removalPath(handle), user, body);

  it('200 sin token y cumple el esquema', async () => {
    const res = await remove(await buildTestApp(), otherCreator.snapshot.handle, { email: EMAIL });
    expect(res.status).toBe(STATUS.OK);
    expectMatchesContract(api.requestRemoval, res.body);
    expect(res.body).toEqual({ ok: true });
  });

  it('no revela la existencia: mismo estado y mismo cuerpo exista o no el handle', async () => {
    const t = await buildTestApp();
    const existing = await remove(t, otherCreator.snapshot.handle, {
      email: EMAIL,
      reason: 'privacidad',
    });
    const missing = await remove(t, 'cuenta.que.no.existe', { email: EMAIL, reason: 'privacidad' });
    expect(missing.status).toBe(existing.status);
    expect(missing.body).toEqual(existing.body);
    expect(missing.headers['content-length']).toBe(existing.headers['content-length']);
  });

  it('el dueño verificado retira su ficha: desaparece, no se edita y no se puede reclamar de nuevo', async () => {
    const t = await buildTestApp();
    const handle = demoCreator.snapshot.handle;
    await remove(t, handle, { email: demoUser.email }, demoUser.id);
    expectError(await get(t, handle, demoUser.id), STATUS.NOT_FOUND, 'NOT_FOUND');
    const me = await call(t.app, 'get', api.me.path, demoUser.id);
    expect(me.body.profiles.map((p: { id: string }) => p.id)).not.toContain(demoCreator.id);
    expectError(
      await call(t.app, 'patch', declaredPath(demoCreator.id), demoUser.id, CREATOR_DECLARED),
      STATUS.NOT_FOUND,
      'NOT_FOUND',
    );
    const claim = await call(t.app, 'post', claimsPath, OTHER_USER.id, { handle, role: 'creator' });
    const verified = await call(t.app, 'post', verifyPath(claim.body.claimId), OTHER_USER.id);
    expect(verified.body).toEqual({ status: 'not_eligible', reason: 'removed' });
  });

  it.each([
    ['sin cuerpo', undefined],
    ['sin correo', {}],
    ['correo inválido', { email: 'no-es-correo' }],
    ['correo numérico', { email: true }],
    ['motivo sobre el máximo', { email: EMAIL, reason: 'x'.repeat(MAX_REASON_LENGTH + OVER) }],
  ])('400 VALIDATION_ERROR con %s, y no se excluye nada', async (_name, body) => {
    const t = await buildTestApp();
    expectError(
      await remove(t, otherCreator.snapshot.handle, body),
      STATUS.BAD_REQUEST,
      'VALIDATION_ERROR',
    );
    expect((await get(t, otherCreator.snapshot.handle, demoUser.id)).status).toBe(STATUS.OK);
  });

  it('A-1: un anónimo no retira nada: la ficha sigue visible y la respuesta es la misma', async () => {
    const t = await buildTestApp();
    const handle = otherCreator.snapshot.handle;
    const anon = await remove(t, handle, { email: 'cualquiera@atacante.pe' });
    const stranger = await remove(t, handle, { email: 'otro@atacante.pe' }, demoUser.id);
    const owner = await remove(t, 'cuenta.que.no.existe', { email: EMAIL }, OTHER_USER.id);
    expect([anon.status, stranger.status, owner.status]).toEqual([STATUS.OK, STATUS.OK, STATUS.OK]);
    expect([stranger.body, owner.body]).toEqual([anon.body, anon.body]);
    expect((await get(t, handle, OTHER_USER.id)).status).toBe(STATUS.OK);
    expect((await get(t, handle, demoUser.id)).body.status).toBe('verified');
  });

  it('A-1: un usuario autenticado que no es el dueño tampoco retira la ficha de otro', async () => {
    const t = await buildTestApp();
    await remove(t, demoCreator.snapshot.handle, { email: OTHER_USER.email }, OTHER_USER.id);
    expect((await get(t, demoCreator.snapshot.handle, demoUser.id)).status).toBe(STATUS.OK);
  });

  it('A-1: el dueño de un perfil no puede retirar con su sesión el perfil de otro', async () => {
    const t = await buildTestApp();
    await remove(t, demoBrand.snapshot.handle, { email: OTHER_USER.email }, OTHER_USER.id);
    expect((await get(t, demoBrand.snapshot.handle, demoUser.id)).body.isOwner).toBe(true);
  });

  it('M-3: el dueño que escribe el handle en mayúsculas también retira la ficha', async () => {
    const t = await buildTestApp();
    await remove(
      t,
      demoCreator.snapshot.handle.toUpperCase(),
      { email: demoUser.email },
      demoUser.id,
    );
    expectError(
      await get(t, demoCreator.snapshot.handle, demoUser.id),
      STATUS.NOT_FOUND,
      'NOT_FOUND',
    );
  });

  it('M-5: más de 20 pedidos de exclusión por hora desde la misma IP dan 429', async () => {
    const t = await buildTestApp();
    const burst = await Promise.all(
      Array.from({ length: REMOVAL_LIMIT_PER_HOUR + OVER }, () =>
        remove(t, 'no.existe.zz', { email: EMAIL }),
      ),
    );
    expect(burst.filter((r) => r.status === STATUS.OK)).toHaveLength(REMOVAL_LIMIT_PER_HOUR);
    expectError(
      burst.find((r) => r.status === STATUS.TOO_MANY)!,
      STATUS.TOO_MANY,
      'RATE_LIMITED',
    );
  });
});

describe('datos sembrados', () => {
  it('los fixtures usados por estos tests existen (si cambian, los casos se rompen aquí y no en silencio)', () => {
    expect(
      fixtureProfiles
        .filter((p) => p.ownerUserId === demoUser.id)
        .map((p) => p.role)
        .sort(),
    ).toEqual(['brand', 'creator']);
    expect(demoCreator.services.length).toBeGreaterThan(0);
    expect(otherCreator.declared).not.toBeNull();
  });
});
