import { expect, test } from '@playwright/test';
import { newBrand } from './support/actors';
import { BASE_URL } from './support/env';
import { loginAs } from './support/session';
import { visit } from './support/ui';
import { createWorld } from './support/world';

// F5: cabecera móvil (414 px) con sesión real: "Salir" alcanzable, todo dentro del viewport y sin desborde horizontal.
const world = createWorld();
test.afterAll(() => world.cleanup());

const MOBILE_WIDTH = 414;
const MOBILE_HEIGHT = 896;
const SCREENS = ['/descubrir', '/panel', '/panel/matches', '/panel/cotizaciones'];

SCREENS.forEach((path) => {
  test(`F5 móvil ${path}: la cabecera con sesión cabe, "Salir" visible y sin desborde`, async ({
    page,
    context,
  }) => {
    const brand = await newBrand(world);
    await page.setViewportSize({ width: MOBILE_WIDTH, height: MOBILE_HEIGHT });
    await loginAs(context, brand.user);
    await visit(page, path);

    const logout = page.getByRole('button', { name: 'Salir' });
    await expect(logout).toBeVisible();
    const box = await logout.boundingBox();
    expect(box).not.toBeNull();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(MOBILE_WIDTH);

    const header = page.locator('.app-header');
    const headerBox = await header.boundingBox();
    expect((headerBox?.x ?? 0) + (headerBox?.width ?? 0)).toBeLessThanOrEqual(MOBILE_WIDTH);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test('F5 móvil: "Salir" cierra la sesión', async ({ page, context }) => {
  const brand = await newBrand(world);
  await page.setViewportSize({ width: MOBILE_WIDTH, height: MOBILE_HEIGHT });
  await loginAs(context, brand.user);
  await visit(page, '/descubrir');
  await page.getByRole('button', { name: 'Salir' }).click();
  // Esperar a que termine el cierre de sesión (POST + redirección) antes de volver a pedir una ruta protegida.
  await expect(page).toHaveURL(`${BASE_URL}/login`);
  await page.goto('/panel');
  await expect(page).toHaveURL(`${BASE_URL}/login`);
});
