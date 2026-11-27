import { expect, test, type BrowserContext } from '@playwright/test';
import { apiAs } from './support/api';
import { BASE_URL, E2E_ADMIN_EMAIL, E2E_EMAIL_DOMAIN } from './support/env';
import { magicLinkFor } from './support/mailpit';
import { loginAs, sessionFor } from './support/session';
import { visit } from './support/ui';
import { newAdmin } from './support/removals';
import { admin, createWorld, uniqueTag } from './support/world';

// F6 (ADR-008): altas manuales de administración contra el stack real (frontend en modo http + supabase, backend real
// con ingestion mock). El backend debe arrancar con ADMIN_EMAILS que incluya E2E_ADMIN_EMAIL y APP_URL permitido por
// Supabase (http://localhost:4321). Los enlaces de correo vuelven a :4321 (allow-list): se reenvían al frontend bajo prueba.
const world = createWorld();
const SECTIONS = ['exclusiones', 'perfiles', 'invitaciones', 'administradores'] as const;
const USERS_PAGE = 1000;
const MAIL_GAP_MS = 1500;
const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const HTTP_FORBIDDEN = 403;
const HTTP_FOUND = 302;
const CONFIGURED_ORIGIN = 'http://localhost:4321/**';
const MAIL_RECEIVED_TIMEOUT_MS = 20_000;
const E2E_ADMIN_IS_E2E_DOMAIN = E2E_ADMIN_EMAIL.endsWith(`@${E2E_EMAIL_DOMAIN}`);

/** El administrador de prueba existía antes de la corrida (si no, se borra al terminar aunque no sea del dominio e2e). */
let adminExisted = true;
test.beforeAll(async () => {
  const list = await admin.auth.admin.listUsers({ perPage: USERS_PAGE });
  adminExisted = list.data.users.some((u) => u.email === E2E_ADMIN_EMAIL);
});
test.afterAll(async () => {
  await admin.from('admin_users').delete().like('email', `%@${E2E_EMAIL_DOMAIN}`);
  if (!adminExisted && !E2E_ADMIN_IS_E2E_DOMAIN) {
    const list = await admin.auth.admin.listUsers({ perPage: USERS_PAGE });
    await Promise.all(
      list.data.users
        .filter((u) => u.email === E2E_ADMIN_EMAIL)
        .map((u) => admin.auth.admin.deleteUser(u.id)),
    );
  }
  await world.cleanup();
});

/** Los enlaces de Supabase vuelven a :4321; se reenvían (con su query) al callback del frontend bajo prueba. */
async function forwardConfiguredOrigin(context: BrowserContext) {
  await context.route(CONFIGURED_ORIGIN, (route) => {
    const { search } = new URL(route.request().url());
    return route.fulfill({
      status: HTTP_FOUND,
      headers: { location: `${BASE_URL}/auth/callback${search}` },
    });
  });
}

/** Ejecuta `fn` por cada elemento, uno tras otro (una sola página de Playwright no admite navegaciones en paralelo). */
const inSeries = <T>(items: readonly T[], fn: (item: T) => Promise<void>): Promise<void> =>
  items.reduce<Promise<void>>(async (prev, item) => (await prev, fn(item)), Promise.resolve());

const adminRowCount = async (email: string) =>
  (await admin.from('admin_users').select('email').eq('email', email)).data?.length ?? 0;

test.describe('F6 · quien no es administrador', () => {
  test('un usuario normal recibe 404 en las 4 secciones de /admin y 403 en los 5 endpoints', async ({
    page,
    context,
  }) => {
    const user = await world.newUser();
    await loginAs(context, user);
    await inSeries(SECTIONS, async (section) => {
      await page.goto(`/admin/${section}`);
      await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    });

    const victim = `e2e-victima-${uniqueTag()}@${E2E_EMAIL_DOMAIN}`;
    const api = apiAs((await sessionFor(user)).accessToken);
    const replies = await Promise.all([
      api.call('POST', '/api/v1/admin/profiles', { handle: world.newHandle(), role: 'creator' }),
      api.call('POST', '/api/v1/admin/invitations', { email: victim }),
      api.call('GET', '/api/v1/admin/admins'),
      api.call('POST', '/api/v1/admin/admins', { email: victim }),
      api.call('POST', '/api/v1/admin/admins/revoke', { email: E2E_ADMIN_EMAIL }),
    ]);
    expect(replies.map((r) => r.status)).toEqual(replies.map(() => HTTP_FORBIDDEN));
    expect(await adminRowCount(victim)).toBe(0);
  });

  // F6-M1 (corregido): el middleware responde 404 real a quien no es administrador en /admin/*.
  test('un usuario normal recibe HTTP 404 (no 200) en /admin/*', async ({ page, context }) => {
    await loginAs(context, await world.newUser());
    await inSeries(SECTIONS, async (section) => {
      const response = await page.goto(`/admin/${section}`);
      expect(response?.status(), section).toBe(HTTP_NOT_FOUND);
    });
  });

  test('una cuenta demo sembrada (usuario1@sponcer.local) recibe 404 en /admin/*', async ({
    page,
    context,
  }) => {
    const list = await admin.auth.admin.listUsers({ perPage: USERS_PAGE });
    const demo = list.data.users.find((u) => u.email === 'usuario1@sponcer.local');
    test.skip(!demo, 'La cuenta demo sembrada no existe en esta BD');
    await loginAs(context, { id: demo!.id, email: demo!.email! });
    await inSeries(SECTIONS, async (section) => {
      await page.goto(`/admin/${section}`);
      await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
    });
  });

  test('sin sesión, /admin/* redirige a /login', async ({ page }) => {
    await page.goto('/admin/administradores');
    await expect(page).toHaveURL(`${BASE_URL}/login`);
  });
});

test.describe('F6 · panel de administración', () => {
  test('el administrador entra por enlace mágico real y recorre las 4 secciones', async ({
    page,
    context,
  }) => {
    const { recognized } = await newAdmin(world);
    test.skip(!recognized, `El backend no tiene ${E2E_ADMIN_EMAIL} en ADMIN_EMAILS`);
    await forwardConfiguredOrigin(context);
    // `newAdmin` generó un enlace hace instantes: Supabase pide >1 s entre correos al mismo usuario (max_frequency).
    await page.waitForTimeout(MAIL_GAP_MS);
    await page.goto('/login');
    await page.getByLabel('Correo electrónico').fill(E2E_ADMIN_EMAIL);
    await page.getByRole('button', { name: 'Enviarme el enlace' }).click();
    await expect(page.getByRole('status')).toContainText('Revisa tu correo');
    await page.goto(await magicLinkFor(E2E_ADMIN_EMAIL));
    await expect(page).toHaveURL(`${BASE_URL}/descubrir`);

    await visit(page, '/admin');
    await expect(page).toHaveURL(`${BASE_URL}/admin/exclusiones`);
    const nav = page.getByRole('navigation', { name: 'Secciones de administración' });
    const tour = [
      ['Perfiles', 'perfiles'],
      ['Invitaciones', 'invitaciones'],
      ['Administradores', 'administradores'],
      ['Exclusiones', 'exclusiones'],
    ] as const;
    await inSeries(tour, async ([label, section]) => {
      await nav.getByRole('link', { name: label }).click();
      await expect(page).toHaveURL(`${BASE_URL}/admin/${section}`);
      await expect(nav.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });
    // Entrar al panel no deja la sesión del administrador en el HTML (cookie httpOnly).
    expect(await page.content()).not.toContain('access_token');
  });

  test('nombrar y quitar a un administrador: se refleja en su acceso al panel; el de .env no tiene "Quitar"', async ({
    page,
    context,
    browser,
  }) => {
    const { user: adminUser, recognized } = await newAdmin(world);
    test.skip(!recognized, `El backend no tiene ${E2E_ADMIN_EMAIL} en ADMIN_EMAILS`);
    const target = await world.newUser();
    await loginAs(context, adminUser);

    const other = await browser.newContext({ baseURL: BASE_URL });
    await loginAs(other, target);
    const otherPage = await other.newPage();
    await otherPage.goto('/admin/exclusiones');
    await expect(otherPage.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();

    await visit(page, '/admin/administradores');
    const envCard = page.getByRole('article').filter({ hasText: E2E_ADMIN_EMAIL });
    await expect(envCard.getByText('Fijo (.env)')).toBeVisible();
    await expect(envCard.getByRole('button', { name: 'Quitar administrador' })).toHaveCount(0);

    // Mayúsculas: el correo se normaliza y la lista no duplica.
    await page
      .getByLabel('Nombrar administrador por correo')
      .fill(target.email.toUpperCase().replace(E2E_EMAIL_DOMAIN.toUpperCase(), E2E_EMAIL_DOMAIN));
    await page.getByRole('button', { name: 'Nombrar administrador' }).click();
    await expect(page.getByText(`${target.email} ahora es administrador.`)).toBeVisible();
    const card = page.getByRole('article').filter({ hasText: target.email });
    await expect(card.getByText('Nombrado en la app')).toBeVisible();
    await expect(card.getByText(`por ${E2E_ADMIN_EMAIL}`)).toBeVisible();
    await expect.poll(() => adminRowCount(target.email)).toBe(1);

    // El nuevo administrador ve el panel con la MISMA sesión que antes (el rol no vive en el token).
    await otherPage.goto('/admin/exclusiones');
    await expect(otherPage.getByRole('heading', { name: 'Pedidos de exclusión' })).toBeVisible();

    await card.getByRole('button', { name: 'Quitar administrador' }).click();
    await card.getByRole('button', { name: 'Sí, quitar' }).click();
    await expect(page.getByText(`${target.email} ya no es administrador.`)).toBeVisible();
    await expect(card).toHaveCount(0);
    await expect.poll(() => adminRowCount(target.email)).toBe(0);
    await otherPage.goto('/admin/exclusiones');
    await expect(otherPage.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
    await other.close();
  });

  test('invitar: correo ficticio llega a Mailpit con enlace de verificación hacia /auth/callback; correo con cuenta recibe enlace de acceso', async ({
    page,
    context,
  }) => {
    const { user: adminUser, recognized } = await newAdmin(world);
    test.skip(!recognized, `El backend no tiene ${E2E_ADMIN_EMAIL} en ADMIN_EMAILS`);
    await loginAs(context, adminUser);
    const fresh = `e2e-invitado-${uniqueTag()}@${E2E_EMAIL_DOMAIN}`;
    world.trackEmail(fresh);
    await visit(page, '/admin/invitaciones');
    await page.getByLabel('Correo electrónico').fill(fresh);
    await page.getByRole('button', { name: 'Enviar invitación' }).click();
    await expect(page.getByText(`Invitación enviada a ${fresh}.`)).toBeVisible();
    const link = await magicLinkFor(fresh);
    expect(new URL(link).searchParams.get('type')).toBe('invite');
    expect(new URL(link).pathname).toBe('/auth/callback');

    const existing = await world.newUser();
    await page.getByLabel('Correo electrónico').fill(existing.email);
    await page.getByRole('button', { name: 'Enviar invitación' }).click();
    await expect(page.getByText(`${existing.email} ya tiene cuenta`)).toBeVisible();
    const access = await magicLinkFor(existing.email);
    expect(new URL(access).pathname).toBe('/auth/callback');
    expect(new URL(access).searchParams.get('type')).toBe('email');

    await page.getByLabel('Correo electrónico').fill('esto-no-es-un-correo');
    await page.getByRole('button', { name: 'Enviar invitación' }).click();
    await expect(page.getByText('Escribe un correo válido.')).toBeVisible();
  });

  // F6-A2 (corregido): las plantillas del correo apuntan a /auth/callback?token_hash=...&type=... y el callback usa verifyOtp.
  test('la persona invitada que sigue el enlace del correo queda con sesión (en el registro, ADR-009)', async ({
    page,
    context,
  }) => {
    const { user: adminUser, recognized } = await newAdmin(world);
    test.skip(!recognized, `El backend no tiene ${E2E_ADMIN_EMAIL} en ADMIN_EMAILS`);
    const token = (await sessionFor(adminUser)).accessToken;
    const fresh = `e2e-acepta-${uniqueTag()}@${E2E_EMAIL_DOMAIN}`;
    world.trackEmail(fresh);
    const sent = await apiAs(token).call('POST', '/api/v1/admin/invitations', { email: fresh });
    expect(sent.status).toBe(HTTP_OK);
    // El navegador de la persona invitada: contexto limpio, sin sesión.
    await context.clearCookies();
    await forwardConfiguredOrigin(context);
    const link = await magicLinkFor(fresh);
    await page.goto(link);
    // ADR-009: la persona invitada es nueva y aterriza en el onboarding (con sesión).
    await expect(page).toHaveURL(`${BASE_URL}/registro`, { timeout: MAIL_RECEIVED_TIMEOUT_MS });
    const cookie = (await context.cookies()).find((c) => c.name.endsWith('-auth-token'));
    expect(cookie?.httpOnly).toBe(true);
    await expect(page.getByText(`Sesión: ${fresh}`)).toBeVisible();
    // El enlace es de un solo uso: repetirlo (otra persona o un escáner) no abre otra sesión.
    await context.clearCookies();
    const again = await context.request.get(link, { maxRedirects: 0 });
    expect(again.status()).toBe(HTTP_FOUND);
    expect(again.headers().location).toBe('/login?error=enlace');
  });

  test('un usuario existente entra con el enlace mágico del login (plantilla magic_link)', async ({
    page,
    context,
  }) => {
    const user = await world.newUser();
    await page.goto('/login');
    await page.getByLabel('Correo electrónico').fill(user.email);
    await page.getByRole('button', { name: 'Enviarme el enlace' }).click();
    await expect(page.getByRole('status')).toContainText('Revisa tu correo');
    const link = await magicLinkFor(user.email);
    expect(new URL(link).pathname).toBe('/auth/callback');
    expect(new URL(link).searchParams.get('type')).toBe('email');
    await page.goto(link);
    await expect(page).toHaveURL(`${BASE_URL}/registro`);
    expect((await context.cookies()).some((c) => c.name.endsWith('-auth-token'))).toBe(true);
  });

  test('alta por @handle: crea la ficha previa, rechaza duplicados y respeta exclusiones y cuentas no profesionales', async ({
    page,
    context,
  }) => {
    const { user: adminUser, recognized } = await newAdmin(world);
    test.skip(!recognized, `El backend no tiene ${E2E_ADMIN_EMAIL} en ADMIN_EMAILS`);
    await loginAs(context, adminUser);
    const handle = world.newHandle();
    await visit(page, '/admin/perfiles');

    await page.getByLabel('@handle de Instagram').fill(`@${handle}`);
    await page.getByLabel('Rol de la ficha').selectOption('brand');
    await page.getByRole('button', { name: 'Agregar ficha' }).click();
    await expect(page.getByText(`(@${handle})`)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ver el perfil' })).toHaveAttribute(
      'href',
      `/perfil/${handle}`,
    );
    const row = await admin.from('profiles').select('*').eq('ig_handle', handle).single();
    expect(row.data).toMatchObject({ role: 'brand', status: 'unclaimed', owner_user_id: null });
    await page.getByRole('link', { name: 'Ver el perfil' }).click();
    await expect(
      page.getByRole('heading', { name: new RegExp(handle.replace('.', '\\.')) }).first(),
    ).toBeVisible();

    await visit(page, '/admin/perfiles');
    await page.getByLabel('@handle de Instagram').fill(handle);
    await page.getByRole('button', { name: 'Agregar ficha' }).click();
    await expect(page.getByRole('alert')).toContainText('Ya existe una ficha');

    // ARCO: un handle excluido a pedido del titular (aplicado por un administrador) no se puede fichar.
    const blocked = world.newHandle();
    const api = apiAs((await sessionFor(adminUser)).accessToken);
    const requested = await apiAs(null).call(
      'POST',
      `/api/v1/profiles/${blocked}/removal-requests`,
      { email: 'titular@correo.pe' },
    );
    expect(requested.status).toBe(HTTP_OK);
    const pending = await api.call<{ items: Array<{ id: string; igHandle: string }> }>(
      'GET',
      '/api/v1/admin/removal-requests?limit=50',
    );
    const request = pending.body.items.find((r) => r.igHandle === blocked);
    const applied = await api.call('POST', `/api/v1/admin/removal-requests/${request?.id}/review`, {
      decision: 'apply',
    });
    expect(applied.status).toBe(HTTP_OK);
    await page.getByLabel('@handle de Instagram').fill(blocked);
    await page.getByRole('button', { name: 'Agregar ficha' }).click();
    await expect(page.getByRole('alert')).toContainText('excluido a pedido del titular');
    expect((await admin.from('profiles').select('id').eq('ig_handle', blocked)).data).toEqual([]);

    // Validación en el cliente: handle vacío.
    await page.getByLabel('@handle de Instagram').fill('');
    await page.getByRole('button', { name: 'Agregar ficha' }).click();
    await expect(page.getByLabel('@handle de Instagram')).toHaveAttribute('aria-invalid', 'true');
  });
});

test.describe('F6 · CSRF del BFF', () => {
  test('los POST de administración cross-site (formulario/text-plain o sin Origin ni Sec-Fetch-Site) no se aceptan', async ({
    context,
  }) => {
    const { user: adminUser, recognized } = await newAdmin(world);
    test.skip(!recognized, `El backend no tiene ${E2E_ADMIN_EMAIL} en ADMIN_EMAILS`);
    await loginAs(context, adminUser);
    const victim = `e2e-csrf-${uniqueTag()}@${E2E_EMAIL_DOMAIN}`;
    const payload = JSON.stringify({ body: { email: victim } });
    const url = `${BASE_URL}/bff/adminGrantAdmin`;
    const attempts: Array<Record<string, string>> = [
      { 'content-type': 'text/plain', origin: 'https://evil.example' },
      { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://evil.example' },
      { 'content-type': 'text/plain', origin: 'null' },
      { 'content-type': 'text/plain', 'sec-fetch-site': 'cross-site' },
      { 'content-type': 'text/plain' },
    ];
    await inSeries(attempts, async (headers) => {
      const res = await context.request.post(url, { headers, data: payload });
      expect(res.status(), JSON.stringify(headers)).toBe(HTTP_FORBIDDEN);
    });
    expect(await adminRowCount(victim)).toBe(0);

    // Control: la misma petición same-origin (la que hace la isla) sí funciona.
    const ok = await context.request.post(url, {
      headers: { 'content-type': 'application/json', origin: BASE_URL },
      data: payload,
    });
    expect(ok.status()).toBe(HTTP_OK);
    expect(await adminRowCount(victim)).toBe(1);
  });
});
