import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { newBrand, newCreator, type Actor } from '../support/actors';
import { loginAs } from '../support/session';
import { visit } from '../support/ui';
import { createWorld } from '../support/world';

// Accesibilidad de las pantallas nuevas de F7 (ADR-009), WCAG 2.1 AA, a escritorio y móvil:
// registro (4 pasos), campañas (lista, formulario, detalle con selector), diálogo de cotización y visibilidad.
const world = createWorld();
test.afterAll(() => world.cleanup());

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '414', width: 414, height: 896 },
] as const;

// Firefox (Gecko) cierra la página ('Page crashed') al auditar con axe /registro con errores y /campanas, igual que
// /descubrir @1440 (reporte F5-E2E, O-6): no ocurre sin axe (e2e-16 recorre las mismas pantallas en Firefox). Esas dos
// pruebas se saltan en Firefox; Chromium y WebKit las corren.
const FIREFOX_AXE_CRASH = 'Firefox se cuelga con axe en esta pantalla (F5-O-6)';

async function violationsOf(page: Page): Promise<string[]> {
  await page.waitForLoadState('networkidle');
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  return violations.map(
    (v) =>
      `${v.id} [${v.impact}] ${v.nodes.map((n) => n.target.join(' ')).join(' | ')} -> ${v.help}`,
  );
}

let brand: Actor;
let creator: Actor;
/** Influencer sin interacción previa: el selector de la campaña sale del feed, que oculta lo ya marcado. */
let pickable: Actor;
let campaignId = '';
test.beforeAll(async () => {
  [brand, creator, pickable] = [
    await newBrand(world),
    await newCreator(world),
    await newCreator(world),
  ];
  const campaign = await brand.api.createCampaign(brand.profileId, 'Campaña axe');
  campaignId = campaign.id;
  await brand.api.createQuote(brand.profileId, creator.profileId, undefined, 'Cotización axe');
  // Visitas e interés para que las listas de visibilidad tengan filas.
  await brand.api.interest(brand.profileId, creator.profileId);
  await brand.api.call('POST', `/api/v1/profiles/${creator.profileId}/views`, {
    viewerProfileId: brand.profileId,
  });
});

VIEWPORTS.forEach(({ name, width, height }) => {
  test.describe(`axe F7 @${name}`, () => {
    test.use({ viewport: { width, height } });

    test('/registro en sus cuatro pasos', async ({ page, context, browserName }) => {
      test.skip(browserName === 'firefox', FIREFOX_AXE_CRASH);
      const user = await world.newUser();
      await loginAs(context, user, null);
      await visit(page, '/registro');
      await expect(page.getByRole('heading', { name: 'Tipo de cuenta' })).toBeVisible();
      expect(await violationsOf(page), 'paso tipo').toEqual([]);

      // Error de validación visible (aria-describedby/alert).
      await page.getByRole('button', { name: 'Continuar' }).click();
      await expect(page.locator('.field-error').first()).toBeVisible();
      expect(await violationsOf(page), 'tipo con error').toEqual([]);

      await page.getByRole('radio', { name: /^Empresa/ }).check();
      await page.getByRole('button', { name: 'Continuar' }).click();
      await page.getByLabel('Número de RUC').fill('20100070971');
      await page.getByRole('button', { name: 'Continuar' }).click();
      await expect(page.locator('.field-error').first()).toBeVisible();
      expect(await violationsOf(page), 'datos Empresa con errores').toEqual([]);

      await page.getByRole('button', { name: 'Atrás' }).click();
      await page.getByRole('radio', { name: /^Influencer/ }).check();
      await page.getByRole('button', { name: 'Continuar' }).click();
      expect(await violationsOf(page), 'datos Influencer').toEqual([]);
      await page.getByLabel('Tu nombre').fill('Persona axe');
      await page.getByLabel('Ciudad').selectOption('lima');
      await page.getByRole('button', { name: 'Continuar' }).click();
      await page.getByRole('button', { name: 'Crear mi cuenta' }).click();
      await expect(page.locator('.field-error').first()).toBeVisible();
      expect(await violationsOf(page), 'consentimiento con error').toEqual([]);
    });

    test('/registro: paso del primer perfil', async ({ page, context }) => {
      const user = await world.newUser();
      const session = await loginAs(context, user, 'brand');
      expect(session.accessToken).toBeTruthy();
      await visit(page, '/registro');
      await expect(page.getByRole('heading', { name: 'Tu primer perfil' })).toBeVisible();
      expect(await violationsOf(page)).toEqual([]);
    });

    test('/campanas, formulario de campaña y detalle con selector', async ({
      page,
      context,
      browserName,
    }) => {
      test.skip(browserName === 'firefox', FIREFOX_AXE_CRASH);
      await loginAs(context, brand.user, 'brand');
      await visit(page, '/campanas');
      await expect(page.getByRole('link', { name: 'Campaña axe' })).toBeVisible();
      expect(await violationsOf(page), 'lista').toEqual([]);
      await page.getByRole('button', { name: 'Nueva campaña' }).click();
      await page.getByRole('button', { name: 'Crear campaña' }).click();
      await expect(page.locator('.field-error').first()).toBeVisible();
      expect(await violationsOf(page), 'formulario con errores').toEqual([]);

      await visit(page, `/campanas/${campaignId}`);
      await expect(page.getByRole('heading', { level: 1, name: 'Campaña axe' })).toBeVisible();
      await expect(page.getByLabel('Buscar influencers')).toBeVisible();
      expect(await violationsOf(page), 'detalle').toEqual([]);
      await page.getByLabel('Buscar influencers').fill(pickable.handle);
      await page
        .getByRole('checkbox', { name: new RegExp(`@${pickable.handle.replace('.', '\\.')}`) })
        .check();
      await page.getByRole('button', { name: 'Continuar con 1 influencer' }).click();
      await page.getByRole('button', { name: 'Enviar cotización' }).click();
      await expect(page.locator('.field-error').first()).toBeVisible();
      expect(await violationsOf(page), 'compositor con errores').toEqual([]);
    });

    test('diálogo de cotización abierto desde la ficha', async ({ page, context }) => {
      await loginAs(context, brand.user, 'brand');
      await visit(page, `/perfil/${creator.handle}`);
      await page.getByRole('button', { name: 'Cotizar (propuesta abierta)' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      expect(await violationsOf(page)).toEqual([]);
    });

    test('/visibilidad: interesados y visitas', async ({ page, context }) => {
      await loginAs(context, creator.user, 'creator');
      await visit(page, '/visibilidad');
      await expect(page.getByRole('listitem').filter({ hasText: brand.handle })).toHaveCount(1);
      expect(await violationsOf(page), 'interesados').toEqual([]);
      await page.getByRole('tab', { name: /Visitas/ }).click();
      await expect(page.getByRole('listitem').filter({ hasText: brand.handle })).toHaveCount(1);
      expect(await violationsOf(page), 'visitas').toEqual([]);
    });
  });
});
