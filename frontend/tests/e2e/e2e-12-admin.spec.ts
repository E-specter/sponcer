import { expect, test } from '@playwright/test';
import { apiAs } from './support/api';
import { BASE_URL, E2E_ADMIN_EMAIL } from './support/env';
import { loginAs, sessionFor } from './support/session';
import { visit } from './support/ui';
import { newAdmin, profileWithPendingRequest } from './support/removals';
import { admin, createWorld } from './support/world';

// F5: panel /admin/exclusiones (solo administradores: el backend arranca con ADMIN_EMAILS que incluya el correo de prueba).
const world = createWorld();
test.afterAll(() => world.cleanup());

const HTTP_NOT_FOUND = 404;
const DENIED = [401, 403, 404] as const;

const statusOf = async (requestId: string) =>
  (
    await admin
      .from('profile_removal_requests')
      .select('status')
      .eq('id', requestId)
      .single<{ status: string }>()
  ).data?.status;

test('F5 admin: un usuario que no es administrador recibe 404 en la página y en la API', async ({
  page,
  context,
}) => {
  const user = await world.newUser();
  await loginAs(context, user);

  const response = await page.goto('/admin/exclusiones');
  expect(response?.status()).toBe(HTTP_NOT_FOUND);
  await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
  await expect(page.getByText('Pedidos de exclusión')).toHaveCount(0);

  const token = (await sessionFor(user)).accessToken;
  const list = await apiAs(token).call('GET', '/api/v1/admin/removal-requests');
  expect(DENIED).toContain(list.status);
  const review = await apiAs(token).call(
    'POST',
    '/api/v1/admin/removal-requests/00000000-0000-0000-0000-000000000000/review',
    { decision: 'apply' },
  );
  expect(DENIED).toContain(review.status);
});

test('F5 admin: el administrador cancela, aplica con confirmación y la ficha deja de verse; rechaza otra', async ({
  page,
  context,
  browser,
}) => {
  const { user: adminUser, recognized } = await newAdmin(world);
  test.skip(!recognized, `El backend no tiene ${E2E_ADMIN_EMAIL} en ADMIN_EMAILS`);

  const toApply = await profileWithPendingRequest(world);
  const toReject = await profileWithPendingRequest(world);
  await loginAs(context, adminUser);
  await visit(page, '/admin/exclusiones');
  await expect(page.getByRole('heading', { name: 'Pedidos de exclusión' })).toBeVisible();

  const requestFor = (handle: string) =>
    page.getByRole('article').filter({ has: page.getByRole('heading', { name: `@${handle}` }) });
  const applyCard = requestFor(toApply.creator.handle);
  await expect(applyCard).toBeVisible();
  await expect(applyCard.getByText('Pendiente')).toBeVisible();
  await expect(applyCard.getByText('Pido la baja de mi ficha')).toBeVisible();

  // Cancelar la confirmación no cambia nada.
  await applyCard.getByRole('button', { name: 'Aplicar exclusión' }).click();
  await expect(applyCard.getByText('Esto no se puede deshacer')).toBeVisible();
  await applyCard.getByRole('button', { name: 'Cancelar' }).click();
  await expect(applyCard.getByRole('button', { name: 'Aplicar exclusión' })).toBeVisible();
  expect(await statusOf(toApply.requestId)).toBe('pending');

  // Aplicar exige confirmar explícitamente; con ella el pedido sale de "Pendiente".
  await applyCard.getByRole('button', { name: 'Aplicar exclusión' }).click();
  await applyCard.getByLabel('Nota (opcional)').fill('Titular verificado por correo');
  await applyCard.getByRole('button', { name: 'Sí, aplicar exclusión' }).click();
  await expect(page.getByText(`Exclusión aplicada para @${toApply.creator.handle}.`)).toBeVisible();
  await expect(applyCard).toHaveCount(0);
  await expect.poll(() => statusOf(toApply.requestId)).toBe('applied');

  // La ficha excluida ya no se muestra a nadie y el handle no puede volver a reclamarse.
  const viewer = await browser.newContext({ baseURL: BASE_URL });
  const viewerPage = await viewer.newPage();
  await loginAs(viewer, await world.newUser());
  await visit(viewerPage, `/perfil/${toApply.creator.handle}`);
  await expect(viewerPage.getByRole('heading', { name: 'Perfil no encontrado' })).toBeVisible();
  await viewer.close();

  // Rechazar: la ficha se mantiene y el pedido queda "Rechazada" con su nota.
  const rejectCard = requestFor(toReject.creator.handle);
  await rejectCard.getByRole('button', { name: 'Rechazar' }).click();
  await expect(rejectCard.getByText('La ficha se mantiene')).toBeVisible();
  await rejectCard.getByLabel('Nota (opcional)').fill('No se pudo verificar al titular');
  await rejectCard.getByRole('button', { name: 'Confirmar rechazo' }).click();
  await expect(page.getByText(`Pedido de @${toReject.creator.handle} rechazado.`)).toBeVisible();
  await expect.poll(() => statusOf(toReject.requestId)).toBe('rejected');
  const stillThere = await toReject.creator.api.profile(toReject.creator.handle);
  expect(stillThere.handle).toBe(toReject.creator.handle);

  await page.getByLabel('Estado').selectOption({ label: 'Rechazada' });
  await expect(
    requestFor(toReject.creator.handle).getByText('No se pudo verificar al titular'),
  ).toBeVisible();
});
