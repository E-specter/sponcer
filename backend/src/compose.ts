// Composition root: env -> bus -> módulos -> app. La inyección de dependencias es manual (ADR-005).
import { createClient } from '@supabase/supabase-js';
import { createApp } from './app';
import type { Env } from './config/env';
import { ok } from './shared/result';
import { logger } from './shared/logger';
import { createEventBus } from './shared/events/event-bus';
import { createAdminDirectory, createInMemoryAdminStore } from './shared/admin';
import { createSupabaseAdminStore } from './shared/supabase/admin-store';
import { createAdminModule } from './modules/admin';
import { createAuthModule } from './modules/auth';
import { createChatModule } from './modules/chat';
import {
  createClassificationModule,
  type BackfillResult,
  type ClassificationApi,
} from './modules/classification';
import { createIngestionModule } from './modules/ingestion';
import { createMatchingModule } from './modules/matching';
import { createNotificationsModule } from './modules/notifications';
import { createProfilesModule } from './modules/profiles';
import { createQuotesModule } from './modules/quotes';

export function composeApp(env: Env, opts: { now?: () => Date } = {}) {
  const { now } = opts;
  const bus = createEventBus();

  // Un único cliente service_role compartido por todos los adaptadores reales (el backend aplica la autorización).
  const anyReal = Object.entries(env).some(([k, v]) => k.startsWith('ADAPTER_') && v === 'real');
  const supabase =
    anyReal && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
      ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false },
        })
      : undefined;

  const admins = createAdminDirectory(
    env.ADMIN_EMAILS,
    env.ADAPTER_AUTH === 'real' && supabase
      ? createSupabaseAdminStore(supabase)
      : createInMemoryAdminStore(),
  );
  const admin = createAdminModule({
    adapter: env.ADAPTER_AUTH,
    admins,
    supabase,
    appUrl: env.APP_URL,
    now,
  });

  // profiles <-> classification forman un ciclo: profiles lee la clasificación de forma perezosa.
  const classificationRef: { current?: { api: ClassificationApi } } = {};

  const profiles = createProfilesModule({
    adapter: env.ADAPTER_PROFILES,
    isAdmin: admins.isAdmin,
    // Ingesta bajo demanda: perfil primero, luego `ProfileIngested` (lo publica profiles) para que classification lo vea.
    ingester: {
      ingest: async (h) => {
        const r = await ingestion.api.ingestProfile(h);
        return r.ok ? ok({ snapshotId: r.value.snapshotId }) : r;
      },
    },
    now,
    bus,
    supabase,
    snapshots: { getByHandle: (h) => ingestion.api.getLatestSnapshot(h) },
    classifications: {
      getByProfileId: async (id) => classificationRef.current?.api.getClassification(id) ?? null,
    },
  });
  const ingestion = createIngestionModule({
    adapter: env.ADAPTER_INGESTION,
    now,
    supabase,
    bus,
    apifyToken: env.APIFY_TOKEN,
  });
  const classification = createClassificationModule({
    adapter: env.ADAPTER_CLASSIFICATION,
    now,
    supabase,
    bus,
    profiles: profiles.api,
    snapshots: ingestion.api,
  });
  classificationRef.current = classification;
  // Un perfil recién reclamado aún no tiene snapshot: se ingesta al verificarse y `ProfileIngested` dispara su clasificación.
  // `ProfileIngested` que llega antes de que exista el perfil lo ignora classification: en la ingesta bajo demanda
  // profiles crea la ficha y vuelve a publicarlo; aquí el perfil ya existe cuando se emite `ProfileVerified`.
  bus.subscribe('ProfileVerified', async (e) => {
    const r = await ingestion.api.ingestProfile(e.igHandle);
    if (!r.ok) logger.warn(`no se pudo ingestar ${e.igHandle}`, r.error.message);
  });

  const matching = createMatchingModule({
    adapter: env.ADAPTER_MATCHING,
    now,
    supabase,
    bus,
    profiles: profiles.api,
    classification: classification.api,
    weights: env.MATCH_WEIGHTS,
    isAdmin: admins.isAdmin,
  });
  const quotes = createQuotesModule({
    adapter: env.ADAPTER_QUOTES,
    now,
    bus,
    profiles: profiles.api,
    supabase,
  });
  const chat = createChatModule({
    adapter: env.ADAPTER_CHAT,
    now,
    bus,
    supabase,
    profiles: profiles.api,
    matches: { findById: (id) => matching.api.getMatch(id) },
  });
  const notifications = createNotificationsModule({
    adapter: env.ADAPTER_NOTIFICATIONS,
    now,
    bus,
    supabase,
    profiles: profiles.api,
    quotes: quotes.api,
    chat: chat.api,
  });
  const auth = createAuthModule({
    adapter: env.ADAPTER_AUTH,
    isAdmin: admins.isAdmin,
    now,
    bus,
    supabase,
    profiles: profiles.api,
    liveBio: { read: (h) => ingestion.api.fetchLiveBio(h) },
    onClaimStarted: (h, c) => ingestion.setPendingCode?.(h, c),
  });

  const app = createApp({
    env,
    authMiddleware: auth.middleware,
    routers: [
      auth.router,
      admin.router,
      profiles.router,
      matching.router,
      quotes.router,
      chat.router,
      notifications.router,
    ],
  });

  // Backfill al arrancar; el llamador decide si espera (tests) o solo lo registra (main).
  const backfill: Promise<BackfillResult> = classification.api.classifyAll();
  return { app, bus, backfill };
}
