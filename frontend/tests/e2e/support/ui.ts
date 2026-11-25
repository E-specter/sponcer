import { expect, type Page } from '@playwright/test';

/**
 * Las islas de Astro se pintan en el servidor y se hidratan después: escribir antes de hidratar se pierde.
 * Una isla hidratada pierde el atributo `ssr`; las que viven en un <details> cerrado (client:visible) se ignoran.
 */
export async function waitHydrated(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    [...document.querySelectorAll('astro-island[ssr]')].every((island) =>
      island.closest('details:not([open])'),
    ),
  );
}

/** `goto` + espera de hidratación. */
export async function visit(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await waitHydrated(page);
}

/** Abre la campana de notificaciones y devuelve su panel. */
export async function openBell(page: Page) {
  await page.getByRole('button', { name: 'Notificaciones' }).click();
  const panel = page.getByRole('region', { name: 'Notificaciones' });
  await expect(panel).toBeVisible();
  return panel;
}
