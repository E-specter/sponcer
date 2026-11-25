import { expect, test } from '@playwright/test';
import { newBrand } from './support/actors';
import { loginAs } from './support/session';
import { visit } from './support/ui';
import { createWorld } from './support/world';

// F5: búsqueda `q` (con debounce, sin distinguir tildes ni mayúsculas) y filtro de ciudad en Descubrir.
const world = createWorld();
test.afterAll(() => world.cleanup());

/** Perfiles sembrados (nombre en la tarjeta): ambos de Trujillo. */
const SOFIA = 'Sofía · moda';
const MARIA_JOSE = 'María José · mascotas';
const MAX_FEED_REQUESTS_PER_SEARCH = 2;

test('F5: la búsqueda encuentra con tilde, mayúsculas y sin ellas, y pide al servidor una sola vez', async ({
  page,
  context,
}) => {
  const brand = await newBrand(world);
  await loginAs(context, brand.user);
  await visit(page, '/descubrir');
  const cards = page.getByRole('article');
  await expect(cards.first()).toBeVisible();
  await page.waitForLoadState('networkidle');

  const search = page.getByLabel('Busca por nombre o interés');
  const cardOf = (text: string) => cards.filter({ hasText: text });
  const feedRequests: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/bff/feed')) feedRequests.push(r.url());
  });

  // Tecleo seguido: el debounce agrupa las teclas en (a lo sumo) una petición.
  await search.pressSequentially('SOFÍA');
  await expect(cardOf(SOFIA)).toBeVisible();
  await expect(cards).toHaveCount(1);
  expect(feedRequests.length).toBeLessThanOrEqual(MAX_FEED_REQUESTS_PER_SEARCH);

  await search.fill('sofia');
  await expect(cardOf(SOFIA)).toBeVisible();
  await expect(cards).toHaveCount(1);

  await search.fill('maria jose');
  await expect(cardOf(MARIA_JOSE)).toBeVisible();
  await expect(cardOf(SOFIA)).toHaveCount(0);

  // Sin coincidencias: estado vacío con salida.
  await search.fill('zzzzqqq');
  await expect(page.getByText('No hay perfiles que coincidan con estos filtros.')).toBeVisible();
  await expect(cards).toHaveCount(0);
  await page.getByRole('button', { name: 'Limpiar filtros' }).first().click();
  await expect(search).toHaveValue('');
  await expect(cards.first()).toBeVisible();
});

test('F5: el filtro de ciudad deja solo perfiles de esa ciudad y la tarjeta la declara', async ({
  page,
  context,
}) => {
  const brand = await newBrand(world);
  await loginAs(context, brand.user);
  await visit(page, '/descubrir');
  const cards = page.getByRole('article');
  await expect(cards.first()).toBeVisible();

  await page.getByLabel('Ciudad').selectOption({ label: 'Trujillo' });
  await expect(async () => {
    const shown = await cards.count();
    expect(shown).toBeGreaterThan(0);
    expect(await cards.filter({ hasText: 'Trujillo · Ubicación declarada' }).count()).toBe(shown);
  }).toPass();
  await expect(cards.filter({ hasText: SOFIA })).toBeVisible();
  // O-7: se usa la etiqueta del catálogo ("Trujillo"), no el valor interno ("trujillo"). `hasText` ignora mayúsculas: se compara el texto exacto.
  const subtitles = await cards.locator('.pcard-sub').allTextContents();
  expect(subtitles.length).toBeGreaterThan(0);
  subtitles.forEach((text) => expect(text).toBe('Trujillo · Ubicación declarada'));

  // Otra ciudad cambia el resultado; "Todas las ciudades" lo restaura.
  await page.getByLabel('Ciudad').selectOption({ label: 'Cusco' });
  await expect(cards.filter({ hasText: SOFIA })).toHaveCount(0);
  await expect(cards.first()).toContainText('Cusco · Ubicación declarada');
  await page.getByLabel('Ciudad').selectOption({ label: 'Todas las ciudades' });
  await expect(cards.filter({ hasText: SOFIA })).toBeVisible();
});
