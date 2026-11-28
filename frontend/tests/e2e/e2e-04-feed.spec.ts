import { expect, test } from '@playwright/test';
import { apiAs } from './support/api';
import { newBrand, newCreator } from './support/actors';
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
    .getByRole('group', { name: 'Nichos de influencers que buscas' })
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
  await expect(cards.first().getByText('Influencer', { exact: false })).toBeVisible();

  const scores = (
    await page
      .locator('.pcard-metrics div')
      .filter({ hasText: 'Compatibilidad' })
      .locator('dd')
      .allTextContents()
  ).map((t) => Number.parseInt(t, RADIX));
  expect(scores).toEqual([...scores].sort((a, b) => b - a));
  // La primera tarjeta muestra foto cargada (naturalWidth > 0, con alt) y la bio con su línea de procedencia.
  const first = cards.first();
  const photo = first.locator('.pcard-media img');
  expect(((await photo.getAttribute('alt')) ?? '').startsWith('Foto de ')).toBe(true);
  await expect
    .poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
    .toBeGreaterThan(0);
  await expect(first.locator('.pcard-bio')).not.toBeEmpty();
  const source = (await first.locator('.pcard-source').textContent()) ?? '';
  expect(
    source.startsWith('Bio compartida · Instagram · @') || source === 'Declarado en Sponcer',
  ).toBe(true);

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

// RF-10 (ADR-009): "Cotizar" en la tarjeta del creador cuando el perfil activo es una marca.
const UNIQUE_PRICE_PEN = 8;
const UNIQUE_BUDGET_PEN = 999_998;

test('E2E-04: la tarjeta del creador ofrece "Cotizar" a la marca y abre el flujo de cotización', async ({
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
  const card = brandPage.getByRole('article').filter({ hasText: creator.handle });
  await expect(card).toBeVisible();
  // ADR-009: la tarjeta abre el flujo de cotización (sin match) en un diálogo, ya no enlaza a la ficha.
  const request = card.getByRole('button', { name: 'Cotizar', exact: true });
  await request.click();
  await expect(
    brandPage.getByRole('dialog', { name: `Cotizar a @${creator.handle}` }),
  ).toBeVisible();
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
  const brandCard = creatorPage.getByRole('article').filter({ hasText: brand.handle });
  await expect(brandCard).toBeVisible();
  await expect(brandCard.getByRole('button', { name: 'Cotizar', exact: true })).toHaveCount(0);
  await creatorCtx.close();
});
