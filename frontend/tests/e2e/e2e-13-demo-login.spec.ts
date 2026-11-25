import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { BASE_URL, E2E_DEMO_ACCOUNT, E2E_DEMO_PASSWORD } from './support/env';
import { admin } from './support/world';

// F5 (ADR-007): acceso demo en /login. Requiere el frontend con PUBLIC_DEMO_LOGIN=true y DEMO_PASSWORD = E2E_DEMO_PASSWORD;
// si no, se salta. Fija la contraseña de UNA cuenta sembrada y al final la reemplaza por una aleatoria
// (el seed la dejó vacía: el acceso por enlace mágico no la usa).
const USERS_PAGE_SIZE = 1000;
const HTTP_SEE_OTHER = 303;
let touchedUserId: string | null = null;

async function setPassword(password: string): Promise<void> {
  const list = await admin.auth.admin.listUsers({ perPage: USERS_PAGE_SIZE });
  const user = list.data.users.find((u) => u.email === E2E_DEMO_ACCOUNT);
  if (!user) throw new Error(`No existe la cuenta sembrada ${E2E_DEMO_ACCOUNT}`);
  const res = await admin.auth.admin.updateUserById(user.id, { password });
  expect(res.error).toBeNull();
  touchedUserId = user.id;
}

test.afterAll(async () => {
  if (touchedUserId)
    await admin.auth.admin.updateUserById(touchedUserId, { password: randomUUID() });
});

test('F5 demo: /login ofrece cuentas demo, entra con la elegida y no filtra la contraseña', async ({
  page,
  context,
  request,
}) => {
  await page.goto('/login');
  const demo = page.getByRole('form', { name: 'Acceso de demostración' });
  test.skip((await demo.count()) === 0, 'El frontend no tiene el acceso demo activado');

  expect(await page.content()).not.toContain(E2E_DEMO_PASSWORD);
  await setPassword(E2E_DEMO_PASSWORD);

  await demo.getByLabel('Cuenta').selectOption(E2E_DEMO_ACCOUNT);
  await demo.getByRole('button', { name: 'Entrar con la cuenta elegida' }).click();
  await expect(page).toHaveURL(`${BASE_URL}/descubrir`);
  const session = (await context.cookies()).find((c) => c.name.endsWith('-auth-token'));
  expect(session?.httpOnly).toBe(true);

  await page.goto('/panel');
  await expect(page.getByText(`Sesión: ${E2E_DEMO_ACCOUNT}`)).toBeVisible();

  // Solo cuentas demo: otro correo no inicia sesión y vuelve a /login con aviso.
  const other = await request.post(`${BASE_URL}/auth/demo-login`, {
    form: { email: 'otra.persona@ejemplo.example' },
    maxRedirects: 0,
  });
  expect(other.status()).toBe(HTTP_SEE_OTHER);
  expect(other.headers().location).toBe('/login?demo=error');
});
