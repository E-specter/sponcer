import { expect, test } from '@playwright/test';
import { newCreator } from './support/actors';
import { OVER_ONE_PAGE, seedMatches, seedQuotes } from './support/bulk';
import { loginAs } from './support/session';
import { visit } from './support/ui';
import { createWorld } from './support/world';

// F5: "Cargar más" en Matches y Cotizaciones (la API pagina de 20 en 20).
const world = createWorld();
test.afterAll(() => world.cleanup());

const PAGE_SIZE = 20;

test('F5: Matches pagina con "Cargar más" y no repite tarjetas', async ({ page, context }) => {
  const creator = await newCreator(world);
  await seedMatches(world, creator, OVER_ONE_PAGE);
  await loginAs(context, creator.user);
  await visit(page, '/panel/matches');

  const cards = page.getByRole('article');
  await expect(cards).toHaveCount(PAGE_SIZE);
  await page.getByRole('button', { name: 'Cargar más' }).click();
  await expect(cards).toHaveCount(OVER_ONE_PAGE);
  await expect(page.getByRole('button', { name: 'Cargar más' })).toHaveCount(0);
  const names = await cards.getByRole('heading', { level: 3 }).allTextContents();
  expect(new Set(names).size).toBe(OVER_ONE_PAGE);
});

test('F5: Cotizaciones pagina con "Cargar más" y no repite solicitudes', async ({
  page,
  context,
}) => {
  const creator = await newCreator(world);
  await seedQuotes(world, creator, OVER_ONE_PAGE);
  await loginAs(context, creator.user);
  await visit(page, '/panel/cotizaciones');

  const cards = page.getByRole('article');
  await expect(cards).toHaveCount(PAGE_SIZE);
  await page.getByRole('button', { name: 'Cargar más' }).click();
  await expect(cards).toHaveCount(OVER_ONE_PAGE);
  await expect(page.getByRole('button', { name: 'Cargar más' })).toHaveCount(0);
  const names = await cards.getByRole('heading', { level: 3 }).allTextContents();
  expect(new Set(names).size).toBe(OVER_ONE_PAGE);
});
