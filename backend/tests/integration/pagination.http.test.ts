import { describe, expect, it } from 'vitest';
import { api } from '@sponcer/contracts';
import { decodeCursor, encodeCursor } from '../../src/shared/cursor';
import { demoUser, fixtureProfiles, fixtureSocial } from '@sponcer/contracts/fixtures';
import {
  buildTestApp,
  call,
  demoBrand,
  demoCreator,
  expectError,
  expectMatchesContract,
  otherCreator,
  STATUS,
  type TestApp,
} from '../support/app';

/**
 * Paginación por cursor de `GET /matches` y `GET /quotes` (F5): recorrer las páginas devuelve exactamente la lista
 * completa, sin repetir ni perder; el último `nextCursor` es null. Un cursor corrupto es 400 en todos los listados.
 */
const PAGE = 2;
const MAX_PAGE = 50;
const OVER = 1;
const MIN_ITEMS = 4;
const FAR_OFFSET = 9999;

const idsOf = (body: { items: Array<{ id: string }> }) => body.items.map((i) => i.id);

/** Brand fixtures de otros usuarios (con quienes `sofi` puede hacer match). */
const foreignBrands = fixtureProfiles.filter(
  (p) => p.role === 'brand' && p.ownerUserId !== demoUser.id,
);
/** Creadores de otros usuarios con servicios (a quienes la marca del demo puede cotizar). */
const foreignCreatorsWithServices = fixtureProfiles.filter(
  (p) =>
    p.role === 'creator' && p.ownerUserId && p.ownerUserId !== demoUser.id && p.services.length > 0,
);

async function makeMatches(t: TestApp) {
  await Promise.all(
    foreignBrands.map(async (brand) => {
      await call(t.app, 'post', api.interact.path, demoUser.id, {
        actorProfileId: demoCreator.id,
        targetProfileId: brand.id,
        kind: 'interest',
      });
      await call(t.app, 'post', api.interact.path, brand.ownerUserId, {
        actorProfileId: brand.id,
        targetProfileId: demoCreator.id,
        kind: 'interest',
      });
    }),
  );
}

async function makeQuotes(t: TestApp) {
  await Promise.all(
    foreignCreatorsWithServices.map((creator) =>
      call(t.app, 'post', api.createQuote.path, demoUser.id, {
        requesterProfileId: demoBrand.id,
        serviceId: creator.services[0]!.id,
        message: 'Hola, me interesa tu servicio',
      }),
    ),
  );
}

type Fetch = (t: TestApp, query: string) => ReturnType<typeof call>;
const fetchMatches: Fetch = (t, q) =>
  call(t.app, 'get', `${api.matches.path}?profileId=${demoCreator.id}${q}`, demoUser.id);
const fetchQuotes: Fetch = (t, q) =>
  call(t.app, 'get', `${api.listQuotes.path}?profileId=${demoBrand.id}${q}`, demoUser.id);

/** Recorre todas las páginas con `limit` y devuelve cada página (recursivo: sin bucles). */
const walk = async (
  t: TestApp,
  fetch: Fetch,
  limit: number,
  cursor: string | null = null,
  acc: Array<{ items: string[] }> = [],
): Promise<Array<{ items: string[] }>> => {
  const res = await fetch(t, `&limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`);
  expect(res.status, JSON.stringify(res.body)).toBe(STATUS.OK);
  const next = [...acc, { items: idsOf(res.body) }];
  return res.body.nextCursor === null || next.length > MAX_PAGE
    ? next
    : walk(t, fetch, limit, res.body.nextCursor, next);
};

describe.each([
  ['GET /matches', fetchMatches, makeMatches, api.matches],
  ['GET /quotes', fetchQuotes, makeQuotes, api.listQuotes],
] as const)('%s · paginación', (_name, fetch, seed, endpoint) => {
  it('recorrer las páginas devuelve la lista completa, sin repetir ni perder, y la última no tiene cursor', async () => {
    const t = await buildTestApp();
    await seed(t);
    const full = await fetch(t, `&limit=${MAX_PAGE}`);
    expect(endpoint.response.safeParse(full.body).success).toBe(true);
    expect(full.body.items.length).toBeGreaterThanOrEqual(MIN_ITEMS);
    expect(full.body.nextCursor).toBeNull();
    const pages = await walk(t, fetch, PAGE);
    expect(pages.flatMap((p) => p.items)).toEqual(idsOf(full.body));
    expect(pages).toHaveLength(Math.ceil(full.body.items.length / PAGE));
    expect(pages.slice(0, -1).every((p) => p.items.length === PAGE)).toBe(true);
  });

  it('con limit igual al total no hay página siguiente; con uno menos sí', async () => {
    const t = await buildTestApp();
    await seed(t);
    const total = (await fetch(t, `&limit=${MAX_PAGE}`)).body.items.length;
    expect((await fetch(t, `&limit=${total}`)).body.nextCursor).toBeNull();
    expect((await fetch(t, `&limit=${total - OVER}`)).body.nextCursor).not.toBeNull();
  });

  it('un cursor válido más allá del final devuelve una página vacía sin cursor', async () => {
    const t = await buildTestApp();
    await seed(t);
    const res = await fetch(t, `&cursor=${encodeCursor(FAR_OFFSET)}`);
    expect(res.status).toBe(STATUS.OK);
    expect(res.body).toEqual({ items: [], nextCursor: null });
  });

  it.each([0, MAX_PAGE + OVER, -OVER])('limit %i es 400', async (limit) => {
    const t = await buildTestApp();
    expectError(await fetch(t, `&limit=${limit}`), STATUS.BAD_REQUEST, 'VALIDATION_ERROR');
  });

  it('pedir la lista de un perfil ajeno es 403 aunque el cursor sea válido', async () => {
    const t = await buildTestApp();
    const path = `${endpoint.path}?profileId=${otherCreator.id}&limit=${PAGE}`;
    expectError(await call(t.app, 'get', path, demoUser.id), STATUS.FORBIDDEN, 'FORBIDDEN');
  });
});

/** Cursores que NO son el `encodeCursor` de un entero >= 0: ninguno puede leerse como "primera página". */
const BAD_BASE64 = ['abc', '-5', '1.5x', '%%%', '1', '9999', '', ' ', 'no-es-base64-ni-numero'];
const BAD_PAYLOADS = [
  '-1',
  '1.5',
  'abc',
  ' 1',
  '1 ',
  '0x10',
  '1e3',
  '+1',
  '99999999999999999999',
  '',
].map((text) => Buffer.from(text).toString('base64url'));
const PADDED = `${encodeCursor(1)}==`;
const CORRUPT_CURSORS = [
  ...BAD_BASE64,
  ...BAD_PAYLOADS,
  PADDED,
  encodeCursor(1).toUpperCase() + '!',
];

describe('shared/cursor · contrato del cursor', () => {
  it('ida y vuelta: decodeCursor(encodeCursor(n)) = n para enteros >= 0; sin cursor es 0', () => {
    [0, 1, PAGE, MAX_PAGE, FAR_OFFSET].forEach((n) => {
      const r = decodeCursor(encodeCursor(n));
      expect(r.ok && r.value).toBe(n);
    });
    const first = decodeCursor(undefined);
    expect(first.ok && first.value).toBe(0);
  });

  it.each(CORRUPT_CURSORS)('un cursor corrupto (%j) no se decodifica', (cursor) => {
    const r = decodeCursor(cursor);
    expect(!r.ok && r.error.code).toBe('VALIDATION_ERROR');
  });
});

/** Endpoints paginados: un cursor corrupto es 400 en TODOS (nunca la primera página), y uno válido se acepta. */
const fetchers: Array<[string, (t: TestApp, cursor: string) => ReturnType<typeof call>]> = [
  ['GET /matches', (t, c) => fetchMatches(t, `&cursor=${c}`)],
  ['GET /quotes', (t, c) => fetchQuotes(t, `&cursor=${c}`)],
  [
    'GET /feed',
    (t, c) =>
      call(t.app, 'get', `${api.feed.path}?profileId=${demoBrand.id}&cursor=${c}`, demoUser.id),
  ],
  [
    'GET /notifications',
    (t, c) => call(t.app, 'get', `${api.notifications.path}?cursor=${c}`, demoUser.id),
  ],
  [
    'GET /matches/:matchId/messages',
    (t, c) =>
      call(
        t.app,
        'get',
        `${api.listMessages.path.replace(':matchId', fixtureSocial.matches[0]!.id)}?cursor=${c}`,
        demoUser.id,
      ),
  ],
  [
    'GET /admin/removal-requests',
    (t, c) => call(t.app, 'get', `${api.adminListRemovals.path}?cursor=${c}`, demoUser.id),
  ],
];

describe.each(fetchers)('%s · cursor', (_name, fetchWith) => {
  const app = () => buildTestApp(undefined, { ADMIN_EMAILS: demoUser.email });

  it.each(CORRUPT_CURSORS)(
    'el cursor corrupto %j es 400 VALIDATION_ERROR, no la primera página',
    async (cursor) => {
      const t = await app();
      await Promise.all([makeMatches(t), makeQuotes(t)]);
      expectError(
        await fetchWith(t, encodeURIComponent(cursor)),
        STATUS.BAD_REQUEST,
        'VALIDATION_ERROR',
      );
    },
  );

  it('un cursor válido (encodeCursor) se acepta, también el 0 y uno más allá del final', async () => {
    const t = await app();
    const [zero, far] = await Promise.all([
      fetchWith(t, encodeCursor(0)),
      fetchWith(t, encodeCursor(FAR_OFFSET)),
    ]);
    expect([zero.status, far.status]).toEqual([STATUS.OK, STATUS.OK]);
    expect(far.body.items).toEqual([]);
    expect(far.body.nextCursor).toBeNull();
  });
});

describe('cursores y seguridad', () => {
  // F5-L-2 (corregido): quotes devuelve exactamente ProfileSummary en creator y requester.
  it('la respuesta de GET /quotes no trae campos fuera del contrato', async () => {
    const t = await buildTestApp();
    await makeQuotes(t);
    expectMatchesContract(api.listQuotes, (await fetchQuotes(t, '&limit=50')).body);
  });

  it('el cursor de un listado no sirve en otro perfil: se limita al propio y no filtra datos ajenos', async () => {
    const t = await buildTestApp();
    await makeMatches(t);
    const first = await fetchMatches(t, `&limit=${PAGE}`);
    const path = `${api.matches.path}?profileId=${otherCreator.id}&cursor=${first.body.nextCursor}`;
    expectError(await call(t.app, 'get', path, demoUser.id), STATUS.FORBIDDEN, 'FORBIDDEN');
  });
});
