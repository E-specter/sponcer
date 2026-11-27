import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { newBrand, newCreator, newMatch, type Actor } from '../support/actors';
import { E2E_ADMIN_EMAIL } from '../support/env';
import { newAdmin, profileWithPendingRequest } from '../support/removals';
import { loginAs } from '../support/session';
import { visit } from '../support/ui';
import { createWorld } from '../support/world';

// Accesibilidad (brief de diseño, WCAG 2.1 AA): axe en las pantallas principales a escritorio y móvil.
const world = createWorld();
test.afterAll(() => world.cleanup());

// Firefox cierra la página ("Page crashed") al correr la regla `aria-allowed-attr` de axe sobre /descubrir a 1440 px
// (reproducible; la página funciona con normalidad y las demás reglas y anchos pasan). Ver reporte F5-E2E, O-6.
const FIREFOX_AXE_CRASH = 'Firefox se cuelga con axe aria-allowed-attr en /descubrir @1440';
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '414', width: 414, height: 896 },
] as const;

interface Scenario {
  creator: Actor;
  brand: Actor;
  matchId: string;
}
let scenario: Scenario;

test.beforeAll(async () => {
  const creator = await newCreator(world);
  const brand = await newBrand(world);
  const matchId = await newMatch(creator, brand);
  await brand.api.sendMessage(matchId, brand.profileId, 'Hola, ¿hablamos?');
  const profile = await creator.api.profile(creator.handle);
  const service = profile.services[0];
  if (!service) throw new Error('El creador de prueba no tiene servicios');
  await brand.api.createQuote(
    brand.profileId,
    creator.profileId,
    service.id,
    'Cotización de prueba de accesibilidad',
  );
  scenario = { creator, brand, matchId };
});

/** Resumen legible de las violaciones: regla, impacto, selectores y ayuda. */
async function violationsOf(page: Page): Promise<string[]> {
  // Auditar con imágenes aún decodificándose cuelga el motor de Firefox; se espera a que la página repose.
  await page.waitForLoadState('networkidle');
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  return violations.map(
    (v) =>
      `${v.id} [${v.impact}] ${v.nodes.map((n) => n.target.join(' ')).join(' | ')} -> ${v.help}`,
  );
}

interface Screen {
  name: string;
  /** Ruta; recibe el escenario para las que dependen de ids. */
  path: (s: Scenario) => string;
  /** Contenido real que debe estar pintado antes de auditar. */
  ready: (page: Page) => ReturnType<Page['locator']>;
  authenticated: boolean;
}

const SCREENS: Screen[] = [
  {
    name: '/',
    path: () => '/',
    ready: (p) => p.getByRole('heading', { level: 1 }),
    authenticated: false,
  },
  {
    name: '/login',
    path: () => '/login',
    ready: (p) => p.getByLabel('Correo electrónico'),
    authenticated: false,
  },
  {
    name: '/descubrir',
    path: () => '/descubrir',
    ready: (p) => p.getByRole('article').first(),
    authenticated: true,
  },
  {
    name: '/perfil/<handle>',
    path: (s) => `/perfil/${s.creator.handle}`,
    ready: (p) => p.getByRole('heading', { name: 'Servicios' }),
    authenticated: true,
  },
  {
    name: '/panel',
    path: () => '/panel',
    ready: (p) => p.getByRole('form', { name: 'Datos declarados' }),
    authenticated: true,
  },
  {
    name: '/panel/cotizaciones',
    path: () => '/panel/cotizaciones',
    ready: (p) => p.getByRole('article').first(),
    authenticated: true,
  },
  {
    name: '/panel/matches',
    path: () => '/panel/matches',
    ready: (p) => p.getByRole('article').first(),
    authenticated: true,
  },
  {
    name: '/mensajes/<id>',
    path: (s) => `/mensajes/${s.matchId}`,
    ready: (p) => p.getByRole('log', { name: 'Historial de mensajes' }),
    authenticated: true,
  },
  {
    name: '/exclusion/<handle>',
    path: () => '/exclusion/demo.handle',
    ready: (p) => p.getByLabel('Correo de contacto'),
    authenticated: false,
  },
  {
    name: '/privacidad',
    path: () => '/privacidad',
    ready: (p) => p.getByRole('heading', { level: 1 }),
    authenticated: false,
  },
];

VIEWPORTS.forEach((viewport) => {
  SCREENS.forEach((screen) => {
    test(`axe WCAG 2.1 AA ${screen.name} @${viewport.name}`, async ({
      page,
      context,
      browserName,
    }) => {
      test.skip(
        browserName === 'firefox' && screen.name === '/descubrir' && viewport.name === '1440',
        FIREFOX_AXE_CRASH,
      );
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      if (screen.authenticated) await loginAs(context, scenario.brand.user);
      await visit(page, screen.path(scenario));
      await expect(screen.ready(page)).toBeVisible();
      expect(await violationsOf(page)).toEqual([]);
    });
  });
});

// Vista del creador: editor de servicios y cotizaciones recibidas (acciones de la máquina de estados).
VIEWPORTS.forEach((viewport) => {
  test(`axe WCAG 2.1 AA /panel (creador, servicios abiertos) @${viewport.name}`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await loginAs(context, scenario.creator.user);
    await visit(page, '/panel');
    await page.getByText('Mis servicios').click();
    await expect(page.getByRole('form', { name: 'Servicios' })).toBeVisible();
    expect(await violationsOf(page)).toEqual([]);
  });

  test(`axe WCAG 2.1 AA /panel/cotizaciones (creador) @${viewport.name}`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await loginAs(context, scenario.creator.user);
    await visit(page, '/panel/cotizaciones');
    await expect(page.getByRole('button', { name: 'Aceptar' })).toBeVisible();
    expect(await violationsOf(page)).toEqual([]);
  });
});

test('axe detecta violaciones reales (control de que la herramienta no está ciega)', async ({
  page,
}) => {
  await page.setContent('<main><img src="x.png"><button></button></main>');
  const found = await violationsOf(page);
  expect(found.some((v) => v.startsWith('image-alt'))).toBe(true);
  expect(found.some((v) => v.startsWith('button-name'))).toBe(true);
});

// Estados interactivos: es donde suelen aparecer los fallos (paneles abiertos, errores, formularios dinámicos).
VIEWPORTS.forEach((viewport) => {
  test(`axe WCAG 2.1 AA estados abiertos: filtros, campana, errores y cotización @${viewport.name}`, async ({
    page,
    context,
    browserName,
  }) => {
    test.skip(browserName === 'firefox' && viewport.name === '1440', FIREFOX_AXE_CRASH);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await loginAs(context, scenario.brand.user);

    await visit(page, '/descubrir');
    await expect(page.getByRole('article').first()).toBeVisible();
    await page.getByRole('button', { name: 'Filtros', exact: true }).click();
    await page.getByRole('button', { name: 'Notificaciones' }).click();
    await expect(page.getByRole('region', { name: 'Notificaciones' })).toBeVisible();
    expect(await violationsOf(page)).toEqual([]);

    await visit(page, '/panel');
    await page.getByRole('button', { name: 'Obtener código' }).click();
    await expect(page.locator('.field-error').first()).toBeVisible();
    await page
      .getByRole('form', { name: 'Datos declarados' })
      .getByRole('button', { name: 'Guardar datos' })
      .click();
    expect(await violationsOf(page)).toEqual([]);

    await visit(page, `/perfil/${scenario.creator.handle}`);
    await page.getByRole('button', { name: 'Cotizar (propuesta abierta)' }).click();
    await page.getByRole('button', { name: 'Enviar cotización' }).click();
    await expect(page.locator('.field-error').first()).toBeVisible();
    expect(await violationsOf(page)).toEqual([]);
  });
});

// Brief de diseño (vinculante): objetivos táctiles de al menos 44 px y sin desplazamiento horizontal en móvil.
const MIN_TOUCH_PX = 44;
const MOBILE = VIEWPORTS[1];
const TOUCH_SCREENS = ['/descubrir', '/panel', '/panel/cotizaciones', '/panel/matches'];

TOUCH_SCREENS.forEach((path) => {
  test(`móvil ${path}: objetivos táctiles >= 44 px y sin scroll horizontal`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: MOBILE.width, height: MOBILE.height });
    await loginAs(context, scenario.brand.user);
    await visit(page, path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    const small = await page.evaluate((min) => {
      const targets = [
        ...document.querySelectorAll(
          'button, input:not([type=checkbox]):not([type=radio]), select, textarea, a.btn, .bottom-nav a',
        ),
      ];
      return targets
        .filter((el) => el.getClientRects().length > 0 && !el.closest('.sr-only'))
        .map((el) => ({ el, box: el.getBoundingClientRect() }))
        .filter(({ box }) => box.height < min || box.width < min)
        .map(
          ({ el, box }) =>
            `${el.tagName.toLowerCase()}.${el.className} "${(el.textContent ?? '').trim().slice(0, 24)}" ${Math.round(box.width)}x${Math.round(box.height)}`,
        );
    }, MIN_TOUCH_PX);
    expect(small).toEqual([]);
  });
});

// Panel de administración: lista con un pedido pendiente y su confirmación abierta (acción destructiva).
VIEWPORTS.forEach((viewport) => {
  test(`axe WCAG 2.1 AA /admin/exclusiones (con confirmación abierta) @${viewport.name}`, async ({
    page,
    context,
  }) => {
    const { user, recognized } = await newAdmin(world);
    test.skip(!recognized, `El backend no tiene ${E2E_ADMIN_EMAIL} en ADMIN_EMAILS`);
    const pending = await profileWithPendingRequest(world);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await loginAs(context, user);
    await visit(page, '/admin/exclusiones');
    const card = page.getByRole('article').filter({ hasText: `@${pending.creator.handle}` });
    await expect(card).toBeVisible();
    expect(await violationsOf(page)).toEqual([]);
    await card.getByRole('button', { name: 'Aplicar exclusión' }).click();
    await expect(card.getByText('Esto no se puede deshacer')).toBeVisible();
    expect(await violationsOf(page)).toEqual([]);
  });
});
