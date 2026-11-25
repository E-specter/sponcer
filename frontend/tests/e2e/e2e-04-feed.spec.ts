import { expect, test } from '@playwright/test';
import { apiAs } from './support/api';
import { newBrand, newCreator } from './support/actors';
import { BASE_URL } from './support/env';
import { loginAs, sessionFor } from './support/session';
import { visit } from './support/ui';
import { createWorld } from './support/world';

// E2E-04 (RF-08, RF-10): una marca completa sus necesidades y ve un feed de creadores ordenado y filtrable.
const world = createWorld();
test.afterAll(() => world.cleanup());

const BUDGET_MIN = '1000';
const BUDGET_MAX = '8000';
const UNREACHABLE_PRICE = '0';
const MIN_CARDS = 2;
const RADIX = 10;

test('E2E-04: marca completa necesidades y su feed sale ordenado y filtrado', async ({
  page,
  context,
}) => {
  const user = await world.newUser();
  const handle = world.newHandle();
  await apiAs((await sessionFor(user)).accessToken).claim(handle, 'brand');
  await loginAs(context, user);

  // Necesidades de la marca (RF-08) por la UI.
  await visit(page, '/panel');
  const declared = page.getByRole('form', { name: 'Datos declarados' });
  await declared.getByLabel('Sector').selectOption('moda-retail');
  await declared.getByLabel('Ventas').check();
  await declared
    .getByRole('group', { name: 'Nichos de creadores que buscas' })
    .getByLabel('Moda')
    .check();
  await declared.getByLabel('Presupuesto mínimo (S/)').fill(BUDGET_MIN);
  await declared.getByLabel('Presupuesto máximo (S/)').fill(BUDGET_MAX);
  await declared.getByRole('button', { name: 'Guardar datos' }).click();
  await expect(declared.getByText('Datos guardados.')).toBeVisible();

  // Feed (RF-10): tarjetas de creadores, de mayor a menor compatibilidad, con el motivo visible.
  await visit(page, '/descubrir');
  const cards = page.getByRole('article');
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThanOrEqual(MIN_CARDS);
  await expect(page.getByText(`Viendo como @${handle}`)).toBeVisible();
  await expect(cards.first().getByText('Creador', { exact: false })).toBeVisible();

  const scores = (
    await page
      .locator('.pcard-metrics div')
      .filter({ hasText: 'Compatibilidad' })
      .locator('dd')
      .allTextContents()
  ).map((t) => Number.parseInt(t, RADIX));
  expect(scores).toEqual([...scores].sort((a, b) => b - a));
  // El motivo del match (los 2 componentes que más pesan: nichos, contenido, presupuesto o interacción) acompaña a la tarjeta.
  await expect(cards.first().locator('.pcard-reason')).not.toBeEmpty();

  // Filtro por nicho: todas las tarjetas visibles lo traen.
  await page.getByRole('button', { name: 'Filtros', exact: true }).click();
  const gastronomy = page
    .getByRole('group', { name: 'Nichos' })
    .getByRole('button', { name: 'Gastronomía' });
  await gastronomy.click();
  await expect(gastronomy).toHaveAttribute('aria-pressed', 'true');
  await expect(async () => {
    const shown = await cards.count();
    expect(shown).toBeGreaterThan(0);
    expect(
      await cards.filter({ has: page.locator('.chip', { hasText: 'Gastronomía' }) }).count(),
    ).toBe(shown);
  }).toPass();

  // Filtro sin resultados: estado vacío con salida, sin rellenar con perfiles que no coinciden.
  await page.getByLabel('Precio máximo del servicio (S/)').fill(UNREACHABLE_PRICE);
  await expect(page.getByText('No hay perfiles que coincidan con estos filtros.')).toBeVisible();
  await expect(cards).toHaveCount(0);
  await page.getByRole('button', { name: 'Limpiar filtros' }).first().click();
  await expect(cards.first()).toBeVisible();
});

// RF-10: "Solicitar cotización" en la tarjeta del creador cuando el perfil activo es una marca.
const UNIQUE_PRICE_PEN = 8;
const UNIQUE_BUDGET_PEN = 999_998;

test('E2E-04: la tarjeta del creador ofrece "Solicitar cotización" a la marca y lleva a sus servicios', async ({
  browser,
}) => {
  const creator = await newCreator(world, {
    services: [
      {
        type: 'canje',
        format: 'story',
        pricePen: UNIQUE_PRICE_PEN,
        description: 'Story de prueba',
      },
    ],
  });
  const brand = await newBrand(world, { budgetMinPen: 1, budgetMaxPen: UNIQUE_BUDGET_PEN });

  const brandCtx = await browser.newContext();
  const brandPage = await brandCtx.newPage();
  await loginAs(brandCtx, brand.user);
  await visit(brandPage, '/descubrir');
  await brandPage.getByRole('button', { name: 'Filtros', exact: true }).click();
  await brandPage.getByLabel('Precio máximo del servicio (S/)').fill(String(UNIQUE_PRICE_PEN));
  const card = brandPage.getByRole('article').filter({ hasText: `@${creator.handle}` });
  await expect(card).toBeVisible();
  const request = card.getByRole('link', { name: 'Solicitar cotización' });
  await expect(request).toHaveAttribute('href', `/perfil/${creator.handle}#servicios`);
  await request.click();
  await expect(brandPage).toHaveURL(`${BASE_URL}/perfil/${creator.handle}#servicios`);
  await expect(brandPage.getByRole('button', { name: 'Solicitar cotización' })).toBeVisible();
  await brandCtx.close();

  // Un creador mira marcas: sus tarjetas no ofrecen cotización.
  const creatorCtx = await browser.newContext();
  const creatorPage = await creatorCtx.newPage();
  await loginAs(creatorCtx, creator.user);
  await visit(creatorPage, '/descubrir');
  await creatorPage.getByRole('button', { name: 'Filtros', exact: true }).click();
  await creatorPage
    .getByLabel('Presupuesto máximo mínimo de la marca (S/)')
    .fill(String(UNIQUE_BUDGET_PEN));
  const brandCard = creatorPage.getByRole('article').filter({ hasText: `@${brand.handle}` });
  await expect(brandCard).toBeVisible();
  await expect(brandCard.getByRole('link', { name: 'Solicitar cotización' })).toHaveCount(0);
  await creatorCtx.close();
});
