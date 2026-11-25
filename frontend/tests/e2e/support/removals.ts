import { expect } from '@playwright/test';
import { newCreator } from './actors';
import { apiAs } from './api';
import { E2E_ADMIN_EMAIL } from './env';
import { sessionFor } from './session';
import { admin, type E2EUser, type World } from './world';

const USERS_PAGE_SIZE = 1000;

/** Un perfil verificado con un pedido de exclusión `pending` insertado por BD (la acción bajo prueba es la del panel). */
export async function profileWithPendingRequest(w: World) {
  const creator = await newCreator(w);
  const inserted = await admin
    .from('profile_removal_requests')
    .insert({
      ig_handle: creator.handle,
      email: 'titular@ejemplo.example',
      reason: 'Pido la baja de mi ficha',
      status: 'pending',
    })
    .select('id')
    .single<{ id: string }>();
  expect(inserted.error).toBeNull();
  return { creator, requestId: inserted.data?.id ?? '' };
}

/** Crea el usuario administrador de prueba y dice si el backend lo reconoce (`ADMIN_EMAILS`). */
export async function newAdmin(w: World): Promise<{ user: E2EUser; recognized: boolean }> {
  // Un solo administrador por corrida: si ya existe (otro test del archivo) se reutiliza.
  const list = await admin.auth.admin.listUsers({ perPage: USERS_PAGE_SIZE });
  const existing = list.data.users.find((u) => u.email === E2E_ADMIN_EMAIL);
  if (existing) w.trackEmail(E2E_ADMIN_EMAIL);
  const user = existing
    ? { id: existing.id, email: E2E_ADMIN_EMAIL }
    : await w.newUser(E2E_ADMIN_EMAIL);
  const me = await apiAs((await sessionFor(user)).accessToken).call<{ isAdmin?: boolean }>(
    'GET',
    '/api/v1/me',
  );
  return { user, recognized: Boolean(me.body.isAdmin) };
}
