import { expect, test, type Page } from '@playwright/test';
import { newBrand, newCreator, newMatch } from './support/actors';
import { loginAs } from './support/session';
import { openBell, visit } from './support/ui';
import { createWorld } from './support/world';

// E2E-07 (RF-13): chat entre las partes del match en tiempo real con dos navegadores, sin recargar.
const world = createWorld();
test.afterAll(() => world.cleanup());

const NO_RELOAD_FLAG = '__e2eNoReload';
// MAX_CHAT_MESSAGE del contrato (2000) más uno.
const TOO_LONG = 2001;
const HTTP_BAD_REQUEST = 400;

async function send(page: Page, text: string): Promise<void> {
  await page.getByLabel('Mensaje', { exact: true }).fill(text);
  await page.getByRole('button', { name: 'Enviar' }).click();
}

test('E2E-07: los mensajes llegan al otro navegador sin recargar y quedan en el historial', async ({
  browser,
}) => {
  const creator = await newCreator(world);
  const brand = await newBrand(world);
  const matchId = await newMatch(creator, brand);

  const creatorCtx = await browser.newContext();
  const brandCtx = await browser.newContext();
  const creatorPage = await creatorCtx.newPage();
  const brandPage = await brandCtx.newPage();
  await loginAs(creatorCtx, creator.user);
  await loginAs(brandCtx, brand.user);
  await visit(creatorPage, `/mensajes/${matchId}`);
  await visit(brandPage, `/mensajes/${matchId}`);
  await expect(creatorPage.getByRole('heading', { level: 1 })).toContainText(`@${brand.handle}`);
  await expect(brandPage.getByText('Aún no hay mensajes. Saluda primero.')).toBeVisible();

  // Marca en memoria de la página: si el mensaje llega por recarga, la marca desaparece.
  await brandPage.evaluate((flag) => Object.assign(window, { [flag]: true }), NO_RELOAD_FLAG);
  const brandLog = brandPage.getByRole('log', { name: 'Historial de mensajes' });
  const creatorLog = creatorPage.getByRole('log', { name: 'Historial de mensajes' });

  // Creador -> marca, en vivo.
  await send(creatorPage, 'Hola marca, ¿hablamos del reel?');
  await expect(creatorLog).toContainText('Hola marca, ¿hablamos del reel?');
  await expect(brandLog).toContainText('Hola marca, ¿hablamos del reel?');
  expect(await brandPage.evaluate((flag) => Reflect.get(window, flag), NO_RELOAD_FLAG)).toBe(true);

  // Marca -> creador, en vivo; el remitente se distingue para lectores de pantalla.
  await send(brandPage, 'Sí, te escribimos los detalles');
  await expect(creatorLog).toContainText('Sí, te escribimos los detalles');
  await expect(creatorLog.locator('.bubble').last()).toContainText(`@${brand.handle}:`);
  await expect(brandLog.locator('.bubble-mine')).toContainText('Sí, te escribimos los detalles');

  // El historial persiste y no hay duplicados (el mensaje propio llega por la API y por Realtime).
  await visit(brandPage, `/mensajes/${matchId}`);
  await expect(brandLog.locator('.bubble')).toHaveCount(2);

  // El otro participante tiene su notificación de mensaje nuevo (RF-12).
  await visit(creatorPage, '/panel/matches');
  await expect(
    (await openBell(creatorPage)).getByRole('link', { name: 'Tienes un mensaje nuevo' }).first(),
  ).toBeVisible();

  await creatorCtx.close();
  await brandCtx.close();
});

test('E2E-07: validación del mensaje en el borde (vacío en la UI, demasiado largo en la API)', async ({
  browser,
}) => {
  const creator = await newCreator(world);
  const brand = await newBrand(world);
  const matchId = await newMatch(creator, brand);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAs(ctx, creator.user);
  await visit(page, `/mensajes/${matchId}`);

  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByText('Escribe un mensaje')).toBeVisible();
  await expect(page.getByText('Aún no hay mensajes. Saluda primero.')).toBeVisible();

  const tooLong = await creator.api.call('POST', `/api/v1/matches/${matchId}/messages`, {
    senderProfileId: creator.profileId,
    body: 'x'.repeat(TOO_LONG),
  });
  expect(tooLong.status).toBe(HTTP_BAD_REQUEST);
  await ctx.close();
});
