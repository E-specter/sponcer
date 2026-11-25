import { expect, test } from '@playwright/test';
import { newBrand, newCreator } from './support/actors';
import { loginAs } from './support/session';
import { openBell, visit } from './support/ui';
import { createWorld } from './support/world';

// E2E-05 (RF-10, RF-12): interés mutuo entre dos sesiones -> match y notificación a ambos.
const world = createWorld();
test.afterAll(() => world.cleanup());

// Precio y presupuesto "únicos" para que el filtro deje en el feed solo a la contraparte de este test.
const UNIQUE_PRICE_PEN = 7;
const UNIQUE_BUDGET_PEN = 999_999;

test('E2E-05: interés mutuo crea el match y notifica a las dos partes', async ({ browser }) => {
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
  const creatorCtx = await browser.newContext();
  const brandPage = await brandCtx.newPage();
  const creatorPage = await creatorCtx.newPage();
  await loginAs(brandCtx, brand.user);
  await loginAs(creatorCtx, creator.user);

  // La marca muestra interés primero: todavía no hay match.
  await visit(brandPage, '/descubrir');
  await brandPage.getByRole('button', { name: 'Filtros', exact: true }).click();
  await brandPage.getByLabel('Precio máximo del servicio (S/)').fill(String(UNIQUE_PRICE_PEN));
  const creatorCard = brandPage.getByRole('article').filter({ hasText: `@${creator.handle}` });
  await expect(creatorCard).toBeVisible();
  await creatorCard.getByRole('button', { name: 'Me interesa' }).click();
  await expect(brandPage.getByText(`Mostraste interés en @${creator.handle}`)).toBeVisible();
  await expect(brandPage.getByText('¡Match con')).toHaveCount(0);

  // El creador responde con interés mutuo: el match se crea y se ofrece abrir el chat.
  await visit(creatorPage, '/descubrir');
  await creatorPage.getByRole('button', { name: 'Filtros', exact: true }).click();
  await creatorPage
    .getByLabel('Presupuesto máximo mínimo de la marca (S/)')
    .fill(String(UNIQUE_BUDGET_PEN));
  const brandCard = creatorPage.getByRole('article').filter({ hasText: `@${brand.handle}` });
  await expect(brandCard).toBeVisible();
  await brandCard.getByRole('button', { name: 'Me interesa' }).click();
  await expect(creatorPage.getByText(`¡Match con @${brand.handle}!`)).toBeVisible();
  await expect(creatorPage.getByRole('link', { name: 'Abrir chat' })).toBeVisible();

  // Notificación a ambos (RF-12): la campana lista "nuevo match" con enlace al chat.
  const bellOf = async (page: typeof brandPage) => {
    await visit(page, '/panel/matches');
    const panel = await openBell(page);
    await expect(panel.getByRole('link', { name: 'Tienes un nuevo match' }).first()).toBeVisible();
  };
  await bellOf(creatorPage);
  await bellOf(brandPage);

  // Ambos ven al otro en Matches, con acceso al chat.
  await expect(brandPage.getByRole('heading', { name: `@${creator.handle}` })).toBeVisible();
  await visit(creatorPage, '/panel/matches');
  await expect(creatorPage.getByRole('heading', { name: `@${brand.handle}` })).toBeVisible();
  await expect(creatorPage.getByRole('link', { name: 'Abrir chat' })).toBeVisible();

  await brandCtx.close();
  await creatorCtx.close();
});

test('E2E-05: un interés sin respuesta no crea match ni notificación de match', async ({
  browser,
}) => {
  const creator = await newCreator(world);
  const brand = await newBrand(world);
  await brand.api.interest(brand.profileId, creator.profileId);

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAs(ctx, brand.user);
  await visit(page, '/panel/matches');
  await expect(page.getByText('Aún no tienes matches.')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect((await openBell(page)).getByText('No tienes notificaciones.')).toBeVisible();
  await ctx.close();
});
