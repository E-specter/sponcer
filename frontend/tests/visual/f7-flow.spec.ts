import { expect, test, type Page } from '@playwright/test';
import { waitHydrated } from '../e2e/support/ui';

// Flujos F7 (ADR-009) en modo mock: registro, campañas, cotizar sin match y visibilidad.
// Corren con `npm run e2e:visual -- --grep f7`. El estado del mock vive en el servidor: cada test usa datos propios.
const BASE = process.env.VISUAL_BASE_URL ?? 'http://localhost:4521';
const COOKIE = 'sponcer_mock_user';
const ACTIVE_PROFILE_KEY = 'sponcer.activeProfileId';
const SUFFIX_DIGITS = 12;
const VALID_RUC = '20100070970';
const INVALID_RUC = '20100070971';
const SOFI_ID = '376bec72-d8de-429c-a68f-7ddb0128acfd';
const ANDINA_ID = '716609b8-f757-4303-b401-64e4414ac24c';

const go = async (page: Page, path: string) => {
  await page.goto(path);
  await waitHydrated(page);
};

const asUser = (page: Page, value: string) =>
  page.context().addCookies([{ name: COOKIE, value, url: BASE }]);

const useProfile = (page: Page, id: string) =>
  page.addInitScript(
    ([k, v]) => localStorage.setItem(k as string, v as string),
    [ACTIVE_PROFILE_KEY, id],
  );

test('f7 registro de Empresa: validación en vivo del RUC, consentimiento y primer perfil', async ({
  page,
}) => {
  await asUser(page, `nuevo-${String(Date.now()).slice(-SUFFIX_DIGITS)}`);
  await page.goto('/descubrir');
  await expect(page).toHaveURL(`${BASE}/registro`);
  await waitHydrated(page);

  await page.locator('input[value=company]').check();
  await page.getByRole('button', { name: 'Continuar' }).click();

  await page.getByLabel('Número de RUC').fill(INVALID_RUC);
  await expect(page.getByText('El RUC no es válido')).toBeVisible();
  await page.getByLabel('Número de RUC').fill(VALID_RUC);
  await expect(page.getByText('El RUC no es válido')).toHaveCount(0);
  await page.getByLabel('Razón social').fill('Nube Tech S.A.C.');
  await page.getByLabel('Ciudad').selectOption('lima');
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Sin aceptar no avanza.
  await page.getByRole('button', { name: 'Crear mi cuenta' }).click();
  await expect(page.getByText('Para continuar acepta')).toBeVisible();
  await page.getByLabel('Acepto los').check();
  await page.getByLabel('Acepto la').check();
  await page.getByRole('button', { name: 'Crear mi cuenta' }).click();

  // Primer perfil: la Empresa reclama una marca (el rol queda fijo, sin selector).
  await expect(page.getByRole('heading', { name: 'Tu primer perfil' })).toBeVisible();
  await expect(page.getByLabel('Quiero usarlo como')).toHaveCount(0);
  await page.getByLabel('Tu @handle de Instagram').fill('@nueva.marca.demo');
  await page.getByRole('button', { name: 'Obtener código' }).click();
  await page.getByRole('button', { name: 'Verificar' }).click(); // el mock falla el primer intento
  await page.getByRole('button', { name: 'Verificar' }).click();
  await expect(page.getByText('¡Verificado!')).toBeVisible();
  await page.getByRole('link', { name: 'Ir a mi panel' }).click();
  await expect(page.getByRole('heading', { name: 'Mis marcas' })).toBeVisible();
});

test('f7 registro de Influencer: datos y consentimiento', async ({ page }) => {
  await asUser(page, `nuevo-${String(Date.now() + 1).slice(-SUFFIX_DIGITS)}`);
  await go(page, '/registro');
  await page.locator('input[value=influencer]').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  // Sin datos no avanza: el nombre exige al menos 2 caracteres.
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('#reg-name-error')).toBeVisible();
  await page.getByLabel('Tu nombre').fill('Lola Demo');
  await page.getByLabel('Ciudad').selectOption('cusco');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByLabel('Acepto los').check();
  await page.getByLabel('Acepto la').check();
  await page.getByRole('button', { name: 'Crear mi cuenta' }).click();
  await expect(page.getByRole('heading', { name: 'Tu primer perfil' })).toBeVisible();
});

test('f7 campañas: crear, activar y cotizar a varios influencers', async ({ page }) => {
  await useProfile(page, ANDINA_ID);
  await go(page, '/campanas');
  await page.getByRole('button', { name: 'Nueva campaña' }).click();
  await page.getByLabel('Nombre de la campaña').fill('Cyber 2026');
  await page.getByLabel('Activar al crear').check();
  await page.getByRole('button', { name: 'Crear campaña' }).click();
  await page.getByRole('link', { name: 'Cyber 2026' }).click();
  await waitHydrated(page);
  await expect(page.getByRole('heading', { name: 'Cyber 2026' })).toBeVisible();

  const boxes = page.getByRole('checkbox', { name: '@' });
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  await page.getByRole('button', { name: 'Continuar con 2 influencers' }).click();
  await page.getByLabel('Mensaje').fill('Hola, queremos cotizar una colaboración.');
  await page.getByRole('button', { name: 'Enviar a 2 influencers' }).click();
  await expect(page.getByText('Cotizaciones creadas (2)')).toBeVisible();

  // Una segunda cotización a los mismos influencers falla por destinatario (CONFLICT).
  await go(page, '/campanas');
  await expect(page.getByText('2 cotizaciones')).toBeVisible();
});

test('f7 cotizar sin match desde el feed, con campaña rápida y propuesta abierta', async ({
  page,
}) => {
  await useProfile(page, ANDINA_ID);
  await go(page, '/descubrir');
  await page.getByRole('button', { name: 'Cotizar', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Servicio para')).toContainText('Propuesta abierta');
  await dialog.getByLabel('Campaña').selectOption({ label: 'Crear una campaña rápida…' });
  await dialog.getByLabel('Nombre de la nueva campaña').fill('Rápida demo');
  await dialog.getByLabel('Mensaje').fill('Cotización sin match.');
  await dialog.getByRole('button', { name: 'Enviar cotización' }).click();
  await expect(dialog.getByText('Cotizaciones creadas (1)')).toBeVisible();

  await go(page, '/panel/cotizaciones');
  await expect(page.getByText('Propuesta abierta').first()).toBeVisible();
  await expect(page.getByText('Campaña: Rápida demo').first()).toBeVisible();
});

test('f7 visibilidad: pestañas, devolver interés y registro de visita', async ({ page }) => {
  // La marca abre la ficha de la influencer: se registra una visita.
  await useProfile(page, ANDINA_ID);
  const recorded = page.waitForResponse((r) => r.url().includes('/bff/recordProfileView'));
  await go(page, '/perfil/sofi.moda.demo');
  expect((await recorded).ok()).toBe(true);

  await asUser(page, 'influencer');
  await useProfile(page, SOFI_ID);
  await go(page, '/visibilidad');
  await expect(page.getByRole('tab', { name: 'Interesados' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('tab', { name: 'Visitas' }).click();
  await expect(page.getByText('@andina.snacks.demo')).toBeVisible();
  await page.getByRole('button', { name: 'Devolver interés' }).first().click();
  await expect(page.locator('[aria-live=polite] .alert')).toBeVisible();
});
