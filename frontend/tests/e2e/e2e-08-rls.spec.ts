import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import { newBrand, newCreator, newMatch } from './support/actors';
import { ANON_KEY, SUPABASE_URL } from './support/env';
import { loginAs } from './support/session';
import { createWorld } from './support/world';

// E2E-08 (RNF-03): un usuario sin match no puede leer ni escribir mensajes ajenos (RLS), por UI, API y Supabase directo.
const world = createWorld();
test.afterAll(() => world.cleanup());

const SECRET = 'mensaje-privado-del-match';
const HTTP_NOT_ALLOWED = [401, 403, 404] as const;
const REALTIME_SETTLE_MS = 3000;

/** Petición directa a PostgREST de Supabase con el JWT del usuario (sin pasar por la core API). */
async function rest(token: string | null, path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token ?? ANON_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as unknown) : null };
}

type Cast = Awaited<ReturnType<typeof buildCast>>;
let cast: Cast;

/** Un creador con dos marcas (dos matches) y un tercero sin match; los reclamos tienen límite de tasa, por eso se comparte. */
async function buildCast() {
  const creator = await newCreator(world);
  const brand = await newBrand(world);
  const otherBrand = await newBrand(world);
  const outsider = await newCreator(world);
  const matchId = await newMatch(creator, brand);
  const emptyMatchId = await newMatch(creator, otherBrand);
  await creator.api.sendMessage(matchId, creator.profileId, SECRET);
  return { creator, brand, otherBrand, outsider, matchId, emptyMatchId };
}

test.beforeAll(async () => {
  cast = await buildCast();
});

test('E2E-08: la UI no muestra la conversación a quien no participa', async ({ page, context }) => {
  const { outsider, matchId } = cast;
  await loginAs(context, outsider.user);

  const response = await page.goto(`/mensajes/${matchId}`);
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Conversación no encontrada' })).toBeVisible();
  await expect(page.getByText(SECRET)).toHaveCount(0);
  await expect(page.getByRole('log')).toHaveCount(0);
});

test('E2E-08: PostgREST con el token de un tercero devuelve vacío; con el de un participante, el mensaje', async () => {
  const { creator, brand, outsider, matchId } = cast;

  // Caso permitido (control): los dos participantes sí leen el mensaje.
  const allowed = await Promise.all(
    [creator, brand].map((a) => rest(a.token, `messages?match_id=eq.${matchId}&select=body`)),
  );
  allowed.forEach((r) => {
    expect(r.status).toBe(200);
    expect(r.body).toEqual([{ body: SECRET }]);
  });

  // Caso denegado: el tercero autenticado y el anónimo no ven filas (ni por filtro ni sin filtro).
  const outsiderByMatch = await rest(outsider.token, `messages?match_id=eq.${matchId}&select=*`);
  expect(outsiderByMatch).toEqual({ status: 200, body: [] });
  const outsiderAll = await rest(outsider.token, 'messages?select=body');
  expect(JSON.stringify(outsiderAll.body)).not.toContain(SECRET);
  const anon = await rest(null, `messages?match_id=eq.${matchId}&select=*`);
  expect(JSON.stringify(anon.body)).not.toContain(SECRET);
  const outsiderMatches = await rest(outsider.token, `matches?id=eq.${matchId}&select=id`);
  expect(outsiderMatches.body).toEqual([]);
});

test('E2E-08: un tercero tampoco puede escribir mensajes (directo ni por la API)', async () => {
  const { creator, outsider, matchId } = cast;

  const insert = await rest(outsider.token, 'messages', {
    method: 'POST',
    body: JSON.stringify({
      match_id: matchId,
      sender_profile_id: outsider.profileId,
      body: 'intruso',
    }),
  });
  expect(HTTP_NOT_ALLOWED).toContain(insert.status);

  const viaApi = await outsider.api.call('POST', `/api/v1/matches/${matchId}/messages`, {
    senderProfileId: outsider.profileId,
    body: 'intruso',
  });
  expect(viaApi.ok).toBe(false);
  const readApi = await outsider.api.call('GET', `/api/v1/matches/${matchId}/messages`);
  expect(readApi.ok).toBe(false);
  expect(JSON.stringify(readApi.body)).not.toContain(SECRET);

  // Nada del intruso quedó guardado.
  const rows = await rest(creator.token, `messages?match_id=eq.${matchId}&select=body`);
  expect(rows.body).toEqual([{ body: SECRET }]);
});

test('E2E-08: Realtime solo entrega mensajes nuevos a los participantes', async () => {
  // Match sin mensajes previos: lo único que puede llegar por Realtime es lo enviado después de suscribirse.
  const { creator, otherBrand: brand, outsider, emptyMatchId: matchId } = cast;

  const listen = async (token: string) => {
    const received: string[] = [];
    const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    await client.realtime.setAuth(token);
    await new Promise<void>((resolve, reject) => {
      client
        .channel(`rls-${token.slice(-8)}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `match_id=eq.${matchId}`,
          },
          (p) => received.push(String((p.new as { body: string }).body)),
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') resolve();
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(status));
        });
    });
    return { received, close: () => client.removeAllChannels() };
  };

  const [participant, stranger] = await Promise.all([listen(brand.token), listen(outsider.token)]);
  await creator.api.sendMessage(matchId, creator.profileId, 'solo-para-participantes');
  await expect.poll(() => participant.received).toEqual(['solo-para-participantes']);
  await new Promise((r) => setTimeout(r, REALTIME_SETTLE_MS));
  expect(stranger.received).toEqual([]);
  await Promise.all([participant.close(), stranger.close()]);
});
