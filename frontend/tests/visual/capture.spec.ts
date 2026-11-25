import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, type ConsoleMessage, type Page } from '@playwright/test';
import { waitHydrated } from '../e2e/support/ui';

// Captura visual (modo mock): una imagen por pantalla y ancho en test-results/visual/. No compara píxeles.
const FIXTURES = resolve(import.meta.dirname, '..', '..', '..', 'contracts', 'fixtures');
const readJson = <T>(file: string): T =>
  JSON.parse(readFileSync(resolve(FIXTURES, file), 'utf8')) as T;

interface FixtureProfile {
  id: string;
  role: 'creator' | 'brand';
  snapshot: { handle: string };
  ownerUserId: string | null;
}
const profiles = readJson<FixtureProfile[]>('profiles.json');
const demoUser = readJson<{ id: string }[]>('users.json')[0];
const social = readJson<{ matches: { id: string }[] }>('social.json');

const mine = (role: 'creator' | 'brand') => {
  const found = profiles.find((p) => p.ownerUserId === demoUser?.id && p.role === role);
  if (!found) throw new Error(`El usuario demo no tiene un perfil ${role} en los fixtures`);
  return found;
};
const firstOther = (role: 'creator' | 'brand') => {
  const found = profiles.find((p) => p.role === role && p.ownerUserId !== demoUser?.id);
  if (!found) throw new Error(`No hay otro perfil ${role} en los fixtures`);
  return found.snapshot.handle;
};
const matchId = social.matches[0]?.id ?? '';

const ACTIVE_PROFILE_KEY = 'sponcer.activeProfileId';
const OUT_DIR = 'test-results/visual';
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 414, height: 896 },
] as const;

interface Screen {
  /** Nombre de archivo y de test (`--grep "descubrir-marca"`). */
  name: string;
  path: string;
  /** Perfil activo del usuario demo al abrir la pantalla. */
  as?: 'creator' | 'brand';
}

const SCREENS: Screen[] = [
  { name: 'portada', path: '/' },
  { name: 'login', path: '/login' },
  { name: 'descubrir-creador', path: '/descubrir', as: 'creator' },
  { name: 'descubrir-marca', path: '/descubrir', as: 'brand' },
  { name: 'perfil-creador', path: `/perfil/${firstOther('creator')}`, as: 'brand' },
  { name: 'perfil-marca', path: `/perfil/${firstOther('brand')}`, as: 'creator' },
  { name: 'panel', path: '/panel', as: 'creator' },
  { name: 'matches', path: '/panel/matches', as: 'creator' },
  { name: 'cotizaciones', path: '/panel/cotizaciones', as: 'brand' },
  { name: 'mensajes', path: `/mensajes/${matchId}`, as: 'creator' },
  { name: 'privacidad', path: '/privacidad' },
];

const HTTP_ERROR_MIN = 400;

/** Errores de consola, excepciones de página y respuestas >= 400: lo único que hace fallar la captura. */
function watchProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() === 'error') problems.push(`consola: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`excepción: ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= HTTP_ERROR_MIN) problems.push(`HTTP ${r.status()}: ${r.url()}`);
  });
  return problems;
}

VIEWPORTS.forEach(({ width, height }) => {
  SCREENS.forEach((screen) => {
    test(`visual ${screen.name} @${width}`, async ({ page }) => {
      const problems = watchProblems(page);
      await page.setViewportSize({ width, height });
      const activeId = screen.as ? mine(screen.as).id : null;
      if (activeId) {
        await page.addInitScript(
          ([key, id]) => localStorage.setItem(key as string, id as string),
          [ACTIVE_PROFILE_KEY, activeId],
        );
      }
      await page.goto(screen.path);
      await waitHydrated(page);
      await page.waitForLoadState('networkidle');
      // La barra de desarrollo de Astro tapa contenido en la captura.
      await page.addStyleTag({ content: 'astro-dev-toolbar { display: none !important; }' });
      await page.screenshot({ path: `${OUT_DIR}/${screen.name}-${width}.png`, fullPage: true });
      test.expect(problems, 'errores de consola o respuestas >= 400').toEqual([]);
    });
  });
});
