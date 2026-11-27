import { expect, test } from '@playwright/test';
import { CONSENT_VERSION } from '@sponcer/contracts';
import { BASE_URL, E2E_EMAIL_DOMAIN } from './support/env';
import { magicLinkFor } from './support/mailpit';
import { createWorld, uniqueTag } from './support/world';

// E2E-01 (RF-03): login con enlace mágico real (correo en Mailpit) y panel vacío.
const world = createWorld();
test.afterAll(() => world.cleanup());

const HTTP_FOUND = 302;
// `site_url` y la lista de redirects de db/supabase/config.jsonc apuntan a :4321; si el correo vuelve allí,
// se reenvía el `code` al callback del frontend bajo prueba (el resto del flujo es el real).
const CONFIGURED_ORIGIN = 'http://localhost:4321/**';

test('E2E-01: enlace mágico real por Mailpit lleva a un panel vacío', async ({
  page,
  context,
  browserName,
}) => {
  const email = `e2e-${uniqueTag()}@${E2E_EMAIL_DOMAIN}`;
  world.trackEmail(email);

  const rewrites: string[] = [];
  await context.route(CONFIGURED_ORIGIN, (route) => {
    rewrites.push(route.request().url());
    const { search } = new URL(route.request().url());
    return route.fulfill({
      status: HTTP_FOUND,
      headers: { location: `${BASE_URL}/auth/callback${search}` },
    });
  });

  // Sin sesión, las rutas protegidas mandan a /login.
  await page.goto('/panel');
  await expect(page).toHaveURL(`${BASE_URL}/login`);

  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByRole('button', { name: 'Enviarme el enlace' }).click();
  await expect(page.getByRole('status')).toContainText('Revisa tu correo');

  // El navegador sigue el enlace del correo: Supabase verifica, redirige y la app canjea el código PKCE.
  await page.goto(await magicLinkFor(email));
  // ADR-009: la primera vez falta el registro; el onboarding se prueba en e2e-16. Aquí se completa por el BFF.
  await expect(page).toHaveURL(`${BASE_URL}/registro`);
  const registered = await page.request.post('/bff/register', {
    data: {
      body: {
        accountKind: 'influencer',
        influencer: { displayName: 'Persona E2E', city: 'lima' },
        acceptTerms: true,
        acceptPrivacy: true,
        consentVersion: CONSENT_VERSION,
      },
    },
  });
  expect(registered.ok()).toBe(true);
  await page.goto('/descubrir');
  await expect(page).toHaveURL(`${BASE_URL}/descubrir`);

  test.info().annotations.push({
    type: 'redirect-config',
    description:
      rewrites.length > 0
        ? 'Supabase redirigió a :4321 (allow-list); se reenvió al callback'
        : 'Supabase redirigió directo al origen de prueba',
  });

  const sessionCookie = (await context.cookies()).find((c) => c.name.endsWith('-auth-token'));
  expect(sessionCookie?.httpOnly).toBe(true);
  // WebKit informa `None` para cookies Lax en su API de cookies; el atributo real lo fija el servidor (`supabase.ts`).
  if (browserName !== 'webkit') expect(sessionCookie?.sameSite).toBe('Lax');

  await page.goto('/panel');
  await expect(page.getByRole('heading', { name: 'Mi panel' })).toBeVisible();
  await expect(page.getByText('Aún no tienes perfiles')).toBeVisible();
  await expect(page.getByText(`Sesión: ${email}`)).toBeVisible();

  // Cerrar sesión devuelve el panel a /login.
  await page.getByRole('button', { name: 'Salir' }).click();
  // Esperar a que termine el cierre de sesión (POST + redirección) antes de pedir una ruta protegida.
  await expect(page).toHaveURL(`${BASE_URL}/login`);
  await page.goto('/panel');
  await expect(page).toHaveURL(`${BASE_URL}/login`);
});
