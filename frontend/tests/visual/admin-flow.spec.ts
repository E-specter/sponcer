import { expect, test } from '@playwright/test';
import { visit } from '../e2e/support/ui';

// Flujo de administración en modo mock (altas manuales, F6 / ADR-008). El usuario demo es administrador.
test('admin: agrega una ficha, rechaza un duplicado, invita y gestiona administradores', async ({
  page,
}) => {
  await visit(page, '/admin/perfiles');
  await expect(page.getByRole('link', { name: 'Administración' }).first()).toBeVisible();

  await page.getByLabel('@handle de Instagram').fill('cuenta.nueva');
  await page.getByRole('button', { name: 'Agregar ficha' }).click();
  await expect(page.getByText('Ficha creada')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ver el perfil' })).toHaveAttribute(
    'href',
    '/perfil/cuenta.nueva',
  );
  await page.getByLabel('@handle de Instagram').fill('cuenta.nueva');
  await page.getByRole('button', { name: 'Agregar ficha' }).click();
  await expect(page.getByText('Esa ficha ya existe')).toBeVisible();

  await page.getByRole('link', { name: 'Invitaciones' }).click();
  await page.waitForURL('**/admin/invitaciones');
  await visit(page, '/admin/invitaciones');
  await page.getByLabel('Correo electrónico').fill('nadie@correo.com');
  await page.getByRole('button', { name: 'Enviar invitación' }).click();
  await expect(page.getByText('Invitación enviada a nadie@correo.com.')).toBeVisible();
  await page.getByLabel('Correo electrónico').fill('usuario1@sponcer.local');
  await page.getByRole('button', { name: 'Enviar invitación' }).click();
  await expect(page.getByText('ya tiene cuenta')).toBeVisible();

  await visit(page, '/admin/administradores');
  await expect(page.getByText('Fijo (.env)')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Quitar administrador' })).toHaveCount(0);
  await page.getByLabel('Nombrar administrador por correo').fill('nueva@correo.com');
  await page.getByRole('button', { name: 'Nombrar administrador' }).click();
  const card = page.getByRole('article').filter({ hasText: 'nueva@correo.com' });
  await expect(card.getByText('Nombrado en la app')).toBeVisible();
  await card.getByRole('button', { name: 'Quitar administrador' }).click();
  await card.getByRole('button', { name: 'Cancelar' }).click();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Quitar administrador' }).click();
  await card.getByRole('button', { name: 'Sí, quitar' }).click();
  await expect(page.getByText('nueva@correo.com ya no es administrador.')).toBeVisible();
  await expect(card).toHaveCount(0);
});
