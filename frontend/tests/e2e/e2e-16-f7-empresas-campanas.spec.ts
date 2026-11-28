import { expect, test, type Page } from '@playwright/test';
import { CONSENT_VERSION } from '@sponcer/contracts';
import { apiAs, randomRuc } from './support/api';
import { newBrand, newCreator } from './support/actors';
import {
  BASE_URL,
  DEMO_PASSWORD_TO_RESTORE,
  E2E_DEMO_PASSWORD,
  E2E_EMAIL_DOMAIN,
} from './support/env';
import { magicLinkFor } from './support/mailpit';
import { loginAs, sessionFor } from './support/session';
import { visit, waitHydrated } from './support/ui';
import { admin, createWorld, uniqueTag } from './support/world';

/**
 * F7 (ADR-009), E2E contra el stack real: registro completo (Empresa e Influencer) con enlace mágico real,
 * acceso demo por tipo, campañas, cotización múltiple sin match, avance por campaña y Visibilidad.
 */
const world = createWorld();
test.afterAll(() => world.cleanup());

const HTTP_FOUND = 302;
const HTTP_OK = 200;
const HTTP_CONFLICT = 409;
const HTTP_FORBIDDEN = 403;
const HTTP_BAD_REQUEST = 400;
const CONFIGURED_ORIGIN = 'http://localhost:4321/**';
const USERS_PAGE_SIZE = 1000;
const INVALID_RUC = '20100070971';
const DEMO_ACCOUNTS = [
  { email: 'demo@sponcer.local', kind: 'Empresa', section: 'Mis marcas' },
  { email: 'demo-influencer@sponcer.local', kind: 'Influencer', section: 'Mis cuentas' },
] as const;

/** Entra con un correo nuevo por el enlace mágico real (Mailpit); Supabase puede redirigir a :4321 (allow-list). */
async function magicLogin(page: Page, email: string): Promise<void> {
  world.trackEmail(email);
  await page.context().route(CONFIGURED_ORIGIN, (route) => {
    const { search } = new URL(route.request().url());
    return route.fulfill({
      status: HTTP_FOUND,
      headers: { location: `${BASE_URL}/auth/callback${search}` },
    });
  });
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByRole('button', { name: 'Enviarme el enlace' }).click();
  await expect(page.getByRole('status')).toContainText('Revisa tu correo');
  await page.goto(await magicLinkFor(email));
}

/** Pasos 3 y 4 del registro: consentimiento y primer perfil (reclamo con la ingesta mock). */
async function consentAndClaim(page: Page, handle: string): Promise<void> {
  await page.getByLabel(/Acepto los/).check();
  await page.getByLabel(/Acepto la/).check();
  await page.getByRole('button', { name: 'Crear mi cuenta' }).click();
  await expect(page.getByRole('heading', { name: 'Tu primer perfil' })).toBeVisible();
  await page.getByLabel('Tu @handle de Instagram').fill(`@${handle}`);
  await page.getByRole('button', { name: 'Obtener código' }).click();
  await expect(page.locator('#claim-code')).toBeVisible();
  await page.getByRole('button', { name: 'Verificar' }).click();
  await expect(page.getByText('¡Verificado! El perfil ya es tuyo.')).toBeVisible();
  await page.getByRole('link', { name: 'Ir a mi panel' }).click();
  await expect(page).toHaveURL(`${BASE_URL}/panel`);
}

test('E2E-16: registro completo como Empresa (enlace mágico, RUC con dígito verificador, consentimiento y marca)', async ({
  page,
}) => {
  const email = `e2e-${uniqueTag()}@${E2E_EMAIL_DOMAIN}`;
  const handle = world.newHandle();
  const ruc = randomRuc();
  await magicLogin(page, email);
  // Sin registro, toda ruta protegida lleva al onboarding.
  await expect(page).toHaveURL(`${BASE_URL}/registro`);
  await waitHydrated(page);
  for (const path of ['/panel', '/descubrir', '/campanas', '/visibilidad']) {
    await page.goto(path);
    await expect(page).toHaveURL(`${BASE_URL}/registro`);
  }
  await waitHydrated(page);

  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByText('Elige el tipo de cuenta.')).toBeVisible();
  await page.getByRole('radio', { name: /^Empresa/ }).check();
  await page.getByRole('button', { name: 'Continuar' }).click();

  // RUC con dígito verificador equivocado: error en vivo y no avanza.
  await page.getByLabel('Número de RUC').fill(INVALID_RUC);
  await expect(page.getByText('El RUC no es válido')).toBeVisible();
  await page.getByLabel('Razón social').fill('Empresa E2E S.A.C.');
  await page.getByLabel('Ciudad').selectOption('lima');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('heading', { name: 'Tus datos' })).toBeVisible();
  // RUC 10… no sirve para persona jurídica.
  await page.getByLabel('Número de RUC').fill('10100070971');
  await expect(page.getByText(/empieza con 20/).last()).toBeVisible();

  await page.getByLabel('Número de RUC').fill(ruc);
  await page.getByLabel('Nombre comercial (opcional)').fill('Marca E2E');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('heading', { name: 'Consentimiento' })).toBeVisible();
  // Sin aceptar no se registra.
  await page.getByRole('button', { name: 'Crear mi cuenta' }).click();
  await expect(page.getByText('acepta los términos y la política de privacidad')).toBeVisible();
  await consentAndClaim(page, handle);

  await expect(page.getByRole('heading', { name: 'Mis marcas' })).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 3, name: new RegExp(`@${handle}`) }),
  ).toBeVisible();

  // En la BD: empresa con su documento, consentimiento con versión y marca ligada a la empresa.
  const user = (await admin.auth.admin.listUsers({ perPage: USERS_PAGE_SIZE })).data.users.find(
    (u) => u.email === email,
  )!;
  const company = await admin.from('companies').select('*').eq('owner_user_id', user.id).single();
  expect(company.data).toMatchObject({
    document_number: ruc,
    person_type: 'juridica',
    city: 'lima',
  });
  const consent = await admin.from('consents').select('*').eq('user_id', user.id);
  expect(consent.data).toMatchObject([{ version: CONSENT_VERSION, terms: true, privacy: true }]);
  const profile = await admin
    .from('profiles')
    .select('company_id, role')
    .eq('ig_handle', handle)
    .single();
  expect(profile.data).toMatchObject({ company_id: company.data?.id, role: 'brand' });

  // El tipo es exclusivo: ni el onboarding (redirige al panel) ni la API permiten cambiarlo.
  await page.goto('/registro');
  await expect(page).toHaveURL(`${BASE_URL}/panel`);
  const api = apiAs((await sessionFor({ id: user.id, email })).accessToken);
  const again = await api.call<unknown>('POST', '/api/v1/registration', {
    accountKind: 'influencer',
    influencer: { displayName: 'Cambio de tipo', city: 'lima' },
    acceptTerms: true,
    acceptPrivacy: true,
    consentVersion: CONSENT_VERSION,
  });
  expect(again.status).toBe(HTTP_CONFLICT);
  // Una Empresa no es dueña de cuentas de creador: el reclamo de rol creator se rechaza.
  const wrongRole = await api.call<unknown>('POST', '/api/v1/claims', {
    handle: world.newHandle(),
    role: 'creator',
  });
  expect(wrongRole.status).toBe(HTTP_BAD_REQUEST);
  // Un documento ya registrado no se repite (otro usuario).
  const other = await world.newUser();
  const dup = await apiAs((await sessionFor(other)).accessToken).call<unknown>(
    'POST',
    '/api/v1/registration',
    {
      accountKind: 'company',
      company: {
        personType: 'juridica',
        documentType: 'ruc',
        documentNumber: ruc,
        legalName: 'Otra empresa',
        city: 'lima',
      },
      acceptTerms: true,
      acceptPrivacy: true,
      consentVersion: CONSENT_VERSION,
    },
  );
  expect(dup.status).toBe(HTTP_CONFLICT);
});

test('E2E-16: registro completo como Influencer (enlace mágico, datos, consentimiento y cuenta de Instagram)', async ({
  page,
}) => {
  const email = `e2e-${uniqueTag()}@${E2E_EMAIL_DOMAIN}`;
  const handle = world.newHandle();
  await magicLogin(page, email);
  await expect(page).toHaveURL(`${BASE_URL}/registro`);
  await waitHydrated(page);
  await page.getByRole('radio', { name: /^Influencer/ }).check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  // Datos obligatorios.
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('.field-error').first()).toBeVisible();
  await page.getByLabel('Tu nombre').fill('Influencer E2E');
  await page.getByLabel('Ciudad').selectOption('cusco');
  await page.getByLabel('Sobre mí (opcional)').fill('Viajes y comida');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await consentAndClaim(page, handle);

  await expect(page.getByRole('heading', { name: 'Mis cuentas' })).toBeVisible();
  const user = (await admin.auth.admin.listUsers({ perPage: USERS_PAGE_SIZE })).data.users.find(
    (u) => u.email === email,
  )!;
  const account = await admin.from('accounts').select('*').eq('user_id', user.id).single();
  expect(account.data).toMatchObject({
    account_kind: 'influencer',
    display_name: 'Influencer E2E',
    city: 'cusco',
  });
  expect((await admin.from('companies').select('id').eq('owner_user_id', user.id)).data).toEqual(
    [],
  );
  const row = await admin
    .from('profiles')
    .select('company_id, role')
    .eq('ig_handle', handle)
    .single();
  expect(row.data).toMatchObject({ company_id: null, role: 'creator' });
  // Un influencer no puede crear campañas ni abrir /campanas (lo lleva al panel).
  await page.goto('/campanas');
  await expect(page).toHaveURL(`${BASE_URL}/panel`);
  const api = apiAs((await sessionFor({ id: user.id, email })).accessToken);
  const asBrand = await api.call<unknown>('POST', '/api/v1/claims', {
    handle: world.newHandle(),
    role: 'brand',
  });
  expect(asBrand.status).toBe(HTTP_BAD_REQUEST);
});

test('E2E-16: acceso demo con una cuenta Empresa y una Influencer', async ({ page, context }) => {
  await page.goto('/login');
  const demo = page.getByRole('form', { name: 'Acceso de demostración' });
  test.skip((await demo.count()) === 0, 'El frontend no tiene el acceso demo activado');
  const list = await admin.auth.admin.listUsers({ perPage: USERS_PAGE_SIZE });
  const ids = DEMO_ACCOUNTS.map((a) => list.data.users.find((u) => u.email === a.email));
  test.skip(
    ids.some((u) => !u),
    'Faltan las cuentas demo del seed nuevo',
  );
  try {
    await Promise.all(
      ids.map((u) => admin.auth.admin.updateUserById(u!.id, { password: E2E_DEMO_PASSWORD })),
    );
    // Las dos opciones del selector son una de cada tipo.
    const options = await demo.getByLabel('Cuenta').locator('option').allTextContents();
    expect(options.join(' | ')).toMatch(/Empresa demo.*\|.*Influencer demo/);
    for (const account of DEMO_ACCOUNTS) {
      await page.waitForLoadState('networkidle');
      await context.clearCookies();
      await page.goto('/login', { waitUntil: 'domcontentloaded' });
      await demo.getByLabel('Cuenta').selectOption(account.email);
      await demo.getByRole('button', { name: 'Entrar con la cuenta elegida' }).click();
      await expect(page).toHaveURL(`${BASE_URL}/descubrir`);
      await visit(page, '/panel');
      await expect(page.getByRole('heading', { name: account.section })).toBeVisible();
      await expect(page.getByText(`${account.kind} `).first()).toBeVisible();
      await expect(page.getByText(`Sesión: ${account.email}`)).toBeVisible();
      // La Empresa demo tiene dos marcas (ADR-009 punto 6); el Influencer, ninguna campaña.
      if (account.kind === 'Empresa')
        await expect(page.getByRole('article').filter({ hasText: 'Marca' })).toHaveCount(2);
      await page.goto('/campanas');
      await expect(page).toHaveURL(
        account.kind === 'Empresa' ? `${BASE_URL}/campanas` : `${BASE_URL}/panel`,
      );
    }
  } finally {
    // Deja las cuentas con la contraseña de demo de backend/.env (o una aleatoria si no se conoce).
    const restore = DEMO_PASSWORD_TO_RESTORE ?? `${uniqueTag()}-${uniqueTag()}`;
    await Promise.all(
      ids.map((u) => admin.auth.admin.updateUserById(u!.id, { password: restore })),
    );
  }
});

test('E2E-16: campaña, cotización a dos influencers sin match (uno con servicio, otro propuesta abierta) y avance', async ({
  browser,
}) => {
  const [brand, withService, openOnly] = [
    await newBrand(world),
    await newCreator(world),
    await newCreator(world, { services: [] }),
  ];
  const brandCtx = await browser.newContext();
  const brandPage = await brandCtx.newPage();
  await loginAs(brandCtx, brand.user);

  // Crear y activar la campaña desde la UI.
  await visit(brandPage, '/campanas');
  await brandPage.getByRole('button', { name: 'Nueva campaña' }).click();
  const form = brandPage.getByRole('form', { name: 'Nueva campaña' });
  await form.getByRole('button', { name: 'Crear campaña' }).click();
  await expect(form.locator('.field-error').first()).toBeVisible();
  await form.getByLabel('Nombre de la campaña').fill('Verano E2E');
  await form.getByLabel('Presupuesto en S/ (opcional)').fill('5000');
  await form.getByLabel('Activar al crear').check();
  await form.getByRole('button', { name: 'Crear campaña' }).click();
  await brandPage.getByRole('link', { name: 'Verano E2E' }).click();
  await expect(brandPage.getByRole('heading', { level: 1, name: 'Verano E2E' })).toBeVisible();
  await waitHydrated(brandPage);

  // Elegir a los dos influencers (la selección persiste entre búsquedas) y cotizar.
  const search = brandPage.getByLabel('Buscar influencers');
  for (const c of [withService, openOnly]) {
    await search.fill(c.handle);
    await brandPage
      .getByRole('checkbox', { name: new RegExp(`@${c.handle.replaceAll('.', '\\.')}`) })
      .check();
  }
  await brandPage.getByRole('button', { name: 'Continuar con 2 influencers' }).click();
  const serviceSelect = brandPage.getByLabel(`Servicio para @${withService.handle}`);
  const serviceId = (await withService.api.profile(withService.handle)).services[0]!.id;
  await serviceSelect.selectOption(serviceId);
  await brandPage.getByLabel('Mensaje', { exact: true }).fill('Hola, ¿colaboramos esta temporada?');
  await brandPage.getByRole('button', { name: 'Enviar a 2 influencers' }).click();
  await expect(brandPage.getByText('Cotizaciones creadas (2)')).toBeVisible();

  // Sin match previo: las cotizaciones existen y no hay match.
  const quotes = await brand.api.call<{ items: { service: unknown; status: string }[] }>(
    'GET',
    `/api/v1/quotes?profileId=${brand.profileId}`,
  );
  expect(quotes.body.items.map((q) => [q.service !== null, q.status]).sort()).toEqual([
    [false, 'sent'],
    [true, 'sent'],
  ]);
  expect(
    (await admin.from('matches').select('id').eq('brand_profile_id', brand.profileId)).data,
  ).toEqual([]);

  // Un segundo envío al mismo creador dentro de la campaña se reporta como fallido, no como error general.
  await brandPage.reload();
  await waitHydrated(brandPage);
  await brandPage.getByLabel('Buscar influencers').fill(withService.handle);
  await brandPage
    .getByRole('checkbox', { name: new RegExp(`@${withService.handle.replaceAll('.', '\\.')}`) })
    .check();
  await brandPage.getByRole('button', { name: 'Continuar con 1 influencer' }).click();
  await brandPage.getByLabel('Mensaje', { exact: true }).fill('Otra vez');
  await brandPage.getByRole('button', { name: 'Enviar cotización' }).click();
  await expect(brandPage.getByText('No se pudo cotizar a')).toBeVisible();
  await expect(brandPage.getByText(/Ya hay una cotización abierta/)).toBeVisible();

  // El influencer con servicio acepta; el avance de la campaña refleja las dos cotizaciones y el monto comprometido.
  const creatorCtx = await browser.newContext();
  const creatorPage = await creatorCtx.newPage();
  await loginAs(creatorCtx, withService.user);
  await visit(creatorPage, '/panel/cotizaciones');
  const received = creatorPage.getByRole('article').filter({ hasText: 'Campaña: Verano E2E' });
  await expect(received).toHaveCount(1);
  await expect(received).toContainText(`Solicitud de @${brand.handle}`);
  await received.getByRole('button', { name: 'Aceptar' }).click();
  await expect(received.locator('.badge')).toHaveText('Aceptada');
  await creatorCtx.close();

  await brandPage.getByRole('link', { name: 'Campañas', exact: true }).first().click();
  await expect(brandPage.getByRole('article').filter({ hasText: 'Verano E2E' })).toContainText(/2/);
  await expect(brandPage.getByRole('article').filter({ hasText: 'Verano E2E' })).toContainText(
    /S\/\s?250/,
  );

  // Cerrada, la campaña ya no admite cotizaciones nuevas (UI y API).
  await brandPage.getByRole('link', { name: 'Verano E2E' }).click();
  await brandPage.getByRole('button', { name: 'Cerrar campaña' }).click();
  await brandPage.reload();
  await expect(brandPage.getByText('Activa la campaña para cotizar')).toBeVisible();
  const campaigns = await brand.api.call<{ items: { id: string }[] }>(
    'GET',
    `/api/v1/campaigns?profileId=${brand.profileId}`,
  );
  const closed = await brand.api.call<unknown>('POST', '/api/v1/quotes', {
    requesterProfileId: brand.profileId,
    campaignId: campaigns.body.items[0]!.id,
    targets: [{ creatorProfileId: openOnly.profileId }],
    message: 'tarde',
  });
  expect(closed.status).toBe(HTTP_BAD_REQUEST);

  // Una campaña ajena no se ve: otra empresa recibe 404 en el detalle.
  const intruder = await newBrand(world);
  const intruderCtx = await browser.newContext();
  const intruderPage = await intruderCtx.newPage();
  await loginAs(intruderCtx, intruder.user);
  const res = await intruderPage.goto(`/campanas/${campaigns.body.items[0]!.id}`);
  expect(res?.status()).toBe(404);
  await expect(intruderPage.getByRole('heading', { name: 'Campaña no encontrada' })).toBeVisible();
  await intruderCtx.close();
  await brandCtx.close();
});

// F7-U1: la campaña rápida se crea ANTES de validar la cotización. Un mensaje vacío deja una campaña activa
// huérfana por cada intento fallido (corregido: valida antes de crear y reutiliza la campaña si falla).
test('F7-U1: un intento de cotizar con campaña rápida y mensaje vacío no deja campañas huérfanas', async ({
  browser,
}) => {
  const [brand, creator] = [await newBrand(world), await newCreator(world)];
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAs(ctx, brand.user);
  await visit(page, `/perfil/${creator.handle}`);
  await page.getByRole('button', { name: 'Cotizar (propuesta abierta)' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre de la nueva campaña').fill('Rápida E2E');
  await dialog.getByRole('button', { name: 'Enviar cotización' }).click();
  await expect(dialog.locator('.field-error').first()).toBeVisible();
  await dialog.getByLabel('Mensaje', { exact: true }).fill('Ahora sí');
  await dialog.getByRole('button', { name: 'Enviar cotización' }).click();
  await expect(dialog.getByText('Cotizaciones creadas (1)')).toBeVisible();
  const campaigns = await brand.api.call<{ items: { name: string }[] }>(
    'GET',
    `/api/v1/campaigns?profileId=${brand.profileId}`,
  );
  expect(campaigns.body.items.filter((c) => c.name === 'Rápida E2E')).toHaveLength(1);
  await ctx.close();
});

test('E2E-16: visibilidad: visita de la marca, interés sin match, devolver interés y privacidad', async ({
  browser,
}) => {
  const [brand, creator] = [await newBrand(world), await newCreator(world)];
  const brandCtx = await browser.newContext();
  const creatorCtx = await browser.newContext();
  const [brandPage, creatorPage] = [await brandCtx.newPage(), await creatorCtx.newPage()];
  await Promise.all([loginAs(brandCtx, brand.user), loginAs(creatorCtx, creator.user)]);

  // La marca abre la ficha del creador (registra la visita) y muestra interés sin match.
  await visit(brandPage, `/perfil/${creator.handle}`);
  await expect
    .poll(async () => {
      const rows = await admin
        .from('profile_views')
        .select('viewer_profile_id')
        .eq('viewed_profile_id', creator.profileId);
      return rows.data?.length ?? 0;
    })
    .toBe(1);
  await brandPage.reload(); // el mismo día no suma
  await waitHydrated(brandPage);
  await brand.api.interest(brand.profileId, creator.profileId);

  // Quien visita su propia ficha o una de su mismo tipo no genera visitas.
  await visit(creatorPage, `/perfil/${creator.handle}`);
  const brandSelf = await admin.from('profile_views').select('viewer_profile_id');
  expect((brandSelf.data ?? []).filter((r) => r.viewer_profile_id === creator.profileId)).toEqual(
    [],
  );

  // El creador ve las dos listas y los contadores.
  await visit(creatorPage, '/visibilidad');
  await expect(creatorPage.getByRole('heading', { level: 1, name: 'Visibilidad' })).toBeVisible();
  const interested = creatorPage.getByRole('listitem').filter({ hasText: `@${brand.handle}` });
  await expect(interested).toHaveCount(1);
  await creatorPage.getByRole('tab', { name: /Visitas/ }).click();
  await expect(creatorPage.getByText(`@${brand.handle}`).first()).toBeVisible();
  // Privacidad: ni el correo ni el documento de la empresa visitante aparecen en la página.
  const html = await creatorPage.content();
  expect(html).not.toContain(brand.user.email);
  const company = await admin
    .from('companies')
    .select('document_number')
    .eq('owner_user_id', brand.user.id)
    .single();
  expect(html).not.toContain(company.data!.document_number);

  // Devolver el interés crea el match y el interés sale de la lista.
  await creatorPage.getByRole('tab', { name: /Interesados/ }).click();
  await creatorPage
    .getByRole('button', { name: /Devolver interés|Me interesa/ })
    .first()
    .click();
  await expect(creatorPage.getByText(`¡Match con @${brand.handle}!`)).toBeVisible();
  await creatorPage.reload();
  await waitHydrated(creatorPage);
  await expect(creatorPage.getByText('Nadie ha mostrado interés sin match todavía.')).toBeVisible();

  // Una cuenta ajena no puede pedir la visibilidad de otro perfil (API).
  const intruder = await newCreator(world);
  const res = await intruder.api.call<unknown>(
    'GET',
    `/api/v1/visibility?profileId=${creator.profileId}&kind=view`,
  );
  expect(res.status).toBe(HTTP_FORBIDDEN);
  await Promise.all([brandCtx.close(), creatorCtx.close()]);
});

// F7-A2: el onboarding intercepta TODA ruta protegida, también /admin, cuando no hay tipo de cuenta. Un administrador
// (ADMIN_EMAILS) que nunca se registró no puede abrir el panel hasta declararse Empresa o Influencer.
// (corregido)
test('F7-A2: un administrador sin registro puede abrir /admin/exclusiones', async ({
  page,
  context,
}) => {
  const email = 'admin@sponcer.test';
  const existing = (await admin.auth.admin.listUsers({ perPage: USERS_PAGE_SIZE })).data.users.find(
    (u) => u.email === email,
  );
  test.skip(Boolean(existing), `${email} ya existe (no se toca una cuenta real)`);
  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  expect(created.error).toBeNull();
  try {
    await loginAs(context, { id: created.data.user!.id, email }, null);
    const response = await page.goto('/admin/exclusiones');
    expect(response?.status()).toBe(HTTP_OK);
    await expect(page).toHaveURL(`${BASE_URL}/admin/exclusiones`);
  } finally {
    await admin.auth.admin.deleteUser(created.data.user!.id);
  }
});

// F7-M3: el selector "Cotizar a influencers" de la campaña sale del feed, y el feed oculta a quien la marca ya marcó
// ("Me interesa" o "No me interesa"). Justo a quien la marca quiere cotizar no se le puede encontrar en el selector.
// (corregido)
test('F7-M3: el selector de la campaña encuentra a influencers ya marcados (interés o descarte) y se les puede cotizar', async ({
  browser,
}) => {
  const [brand, liked, dismissed] = [
    await newBrand(world),
    await newCreator(world),
    await newCreator(world),
  ];
  await brand.api.interest(brand.profileId, liked.profileId);
  await brand.api.call('POST', '/api/v1/interactions', {
    actorProfileId: brand.profileId,
    targetProfileId: dismissed.profileId,
    kind: 'dismiss',
  });
  const campaign = await brand.api.createCampaign(brand.profileId, 'Selector E2E');
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAs(ctx, brand.user, 'brand');
  await visit(page, `/campanas/${campaign.id}`);
  for (const c of [liked, dismissed]) {
    await page.getByLabel('Buscar influencers').fill(c.handle);
    await page.getByRole('checkbox', { name: `@${c.handle}`, exact: false }).check();
  }
  await page.getByRole('button', { name: 'Continuar con 2 influencers' }).click();
  await page
    .getByLabel('Mensaje', { exact: true })
    .fill('Te cotizamos aunque ya te habíamos marcado');
  await page.getByRole('button', { name: 'Enviar a 2 influencers' }).click();
  await expect(page.getByText('Cotizaciones creadas (2)')).toBeVisible();
  await ctx.close();
});
