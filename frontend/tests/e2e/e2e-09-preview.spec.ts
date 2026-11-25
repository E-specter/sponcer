import { expect, test, type Page } from '@playwright/test';
import { apiAs } from './support/api';
import { BASE_URL } from './support/env';
import { loginAs, sessionFor } from './support/session';
import { visit } from './support/ui';
import { admin, createWorld } from './support/world';

// E2E-09 (RF-01, RNF-05): la ficha previa de un perfil sin dueño solo se ve con sesión y el titular puede pedir su exclusión.
const world = createWorld();
test.afterAll(() => world.cleanup());

const HTTP_FOUND = 302;
const META_TIMEOUT_MS = 1000;
/** Perfil sembrado y sin dueño (solo se LEE en este spec). */
const UNCLAIMED_SEED = 'diego.belleza.demo';

test('E2E-09: sin sesión la ficha previa no se muestra y manda a /login', async ({
  request,
  page,
}) => {
  const res = await request.get(`${BASE_URL}/perfil/${UNCLAIMED_SEED}`, { maxRedirects: 0 });
  expect(res.status()).toBe(HTTP_FOUND);
  expect(res.headers().location).toBe('/login');
  expect(await res.text()).not.toContain(UNCLAIMED_SEED);

  await page.goto(`/perfil/${UNCLAIMED_SEED}`);
  await expect(page).toHaveURL(`${BASE_URL}/login`);
});

test('E2E-09: con sesión se ve la ficha previa marcada como sin reclamar', async ({
  page,
  context,
}) => {
  const user = await world.newUser();
  await loginAs(context, user);

  await visit(page, `/perfil/${UNCLAIMED_SEED}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText('Sin reclamar', { exact: true })).toBeVisible();
  await expect(page.getByText('Tu perfil', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Solicitar exclusión' })).toHaveAttribute(
    'href',
    `/exclusion/${UNCLAIMED_SEED}`,
  );
});

// RF-01 / RNF-05: la ficha previa no es indexable (cabecera y meta), igual que el resto de rutas con sesión y /exclusion.
test('E2E-09: la ficha previa lleva noindex', async ({ page, context }) => {
  const user = await world.newUser();
  await loginAs(context, user);

  const response = await page.goto(`/perfil/${UNCLAIMED_SEED}`);
  const header = response?.headers()['x-robots-tag'] ?? '';
  const meta =
    (await page
      .locator('meta[name="robots"]')
      .first()
      .getAttribute('content', { timeout: META_TIMEOUT_MS })
      .catch(() => null)) ?? '';
  expect(header).toContain('noindex');
  expect(meta).toContain('noindex');

  // También las demás rutas con sesión y el formulario público de exclusión.
  const panel = await page.goto('/panel');
  expect(panel?.headers()['x-robots-tag']).toContain('noindex');
  const exclusion = await page.goto(`/exclusion/${UNCLAIMED_SEED}`);
  expect(exclusion?.headers()['x-robots-tag']).toContain('noindex');
  expect(await page.locator('meta[name="robots"]').first().getAttribute('content')).toContain(
    'noindex',
  );
});

// RF-01: un @handle profesional desconocido genera su ficha previa bajo demanda (ingesta mock: cuenta profesional pública).
test('E2E-09: un @handle profesional desconocido genera su ficha previa bajo demanda', async ({
  page,
  context,
}) => {
  await loginAs(context, await world.newUser());
  await visit(page, `/perfil/${world.newHandle()}`);
  await expect(page.getByText('Sin reclamar', { exact: true })).toBeVisible({
    timeout: META_TIMEOUT_MS,
  });
});

/** Handle con ficha ya ingerida pero sin dueño: se reclama por la API y se libera por BD (la ficha queda en la ingesta). */
async function newUnclaimedProfile(): Promise<string> {
  const owner = await world.newUser();
  const handle = world.newHandle();
  await apiAs((await sessionFor(owner)).accessToken).claim(handle, 'creator');
  const released = await admin
    .from('profiles')
    .update({ status: 'unclaimed', owner_user_id: null })
    .eq('ig_handle', handle);
  expect(released.error).toBeNull();
  return handle;
}

async function submitRemoval(page: Page, handle: string, email: string): Promise<void> {
  await visit(page, `/exclusion/${handle}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(handle);
  await page.getByLabel('Correo de contacto').fill('no-es-un-correo');
  await page.getByRole('button', { name: 'Solicitar exclusión' }).click();
  await expect(page.locator('.field-error').first()).toBeVisible();
  await page.getByLabel('Correo de contacto').fill(email);
  await page.getByLabel('Motivo (opcional)').fill('No quiero aparecer en la plataforma');
  await page.getByRole('button', { name: 'Solicitar exclusión' }).click();
  await expect(page.getByText('Recibimos tu solicitud.')).toBeVisible();
}

const requestsFor = async (handle: string) =>
  (await admin.from('profile_removal_requests').select('email').eq('ig_handle', handle)).data ?? [];

test('E2E-09: el titular sin cuenta pide la exclusión: queda registrada para revisión', async ({
  browser,
  page,
  context,
}) => {
  const handle = await newUnclaimedProfile();
  const viewer = await world.newUser();
  await loginAs(context, viewer);
  await visit(page, `/perfil/${handle}`);
  await expect(page.getByText('Sin reclamar', { exact: true })).toBeVisible();

  // El titular NO tiene cuenta: contexto limpio, sin cookies.
  const anonymous = await browser.newContext();
  const form = await anonymous.newPage();
  await submitRemoval(form, handle, 'titular@ejemplo.example');
  await anonymous.close();
  expect(await requestsFor(handle)).toEqual([{ email: 'titular@ejemplo.example' }]);

  // No revela qué handles existen: un handle inexistente recibe la misma respuesta.
  const ghost = world.newHandle();
  const ghostCtx = await browser.newContext();
  await submitRemoval(await ghostCtx.newPage(), ghost, 'otro@ejemplo.example');
  await ghostCtx.close();
});

test('E2E-09: el titular verificado con sesión retira su ficha al instante y el handle se bloquea', async ({
  page,
  context,
}) => {
  const owner = await world.newUser();
  const handle = world.newHandle();
  await apiAs((await sessionFor(owner)).accessToken).claim(handle, 'creator');
  await loginAs(context, owner);
  await visit(page, `/perfil/${handle}`);
  await expect(page.getByText('Tu perfil', { exact: true })).toBeVisible();

  await submitRemoval(page, handle, 'titular@ejemplo.example');
  expect(await requestsFor(handle)).toHaveLength(1);

  // La ficha deja de mostrarse y el handle entra a la lista de bloqueo de la ingesta (RNF-05).
  await visit(page, `/perfil/${handle}`);
  await expect(page.getByRole('heading', { name: 'Perfil no encontrado' })).toBeVisible();
  // (Con ADAPTER_INGESTION=mock la lista de bloqueo vive en memoria: se comprueba por su efecto, no en la BD.)
  const retry = apiAs((await sessionFor(await world.newUser())).accessToken);
  await expect(retry.claim(handle, 'creator')).rejects.toThrow();
});

test('E2E-09: los textos legales son públicos', async ({ page }) => {
  await page.goto('/privacidad');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText('ARCO').first()).toBeVisible();
});
