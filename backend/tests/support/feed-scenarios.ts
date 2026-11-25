import { describe, expect, it } from 'vitest';
import { api, CITIES, MAX_SEARCH_QUERY, type ProfileCard } from '@sponcer/contracts';
import { demoUser, fixtureProfiles, fixtureSocial } from '@sponcer/contracts/fixtures';
import { call, demoBrand, expectError, STATUS } from './app';

/**
 * Escenarios de búsqueda `q` y filtro `city` del feed (F5), escritos una sola vez y ejecutados contra el mock y
 * contra los adaptadores reales de profiles (mock = real). Parten de los fixtures, que también son el seed de la BD.
 */
export interface FeedWorld {
  app: Parameters<typeof call>[0];
  /**
   * `true` si el mundo solo contiene los fixtures (mock): se exige igualdad exacta. En la BD compartida pueden existir
   * filas ajenas transitorias de otros tests; ahí se exige que estén todos los esperados y que todo lo devuelto cumpla.
   */
  exact: boolean;
}

const MAX_PAGE = 50;
// Marcas diacríticas combinantes tras normalizar a NFD (la tilde suelta de "e" + U+0301); no coincide con "e".
// Probar: https://regex101.com/?regex=%5B%5Cu0300-%5Cu036f%5D&flags=g&testString=cafe&flavor=javascript
const DIACRITICS = /[̀-ͯ]/g;
const fold = (s: string): string => s.normalize('NFD').replace(DIACRITICS, '').toLowerCase();

/** Creadores que el feed de la marca del demo puede mostrar: de otros dueños y sin interacción previa. */
const interacted = new Set(
  fixtureSocial.interactions
    .filter((i) => i.actorProfileId === demoBrand.id)
    .map((i) => i.targetProfileId),
);
const visibleCreators = fixtureProfiles.filter(
  (p) => p.role === 'creator' && p.ownerUserId !== demoUser.id && !interacted.has(p.id),
);

const feed = (world: FeedWorld, query: string) =>
  call(
    world.app,
    'get',
    `${api.feed.path}?profileId=${demoBrand.id}&limit=${MAX_PAGE}${query}`,
    demoUser.id,
  );
const cardsOf = (res: { body: { items: Array<{ card: ProfileCard }> } }): ProfileCard[] =>
  res.body.items.map((i) => i.card);
const idsOf = (res: { body: { items: Array<{ card: ProfileCard }> } }): string[] =>
  cardsOf(res)
    .map((c) => c.id)
    .sort();
const haystack = (c: ProfileCard): string[] => [
  c.fullName,
  c.handle,
  c.bio ?? '',
  ...c.niches.map((n) => n.replaceAll('-', ' ')),
];
const matches = (c: ProfileCard, q: string): boolean =>
  haystack(c).some((f) => fold(f).includes(fold(q.trim())));

/** En serie: la BD es compartida y cada feed hace varias consultas; en paralelo se cuelga bajo carga. */
const series = <T, R>(xs: T[], fn: (x: T) => Promise<R>): Promise<R[]> =>
  xs.reduce<Promise<R[]>>(async (acc, x) => [...(await acc), await fn(x)], Promise.resolve([]));

const expectSet = (w: FeedWorld, got: string[], expected: string[]) =>
  w.exact ? expect(got).toEqual(expected) : expect(got).toEqual(expect.arrayContaining(expected));

export function describeFeedSearch(
  label: string,
  world: () => Promise<FeedWorld> | FeedWorld,
): void {
  describe(`feed · búsqueda q y ciudad · ${label}`, () => {
    describe('city', () => {
      const CITY_WITH_CREATORS = [
        ...new Set(
          visibleCreators
            .map((c) => c.declared?.city)
            .filter((c): c is NonNullable<typeof c> => !!c),
        ),
      ];

      it.each(CITY_WITH_CREATORS)(
        'city=%s devuelve exactamente a los creadores de esa ciudad',
        async (city) => {
          const w = await world();
          const res = await feed(w, `&city=${city}`);
          expect(res.status, JSON.stringify(res.body)).toBe(STATUS.OK);
          const expected = visibleCreators
            .filter((c) => c.declared?.city === city)
            .map((c) => c.id)
            .sort();
          expectSet(w, idsOf(res), expected);
          expect(cardsOf(res).every((c) => c.city === city)).toBe(true);
        },
      );

      it('una ciudad del catálogo sin creadores da una lista vacía', async () => {
        const empty = CITIES.find((c) => !CITY_WITH_CREATORS.includes(c as never))!;
        const w = await world();
        const res = await feed(w, `&city=${empty}`);
        expect(cardsOf(res).every((c) => c.city === empty)).toBe(true);
        if (w.exact) expect(res.body).toEqual({ items: [], nextCursor: null });
      });

      it.each(['Lima', 'atlantis', ''])('city inválida (%j) es 400', async (city) => {
        expectError(
          await feed(await world(), `&city=${city}`),
          STATUS.BAD_REQUEST,
          'VALIDATION_ERROR',
        );
      });
    });

    describe('q', () => {
      it('sin q devuelve a todos los creadores visibles', async () => {
        const w = await world();
        expectSet(w, idsOf(await feed(w, '')), visibleCreators.map((c) => c.id).sort());
      });

      it('no distingue mayúsculas ni tildes: Joaquín, JOAQUÍN, joaquin y JOAQUIN dan lo mismo', async () => {
        const w = await world();
        const variants = ['Joaquín', 'JOAQUÍN', 'joaquin', 'JOAQUIN', ' joaquin '];
        const results = await series(variants, (q) => feed(w, `&q=${encodeURIComponent(q)}`));
        const joaquin = fixtureProfiles.find((p) => p.snapshot.handle === 'joaquin.gaming.demo')!;
        results.forEach((r) => expect(idsOf(r)).toContain(joaquin.id));
        expect(new Set(results.map((r) => JSON.stringify(idsOf(r)))).size).toBe(1);
      });

      it('busca en el handle, en el nombre y en los nichos', async () => {
        const w = await world();
        const ids = async (q: string) => idsOf(await feed(w, `&q=${encodeURIComponent(q)}`));
        const byHandle = fixtureProfiles.find((p) => p.snapshot.handle === 'joaquin.gaming.demo')!;
        const byName = fixtureProfiles.find((p) => p.snapshot.handle === 'mateo.deportes.demo')!;
        expect(await ids('gaming.demo')).toContain(byHandle.id);
        expect(await ids('Mateo')).toContain(byName.id);
        const niche = cardsOf(await feed(w, '')).find((c) => c.niches.length > 0)!;
        expect(await ids(niche.niches[0]!.replaceAll('-', ' '))).toContain(niche.id);
      });

      it.each(['moda', 'maratón', 'MARATON', 'deportes', 'Trujillo', 'demo'])(
        'q=%s: todo lo devuelto contiene el texto (oráculo independiente) y no se omite nada que lo contenga',
        async (q) => {
          const res = await feed(await world(), `&q=${encodeURIComponent(q)}`);
          expect(res.status).toBe(STATUS.OK);
          expect(cardsOf(res).every((c) => matches(c, q))).toBe(true);
          const all = await feed(await world(), '');
          const expected = cardsOf(all)
            .filter((c) => matches(c, q))
            .map((c) => c.id)
            .sort();
          expect(idsOf(res)).toEqual(expected);
        },
      );

      it('un texto sin coincidencias da una lista vacía', async () => {
        expect((await feed(await world(), '&q=zzzqqqxxx')).body).toEqual({
          items: [],
          nextCursor: null,
        });
      });

      it('q y city se combinan como intersección', async () => {
        const w = await world();
        const [byQ, byCity, both] = (await series(
          ['&q=demo', '&city=trujillo', '&q=demo&city=trujillo'],
          (query) => feed(w, query),
        )) as [
          Awaited<ReturnType<typeof feed>>,
          Awaited<ReturnType<typeof feed>>,
          Awaited<ReturnType<typeof feed>>,
        ];
        const inBoth = idsOf(byQ).filter((id) => idsOf(byCity).includes(id));
        expect(idsOf(both)).toEqual(inBoth);
      });

      it('caracteres especiales no rompen la búsqueda ni se interpretan (SQL, regex, comodines)', async () => {
        const w = await world();
        const hostile = ["' OR 1=1 --", '%', '_', '.*', '(', '[a-z]+', '\\', '<script>'];
        const results = await series(hostile, (q) => feed(w, `&q=${encodeURIComponent(q)}`));
        results.forEach((r) => expect(r.status).toBe(STATUS.OK));
        expect(cardsOf(results[0]!)).toEqual([]);
      });

      it.each([
        ['solo espacios', '%20%20'],
        ['más largo que el máximo', 'x'.repeat(MAX_SEARCH_QUERY + 1)],
      ])('q inválida (%s) es 400', async (_name, q) => {
        expectError(await feed(await world(), `&q=${q}`), STATUS.BAD_REQUEST, 'VALIDATION_ERROR');
      });
    });
  });
}
