import { expect, test, type Page } from '@playwright/test';
import { newBrand, newCreator } from './support/actors';
import { loginAs } from './support/session';
import { openBell, visit } from './support/ui';
import { createWorld } from './support/world';

// E2E-06 (RF-11): cotización enviada -> en negociación -> aceptada -> completada, cada paso por el actor correcto.
const world = createWorld();
test.afterAll(() => world.cleanup());

const HTTP_UNPROCESSABLE_OR_FORBIDDEN = [403, 409, 422] as const;
const COUNTER_OFFER_PEN = '300';

/** La cotización del otro perfil dentro de la lista del panel. */
const quoteCard = (page: Page, handle: string) =>
  page.getByRole('article').filter({ hasText: `@${handle}` });

test('E2E-06: ciclo completo de una cotización con los dos actores correctos', async ({
  browser,
}) => {
  const creator = await newCreator(world);
  const brand = await newBrand(world);
  const brandCtx = await browser.newContext();
  const creatorCtx = await browser.newContext();
  const brandPage = await brandCtx.newPage();
  const creatorPage = await creatorCtx.newPage();
  await loginAs(brandCtx, brand.user);
  await loginAs(creatorCtx, creator.user);

  // 1. La marca solicita desde la ficha del creador (estado: enviada).
  await visit(brandPage, `/perfil/${creator.handle}`);
  await brandPage.getByRole('button', { name: 'Solicitar cotización' }).click();
  await brandPage
    .getByLabel('Mensaje para el creador')
    .fill('Hola, queremos un reel para nuestro lanzamiento');
  await brandPage.getByRole('button', { name: 'Enviar solicitud' }).click();
  await expect(brandPage.getByText('Cotización enviada.')).toBeVisible();

  await visit(brandPage, '/panel/cotizaciones');
  const mine = quoteCard(brandPage, creator.handle);
  await expect(
    mine.getByRole('heading', { name: `Solicitaste a @${creator.handle}` }),
  ).toBeVisible();
  await expect(mine.locator('.badge')).toHaveText('Enviada');
  // La marca no puede aceptar ni rechazar su propia solicitud.
  await expect(mine.getByRole('button', { name: 'Aceptar' })).toHaveCount(0);
  await expect(mine.getByRole('button', { name: 'Rechazar' })).toHaveCount(0);

  // 2. El creador la recibe (con notificación) y abre la negociación con una contraoferta.
  await visit(creatorPage, '/panel/cotizaciones');
  const received = quoteCard(creatorPage, brand.handle);
  await expect(
    received.getByRole('heading', { name: `Solicitud de @${brand.handle}` }),
  ).toBeVisible();
  await expect(received.locator('.badge')).toHaveText('Enviada');
  await expect(
    (await openBell(creatorPage))
      .getByRole('link', { name: 'Una cotización cambió de estado' })
      .first(),
  ).toBeVisible();
  await received.getByLabel('Monto S/ (opcional)').fill(COUNTER_OFFER_PEN);
  await received.getByLabel('Nota (opcional)').fill('Podemos hacerlo por este monto');
  await received.getByRole('button', { name: 'Negociar' }).click();
  await expect(received.locator('.badge')).toHaveText('En negociación');

  // 3. La marca ve la negociación, pero sigue sin poder aceptar: la API también lo rechaza.
  await visit(brandPage, '/panel/cotizaciones');
  await expect(mine.locator('.badge')).toHaveText('En negociación');
  await expect(mine.getByText('S/ 300', { exact: false })).toBeVisible();
  await expect(mine.getByRole('button', { name: 'Aceptar' })).toHaveCount(0);
  const [quote] = (
    await brand.api.call<{ items: { id: string }[] }>(
      'GET',
      `/api/v1/quotes?profileId=${brand.profileId}`,
    )
  ).body.items;
  const forced = await brand.api.call('POST', `/api/v1/quotes/${quote?.id}/transitions`, {
    actorProfileId: brand.profileId,
    to: 'accepted',
  });
  expect(HTTP_UNPROCESSABLE_OR_FORBIDDEN).toContain(forced.status);

  // 4. El creador acepta.
  await received.getByRole('button', { name: 'Aceptar' }).click();
  await expect(received.locator('.badge')).toHaveText('Aceptada');

  // 5. Cualquiera de las partes puede marcarla completada: aquí lo hace la marca.
  await visit(brandPage, '/panel/cotizaciones');
  await expect(mine.locator('.badge')).toHaveText('Aceptada');
  await mine.getByRole('button', { name: 'Marcar completada' }).click();
  await expect(mine.locator('.badge')).toHaveText('Completada');
  await expect(mine.getByText('Sin acciones disponibles.')).toBeVisible();

  // Historial completo y estado final también para el creador, sin más acciones.
  await mine.getByText('Historial').click();
  await expect(mine.locator('details li')).toContainText([
    'Borrador',
    'Enviada',
    'En negociación · ',
    'Aceptada',
    'Completada',
  ]);
  await visit(creatorPage, '/panel/cotizaciones');
  await expect(received.locator('.badge')).toHaveText('Completada');
  await expect(received.getByText('Sin acciones disponibles.')).toBeVisible();

  await brandCtx.close();
  await creatorCtx.close();
});
