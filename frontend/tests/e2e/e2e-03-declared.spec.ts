import { expect, test } from '@playwright/test';
import { apiAs } from './support/api';
import { loginAs, sessionFor } from './support/session';
import { visit } from './support/ui';
import { createWorld } from './support/world';

// E2E-03 (RF-05, RF-06, RF-07, RF-09): datos declarados + un servicio y la ficha se actualiza y reclasifica.
const world = createWorld();
test.afterAll(() => world.cleanup());

const PRICE_PEN = '350';
const H3 = 3;

test('E2E-03: declarar nichos y un servicio actualiza la ficha y reclasifica', async ({
  page,
  context,
}) => {
  const user = await world.newUser();
  const handle = world.newHandle();
  await apiAs((await sessionFor(user)).accessToken).claim(handle, 'creator');
  await loginAs(context, user);

  // Antes: ficha solo con lo ingerido, sin nichos declarados ni servicios.
  await visit(page, `/perfil/${handle}`);
  const niches = page.getByLabel('Nichos clasificados');
  // Aún sin nichos declarados no hay etiqueta "declarado en Sponcer".
  await expect(page.getByText('· declarado en Sponcer')).toHaveCount(0);
  await expect(page.getByText('Este creador aún no publica servicios.')).toBeVisible();

  await visit(page, '/panel');
  const declared = page.getByRole('form', { name: 'Datos declarados' });

  // Validación: al menos un nicho.
  await declared.getByRole('button', { name: 'Guardar datos' }).click();
  await expect(declared.locator('.field-error').first()).toBeVisible();

  await declared.getByLabel('Mascotas').check();
  await declared.getByLabel('Ciudad').fill('Arequipa');
  await declared.getByLabel('Descripción corta').fill('Cuento historias de mascotas');
  await declared.getByRole('button', { name: 'Guardar datos' }).click();
  await expect(declared.getByText('Datos guardados.')).toBeVisible();

  await page.getByText('Mis servicios').click();
  const services = page.getByRole('form', { name: 'Servicios' });
  await services.getByRole('button', { name: 'Agregar servicio' }).click();
  await services.getByLabel('Precio (S/)').fill(PRICE_PEN);
  await services.getByLabel('Descripción').fill('Reel de 30 segundos con tu producto');
  await services.getByRole('button', { name: 'Guardar servicios' }).click();
  await expect(services.getByText('Servicios guardados.')).toBeVisible();

  // Después: la ficha refleja lo declarado, el catálogo y la reclasificación (nicho declarado primero).
  await expect(async () => {
    await visit(page, `/perfil/${handle}`);
    await expect(niches).toContainText('Mascotas · declarado en Sponcer');
  }).toPass();
  const main = page.locator('#contenido');
  await expect(main.getByText('Ciudad: Arequipa')).toBeVisible();
  await expect(main.getByText('Cuento historias de mascotas')).toBeVisible();
  await expect(main.getByText('Reel de 30 segundos con tu producto')).toBeVisible();
  await expect(main.getByRole('heading', { level: H3, name: PRICE_PEN })).toBeVisible();
});

test('E2E-03: los datos declarados de otro perfil no se pueden editar (solo lectura ingerida)', async ({
  page,
  context,
}) => {
  const owner = await world.newUser();
  const other = await world.newUser();
  const handle = world.newHandle();
  const profileId = await apiAs((await sessionFor(owner)).accessToken).claim(handle, 'creator');
  await loginAs(context, other);

  // Ni la UI ofrece edición ni la API la permite al que no es titular.
  await visit(page, `/perfil/${handle}`);
  await expect(page.getByRole('form', { name: 'Datos declarados' })).toHaveCount(0);
  const denied = await apiAs((await sessionFor(other)).accessToken).call(
    'PATCH',
    `/api/v1/profiles/${profileId}/declared`,
    { role: 'creator', niches: ['moda'], accountType: 'creator' },
  );
  expect(denied.ok).toBe(false);
});
