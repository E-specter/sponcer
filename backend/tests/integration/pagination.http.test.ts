import { describe, expect, it } from 'vitest';
import { api } from '@sponcer/contracts';
import { demoUser, fixtureProfiles } from '@sponcer/contracts/fixtures';
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
 * completa, sin repetir ni perder; el último `nextCursor` es null; un cursor corrupto no puede reiniciar la lista.
 */
const PAGE = 2;
const MAX_PAGE = 50;
const OVER = 1;
const MIN_ITEMS = 4;
const FAR_OFFSET_CURSOR = Buffer.from('9999').toString('base64url');
const CORRUPT_CURSORS = [
  'no-es-base64-ni-numero',
  Buffer.from('-1').toString('base64url'),
  Buffer.from('1.5').toString('base64url'),
  Buffer.from('abc').toString('base64url'),
];

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
    const cursor = endpoint === api.matches ? FAR_OFFSET_CURSOR : '9999';
    const res = await fetch(t, `&cursor=${cursor}`);
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

describe('cursor corrupto', () => {
  it.each(CORRUPT_CURSORS)(
    'GET /matches con el cursor %s es 400 (no reinicia la lista)',
    async (cursor) => {
      const t = await buildTestApp();
      await makeMatches(t);
      expectError(
        await fetchMatches(t, `&cursor=${cursor}`),
        STATUS.BAD_REQUEST,
        'VALIDATION_ERROR',
      );
    },
  );

  // F5-L-1: quotes (y el panel de admin) usan `parseInt` y tratan un cursor corrupto como "primera página": un
  // cliente con un cursor roto recorre la lista en bucle. matches responde 400; deberían ser coherentes.
  it.fails.each(['abc', '-5', '1.5x', '%%%'])(
    'F5-L-1: GET /quotes con el cursor corrupto %s es 400, no la primera página',
    async (cursor) => {
      const t = await buildTestApp();
      await makeQuotes(t);
      expectError(
        await fetchQuotes(t, `&cursor=${cursor}`),
        STATUS.BAD_REQUEST,
        'VALIDATION_ERROR',
      );
    },
  );

  // F5-L-1 (bis): `decodeCursor` usa Number(texto): un cursor que decodifica a "" (p. ej. '%%%') da 0 y se acepta como
  // primera página en vez de rechazarse.
  it.fails('F5-L-1: GET /matches con un cursor que decodifica a vacío (%%%) es 400', async () => {
    const t = await buildTestApp();
    await makeMatches(t);
    expectError(await fetchMatches(t, '&cursor=%%%'), STATUS.BAD_REQUEST, 'VALIDATION_ERROR');
  });

  // F5-L-2: `toQuoteView` devuelve la ProfileCard completa donde el contrato dice ProfileSummary (creator, requester):
  // fuera de producción llegan campos de más (nichos, seguidores, engagement, presupuesto, bio...). En producción
  // register-endpoint envía lo parseado, así que el exceso queda recortado, pero el adaptador no debería producirlo.
  it.fails('F5-L-2: la respuesta de GET /quotes no trae campos fuera del contrato', async () => {
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
