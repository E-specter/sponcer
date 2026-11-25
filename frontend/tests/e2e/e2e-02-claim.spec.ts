import { expect, test } from '@playwright/test';
import { apiAs } from './support/api';
import { loginAs, sessionFor } from './support/session';
import { visit, waitHydrated } from './support/ui';
import { createWorld } from './support/world';

// E2E-02 (RF-02, RF-04): reclamar un @handle nuevo, obtener el código, verificar (ingesta mock) y ver el perfil vinculado.
const world = createWorld();
test.afterAll(() => world.cleanup());

// Código de reclamo: "sponcer-" + 6 caracteres sin ambiguos (CLAIM_CODE_REGEX del contrato).
const CODE_FORMAT = 'sponcer-';
const CODE_SUFFIX_LENGTH = 6;
const CODE_LENGTH = CODE_FORMAT.length + CODE_SUFFIX_LENGTH;

test('E2E-02: reclamar handle, recibir código y verificar deja el perfil vinculado', async ({
  page,
  context,
}) => {
  const user = await world.newUser();
  const handle = world.newHandle();
  await loginAs(context, user);

  await visit(page, '/panel');
  await expect(page.getByText('Aún no tienes perfiles')).toBeVisible();

  // Validación en el borde: un handle inválido no llega a la API.
  await page.getByLabel('Tu @handle de Instagram').fill('Nombre con espacios!');
  await page.getByRole('button', { name: 'Obtener código' }).click();
  await expect(page.getByText('Handle de Instagram inválido')).toBeVisible();

  await page.getByLabel('Tu @handle de Instagram').fill(`@${handle}`);
  await page.getByLabel('Quiero usarlo como').selectOption('creator');
  await page.getByRole('button', { name: 'Obtener código' }).click();

  const code = page.locator('#claim-code');
  await expect(code).toBeVisible();
  const text = (await code.textContent()) ?? '';
  expect(text.startsWith(CODE_FORMAT)).toBe(true);
  expect(text).toHaveLength(CODE_LENGTH);
  await expect(page.getByText(`@${handle}`).first()).toBeVisible();

  // Ingesta mock: el backend ya pegó el código en la bio "en vivo" del handle.
  await page.getByRole('button', { name: 'Verificar' }).click();
  await expect(page.getByText('¡Verificado! El perfil ya es tuyo.')).toBeVisible();

  await page.getByRole('button', { name: 'Actualizar mi panel' }).click();
  await waitHydrated(page);
  const title = page.getByRole('heading', { level: 3, name: `@${handle}` });
  await expect(title.locator('.badge').first()).toHaveText('Creador');
  await expect(title.locator('.badge-success')).toHaveText('Verificado');

  // La ficha pública del perfil lo reconoce como propio y verificado.
  await visit(page, `/perfil/${handle}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText('Tu perfil', { exact: true })).toBeVisible();
  await expect(page.getByText('Verificado', { exact: true }).first()).toBeVisible();
});

test('E2E-02: otro usuario no puede reclamar un handle ya verificado', async ({
  page,
  context,
}) => {
  const owner = await world.newUser();
  const intruder = await world.newUser();
  const handle = world.newHandle();
  await apiAs((await sessionFor(owner)).accessToken).claim(handle, 'creator');

  await loginAs(context, intruder);
  await visit(page, '/panel');
  await page.getByLabel('Tu @handle de Instagram').fill(handle);
  await page.getByRole('button', { name: 'Obtener código' }).click();
  // Iniciar el reclamo no cede nada: la verificación es la que rechaza al intruso.
  await page.getByRole('button', { name: 'Verificar' }).click();
  await expect(page.getByText('Este perfil ya fue reclamado por otra persona.')).toBeVisible();
  await visit(page, '/panel');
  await expect(page.getByText(`@${handle}`)).toHaveCount(0);
});
