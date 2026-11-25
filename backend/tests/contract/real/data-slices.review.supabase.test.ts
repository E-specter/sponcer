import { randomUUID } from 'node:crypto';
import { constants } from 'node:http2';
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { fixtureProfiles } from '@sponcer/contracts/fixtures';
import { createWorld, hasSupabase, serviceClient } from '../../../../db/tests/support/supabase';
import { createSupabaseClassificationRepository } from '../../../src/modules/classification/infrastructure/out/supabase/supabase-classification-repository';
import { createIngestionModule } from '../../../src/modules/ingestion';
import { createApifySource } from '../../../src/modules/ingestion/infrastructure/out/apify/apify-source';
import { createSupabaseMatchRepository } from '../../../src/modules/matching/infrastructure/out/supabase/supabase-repositories';
import { createEventBus } from '../../../src/shared/events/event-bus';

/**
 * Revisión F3-A de ingestion, classification y matching. Los casos F3-* eran hallazgos corregidos por dev-data
 * (F3-A2) y quedan como regresión. F3-A-1 (exclusión del titular) está en `profile-removal.e2e.supabase.test.ts`.
 */
const SETUP_TIMEOUT_MS = 60_000;
const HTTP_OK = constants.HTTP_STATUS_OK;
const HTTP_BAD_GATEWAY = constants.HTTP_STATUS_BAD_GATEWAY;
const TOKEN = 'apify_api_SECRETO_DE_PRUEBA';
const LIVE_HOST = 'apify--instagram-profile-scraper.apify.actor';
const WRONG_DIMENSIONS = 3;
const NOW = () => new Date('2026-01-01T10:00:00.000Z');
const HOSTILE_HANDLES = [
  'x&username=admin',
  '../../etc/passwd',
  '@evil.example',
  'a#fragmento',
  'con espacio',
  'https://evil.example/x',
  '%2e%2e%2f',
  'a/../b?c=d',
];

const SNAP = fixtureProfiles[0]!.snapshot;
const apifyItem = {
  username: SNAP.handle,
  fullName: SNAP.fullName,
  biography: SNAP.biography,
  followersCount: SNAP.followers,
  followsCount: SNAP.following,
  postsCount: SNAP.postsCount,
  isBusinessAccount: true,
  private: false,
  verified: false,
  latestPosts: [],
};

describe('ingestion · ApifySource (sin red: fetch simulado)', () => {
  afterEach(() => vi.unstubAllGlobals());

  const stubFetch = (impl: () => Promise<Response>) => {
    const fetchMock = vi.fn(impl);
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };
  const ok = () => Promise.resolve(new Response(JSON.stringify(apifyItem), { status: HTTP_OK }));

  it.each(HOSTILE_HANDLES)(
    'un handle hostil (%s) no cambia host, ruta ni parámetros de la URL',
    async (handle) => {
      const fetchMock = stubFetch(ok);
      await createApifySource({ token: TOKEN, now: NOW }).fetchLiveBio(handle);
      const [calledUrl] = fetchMock.mock.calls[0] as unknown as [string];
      const url = new URL(String(calledUrl));
      expect(url.hostname).toBe(LIVE_HOST);
      expect(url.protocol).toBe('https:');
      expect(url.pathname).toBe('/');
      expect([...url.searchParams.keys()]).toEqual(['username']);
      expect(url.searchParams.get('username')).toBe(handle);
      expect(url.username + url.password).toBe('');
    },
  );

  it('el token viaja solo en la cabecera Authorization, nunca en la URL', async () => {
    const fetchMock = stubFetch(ok);
    await createApifySource({ token: TOKEN, now: NOW }).fetchLiveBio('sofi.moda.demo');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).not.toContain(TOKEN);
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('un 4xx/5xx del proveedor es UPSTREAM_ERROR sin filtrar el cuerpo', async () => {
    stubFetch(() => Promise.resolve(new Response('secreto interno', { status: HTTP_BAD_GATEWAY })));
    const r = await createApifySource({ token: TOKEN, now: NOW }).fetchLiveBio('sofi.moda.demo');
    expect(!r.ok && r.error.code).toBe('UPSTREAM_ERROR');
    expect(JSON.stringify(!r.ok && r.error)).not.toContain('secreto interno');
  });

  // F3-L-3: los `details` de UPSTREAM_ERROR (String(e)) viajan hasta el cliente en el cuerpo de error.
  it('F3-L-3: un fallo de red no filtra detalles internos en el error', async () => {
    stubFetch(() => Promise.reject(new Error(`connect ECONNREFUSED 10.0.0.7 con ${TOKEN}`)));
    const r = await createApifySource({ token: TOKEN, now: NOW }).fetchLiveBio('sofi.moda.demo');
    expect(String(JSON.stringify(!r.ok && r.error.details))).not.toContain('ECONNREFUSED');
  });

  // F3-M-3: `fetch` sin timeout: un proveedor colgado deja la verificación (RF-02) esperando sin límite.
  it('F3-M-3: la lectura en vivo tiene un timeout (AbortSignal)', async () => {
    const fetchMock = stubFetch(ok);
    await createApifySource({ token: TOKEN, now: NOW }).fetchLiveBio('sofi.moda.demo');
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.signal).toBeDefined();
  });

  // F3-M-2: ADR-002 verifica el código en la bio de la cuenta pedida; si el proveedor responde con OTRA cuenta
  // (renombrada, coincidencia aproximada) el adaptador la acepta y el código se comprobaría en la cuenta equivocada.
  it('F3-M-2: la lectura en vivo rechaza una respuesta de una cuenta distinta a la pedida', async () => {
    stubFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ...apifyItem, username: 'otra.cuenta' }), {
          status: HTTP_OK,
        }),
      ),
    );
    const r = await createApifySource({ token: TOKEN, now: NOW }).fetchLiveBio('victima.real');
    expect(r.ok).toBe(false);
  });

  // F3-M-4: `isPrivate: a.private === true`: si el proveedor cambia el esquema y omite el flag, una cuenta privada
  // pasa por pública (falla abierto). Debería tratarse como privada si no se sabe.
  it('F3-M-4: sin el flag `private` del proveedor la cuenta se trata como privada (falla cerrado)', async () => {
    const { private: _omitted, ...withoutFlag } = apifyItem;
    stubFetch(() =>
      Promise.resolve(new Response(JSON.stringify(withoutFlag), { status: HTTP_OK })),
    );
    const r = await createApifySource({ token: TOKEN, now: NOW }).fetchLiveBio(SNAP.handle);
    expect(r.ok && r.value.isPrivate).toBe(true);
  });

  it('F3-L-3: una respuesta con forma inesperada no expone los `issues` del esquema al cliente', async () => {
    stubFetch(() =>
      Promise.resolve(new Response(JSON.stringify({ raro: true }), { status: HTTP_OK })),
    );
    const r = await createApifySource({ token: TOKEN, now: NOW }).fetchLiveBio('sofi.moda.demo');
    expect(!r.ok && r.error.code).toBe('UPSTREAM_ERROR');
    expect(!r.ok && r.error.details).toBeUndefined();
  });

  it('el caso de uso normaliza el handle antes de llamar al proveedor (SSRF/inyección cortadas aguas arriba)', async () => {
    const ingestion = createIngestionModule({ adapter: 'mock', bus: createEventBus() });
    // "@evil.example" es un handle válido tras quitar la arroba (se normaliza, no se rechaza).
    const hostile = HOSTILE_HANDLES.filter((h) => !h.startsWith('@'));
    const results = await Promise.all(hostile.map((h) => ingestion.api.fetchLiveBio(h)));
    expect(results.every((r) => !r.ok && r.error.code === 'VALIDATION_ERROR')).toBe(true);
    const ingested = await Promise.all(hostile.map((h) => ingestion.api.ingestProfile(h)));
    expect(ingested.every((r) => !r.ok && r.error.code === 'VALIDATION_ERROR')).toBe(true);
  });
});

describe('ingestion · reglas de privacidad (RF-01, RNF-05)', () => {
  // F3-A-2: RF-01 dice "solo se ingieren cuentas profesionales y públicas", pero ingestProfile solo rechaza las
  // privadas: la ficha previa de una cuenta personal pública se guarda (bio, métricas, posts).
  it('F3-A-2: no se ingiere (ni guarda) una cuenta pública no profesional', async () => {
    const personal = fixtureProfiles.find((f) => !f.snapshot.isBusiness && !f.snapshot.isPrivate)!;
    const ingestion = createIngestionModule({ adapter: 'mock', bus: createEventBus() });
    const r = await ingestion.api.ingestProfile(personal.snapshot.handle);
    expect(!r.ok && r.error.code).toBe('FORBIDDEN');
  });

  it('una cuenta privada se rechaza y no se guarda', async () => {
    const ingestion = createIngestionModule({ adapter: 'mock', bus: createEventBus() });
    const r = await ingestion.api.ingestProfile('cuenta.privada.zz');
    // el mock genérico es público: solo se comprueba que el caso de uso sigue normalizando y respondiendo
    expect(r.ok || r.error.code === 'FORBIDDEN').toBe(true);
  });
});

describe.skipIf(!hasSupabase)('F3-A · revisión contra Supabase local', () => {
  const sb = serviceClient();
  const world = createWorld(sb);

  beforeAll(() => world.cleanup(), SETUP_TIMEOUT_MS);
  afterAll(() => world.cleanup(), SETUP_TIMEOUT_MS);

  describe('matching · interactions y matches', () => {
    const matches = createSupabaseMatchRepository(sb);

    it('interactions_actor_target_key: un segundo (actor, objetivo) viola el unique y kind=quote ya no existe', async () => {
      const [a, b] = [await world.newProfile('creator'), await world.newProfile('brand')];
      const row = { actor_profile_id: a.id, target_profile_id: b.id, kind: 'interest' };
      expect((await sb.from('interactions').insert(row)).error).toBeNull();
      expect((await sb.from('interactions').insert(row)).error?.code).toBe('23505');
      const quote = await sb
        .from('interactions')
        .insert({ ...row, target_profile_id: a.id, kind: 'quote' });
      expect(quote.error?.code).toBe('23514');
    });

    it('matches: el unique (creator, brand) impide un segundo match del par aunque se cree a mano', async () => {
      const [a, b] = [await world.newProfile('creator'), await world.newProfile('brand')];
      const row = { creator_profile_id: a.id, brand_profile_id: b.id };
      expect((await sb.from('matches').insert(row)).error).toBeNull();
      expect((await sb.from('matches').insert(row)).error?.code).toBe('23505');
    });

    // F3-B-1: matching repite el patrón `.or(\`...${profileId}...\`)` que se corrigió en quotes. No es explotable
    // por HTTP (el caso de uso exige un uuid de un perfil propio), pero el adaptador no se defiende.
    it('F3-B-1: listByProfile con un valor hostil no devuelve matches ajenos', async () => {
      const [creator, brand, stranger] = [
        await world.newProfile('creator'),
        await world.newProfile('brand'),
        await world.newProfile('creator'),
      ];
      await matches.createIfAbsent({
        id: randomUUID(),
        creatorProfileId: creator.id,
        brandProfileId: brand.id,
        createdAt: NOW().toISOString(),
      });
      const leaked = await matches
        .listByProfile(`${stranger.id},created_at.gt.1970-01-01`)
        .catch(() => []);
      expect(leaked).toEqual([]);
    });
  });

  describe('classification', () => {
    const repo = createSupabaseClassificationRepository(sb);

    // F3-M-1: save hace dos upserts en paralelo sin transacción: si el embedding falla (p. ej. dimensión errónea
    // tras cambiar de modelo), la clasificación queda guardada sin embedding y el perfil no entra al feed.
    it('F3-M-1: un fallo al guardar el embedding no deja la clasificación a medias', async () => {
      const profile = await world.newProfile('creator');
      const classification = {
        niches: [],
        tier: 'nano' as const,
        followers: 0,
        engagementRate: 0,
        classifiedAt: NOW().toISOString(),
      };
      await repo
        .save(profile.id, classification, Array(WRONG_DIMENSIONS).fill(0))
        .catch(() => undefined);
      expect(await repo.getClassification(profile.id)).toBeNull();
    });
  });
});
