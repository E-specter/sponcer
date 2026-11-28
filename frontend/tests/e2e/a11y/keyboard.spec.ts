import { expect, test, type Locator, type Page } from '@playwright/test';
import { newBrand, newCreator } from '../support/actors';
import { loginAs } from '../support/session';
import { visit } from '../support/ui';
import { createWorld } from '../support/world';

// Teclado: el flujo "Me interesa" se completa sin ratón y el foco es siempre visible (brief: anillo de 2 px violeta).
const world = createWorld();
test.afterAll(() => world.cleanup());

const UNIQUE_PRICE_PEN = 7;
const MIN_FOCUS_RING_PX = 2;
/** Techo de Tab para llegar a un control: evita un bucle infinito si hay una trampa de foco. */
const MAX_TABS = 80;

/** Pulsa Tab hasta que el foco cae en `target`; devuelve cuántas pulsaciones hicieron falta. */
async function tabTo(page: Page, target: Locator): Promise<number> {
  const attempt = async (n: number): Promise<number> => {
    if (n > MAX_TABS)
      throw new Error('El foco no llegó al control con el teclado (¿trampa de foco?)');
    await page.keyboard.press('Tab');
    const reached = await target.evaluate((el) => el === document.activeElement).catch(() => false);
    return reached ? n : attempt(n + 1);
  };
  return attempt(1);
}

/** El control enfocado debe mostrar un anillo (outline o box-shadow) distinguible: no `none` ni 0 px. */
async function expectVisibleFocus(target: Locator): Promise<void> {
  await expect(target).toBeFocused();
  const ring = await target.evaluate((el) => {
    const css = getComputedStyle(el);
    return {
      outlineWidth: Number.parseFloat(css.outlineWidth),
      outlineStyle: css.outlineStyle,
      shadow: css.boxShadow,
    };
  });
  const hasOutline = ring.outlineStyle !== 'none' && ring.outlineWidth >= MIN_FOCUS_RING_PX;
  const hasShadow = ring.shadow !== 'none';
  expect(hasOutline || hasShadow, `sin anillo de foco: ${JSON.stringify(ring)}`).toBe(true);
}

// WebKit (Safari) no incluye enlaces en el orden de Tab salvo con Alt+Tab: no es un defecto del producto.
const WEBKIT_SKIPS_LINKS = 'WebKit omite enlaces al tabular (Safari: Alt+Tab)';

test('teclado: "Me interesa" se activa con Tab + Enter y el foco es visible en cada paso', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(browserName === 'webkit', WEBKIT_SKIPS_LINKS);
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
  const brand = await newBrand(world);
  await loginAs(context, brand.user);
  await visit(page, '/descubrir');

  // Enlace "Saltar al contenido" es el primer foco de la página.
  await page.keyboard.press('Tab');
  await expectVisibleFocus(page.getByRole('link', { name: 'Saltar al contenido' }));

  // Filtro por precio solo con teclado: abre "Filtros" y escribe el precio único del creador.
  const filtersButton = page.getByRole('button', { name: 'Filtros', exact: true });
  await tabTo(page, filtersButton);
  await expectVisibleFocus(filtersButton);
  await page.keyboard.press('Enter');
  const price = page.getByLabel('Precio máximo del servicio (S/)');
  await tabTo(page, price);
  await expectVisibleFocus(price);
  await page.keyboard.type(String(UNIQUE_PRICE_PEN));

  // La tarjeta del creador: Tab hasta "Me interesa", foco visible y activación con Enter.
  const card = page.getByRole('article').filter({ hasText: creator.handle });
  await expect(card).toBeVisible();
  const interest = card.getByRole('button', { name: 'Me interesa' });
  await tabTo(page, interest);
  await expectVisibleFocus(interest);
  await page.keyboard.press('Enter');
  await expect(page.getByText(`Mostraste interés en @${creator.handle}`)).toBeVisible();
});

test('teclado: los controles del feed muestran anillo de foco (chips, Ver perfil, Descartar)', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(browserName === 'webkit', WEBKIT_SKIPS_LINKS);
  const brand = await newBrand(world);
  await loginAs(context, brand.user);
  await visit(page, '/descubrir');
  await expect(page.getByRole('article').first()).toBeVisible();

  const chip = page.getByRole('group', { name: 'Tamaño de audiencia' }).getByRole('button').first();
  const first = page.getByRole('article').first();
  const targets = [
    chip,
    first.getByRole('button', { name: 'Me interesa' }),
    first.getByRole('link', { name: 'Ver perfil' }),
    first.getByRole('button', { name: 'Descartar' }),
  ];
  await targets.reduce(async (previous, target) => {
    await previous;
    await tabTo(page, target);
    await expectVisibleFocus(target);
  }, Promise.resolve());
});

test('teclado: el chat y el formulario de cotización son operables sin ratón', async ({
  page,
  context,
}) => {
  const creator = await newCreator(world);
  const brand = await newBrand(world);
  await loginAs(context, brand.user);
  await visit(page, `/perfil/${creator.handle}`);

  const request = page.getByRole('button', { name: 'Cotizar (propuesta abierta)' });
  await tabTo(page, request);
  await expectVisibleFocus(request);
  await page.keyboard.press('Enter');
  // Sin campañas activas, el diálogo propone crear una rápida: nombre y mensaje, todo por teclado.
  const quick = page.getByLabel('Nombre de la nueva campaña');
  await expect(quick).toBeVisible();
  await tabTo(page, quick);
  await page.keyboard.type('Campaña por teclado');
  const message = page.getByLabel('Mensaje', { exact: true });
  await tabTo(page, message);
  await page.keyboard.type('Cotización por teclado');
  const send = page.getByRole('button', { name: 'Enviar cotización' });
  await tabTo(page, send);
  await expectVisibleFocus(send);
  await page.keyboard.press('Enter');
  await expect(page.getByText('Cotizaciones creadas (1)')).toBeVisible();
});
