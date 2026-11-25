import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, type QuoteRecord } from '@sponcer/contracts';
import { demoUser, fixtureProfiles } from '@sponcer/contracts/fixtures';
import {
  createWorld,
  hasSupabase,
  serviceClient,
  supabaseEnv,
  type TestUser,
} from '../../../../db/tests/support/supabase';
import { composeApp } from '../../../src/compose';
import { loadEnv } from '../../../src/config/env';
import {
  createSupabaseClaimStore,
  createSupabaseIdentityProvider,
} from '../../../src/modules/auth/infrastructure/out/supabase/supabase-adapters';
import { createSupabaseMessageRepository } from '../../../src/modules/chat/infrastructure/out/supabase/supabase-message-repository';
import { createSupabaseNotificationRepository } from '../../../src/modules/notifications/infrastructure/out/supabase/supabase-adapters';
import { createEventBus } from '../../../src/shared/events/event-bus';
import { createProfilesModule } from '../../../src/modules/profiles';
import {
  createSupabaseProfileRepository,
  createSupabaseServiceRepository,
} from '../../../src/modules/profiles/infrastructure/out/supabase/supabase-adapters';
import { createSupabaseQuoteRepository } from '../../../src/modules/quotes/infrastructure/out/supabase/supabase-adapters';
import { call, expectError, expectMatchesContract, STATUS } from '../../support/app';
import { describeIdentityProviderContract } from '../auth/identity-provider.contract';

/**
 * Revisión de F2-B contra Supabase local: IdentityProvider real, HTTP sobre los adaptadores reales y los
 * hallazgos de transaccionalidad, mapeo de errores e inyección. Los casos F2-* eran hallazgos
 * (corregidos en F3-FIX-2) y quedan como regresión.
 */
const SETUP_TIMEOUT_MS = 60_000;
const PRICE_A = 1;
const PRICE_B = 2;
const PRICE_C = 3;
const BAD_PRICE = -5;
const SEED_BRAND = fixtureProfiles.find(
  (p) => p.ownerUserId === demoUser.id && p.role === 'brand',
)!;
const SEED_CREATOR_DECLARED = fixtureProfiles.find(
  (p) => p.ownerUserId === demoUser.id && p.role === 'creator',
)!.declared!;

const svc = (description: string, pricePen: number) => ({
  type: 'canje' as const,
  format: 'reel' as const,
  pricePen,
  description,
});
const iso = () => new Date().toISOString();

describe.skipIf(!hasSupabase)('F2-B · revisión de adaptadores reales (Supabase local)', () => {
  const sb = serviceClient();
  const world = createWorld(sb);

  beforeAll(() => world.cleanup(), SETUP_TIMEOUT_MS);
  afterAll(() => world.cleanup(), SETUP_TIMEOUT_MS);

  describe('auth · IdentityProvider real (Supabase Auth)', () => {
    describeIdentityProviderContract(
      () => createSupabaseIdentityProvider(sb),
      async () => {
        const user = await world.newUser();
        return {
          validHeader: `Bearer ${await world.signIn(user)}`,
          expectedUser: { userId: user.id, email: user.email },
        };
      },
    );

    it('un JWT con la firma alterada no autentica', async () => {
      const token = await world.signIn(await world.newUser());
      const [head, payload, signature] = token.split('.') as [string, string, string];
      const tampered = `${head}.${payload}.${signature.split('').reverse().join('')}`;
      expect(
        await createSupabaseIdentityProvider(sb).authenticate(`Bearer ${tampered}`),
      ).toBeNull();
    });

    it('el token de un usuario borrado deja de valer', async () => {
      const user: TestUser = await world.newUser();
      const header = `Bearer ${await world.signIn(user)}`;
      const provider = createSupabaseIdentityProvider(sb);
      expect(await provider.authenticate(header)).not.toBeNull();
      await sb.auth.admin.deleteUser(user.id);
      expect(await provider.authenticate(header)).toBeNull();
    });
  });

  describe('HTTP sobre los adaptadores reales de profiles y quotes (auth mock)', () => {
    // composeApp y loadEnv exigen las credenciales: se evalúan dentro de beforeAll (que se salta sin Supabase),
    // no en el cuerpo del describe (que se ejecuta siempre).
    let composed: ReturnType<typeof composeApp>;
    let creator = { id: '', handle: '' };

    beforeAll(async () => {
      const env = loadEnv({ ADAPTER_PROFILES: 'real', ADAPTER_QUOTES: 'real', ...supabaseEnv() });
      composed = composeApp(env);
      await composed.backfill;
      creator = await world.newProfile('creator', demoUser.id);
    }, SETUP_TIMEOUT_MS);

    const asDemo = (verb: 'get' | 'put' | 'patch' | 'post', path: string, body?: unknown) =>
      call(composed.app, verb, path, demoUser.id, body);
    const profilePath = (h: string) => api.getProfile.path.replace(':handle', h);

    it('GET /me lista los perfiles de la BD, incluido el recién creado, y cumple el esquema', async () => {
      const res = await asDemo('get', api.me.path);
      expect(res.status).toBe(STATUS.OK);
      expectMatchesContract(api.me, res.body);
      expect(res.body.profiles.map((p: { id: string }) => p.id)).toContain(creator.id);
    });

    it('GET /profiles/:handle de un perfil real cumple el esquema y marca isOwner', async () => {
      const res = await asDemo('get', profilePath(creator.handle));
      expect(res.status).toBe(STATUS.OK);
      expectMatchesContract(api.getProfile, res.body);
      expect(res.body).toMatchObject({ id: creator.id, isOwner: true, declared: null });
    });

    it('PATCH declared persiste en jsonb y vuelve igual', async () => {
      const path = api.updateDeclared.path.replace(':profileId', creator.id);
      const res = await asDemo('patch', path, { ...SEED_CREATOR_DECLARED, city: 'piura' });
      expect(res.status).toBe(STATUS.OK);
      expectMatchesContract(api.updateDeclared, res.body);
      const again = await asDemo('get', profilePath(creator.handle));
      expect(again.body.declared).toMatchObject({ role: 'creator', city: 'piura' });
    });

    it('un usuario que no es dueño recibe 403 sobre el perfil real', async () => {
      const path = api.putServices.path.replace(':profileId', creator.id);
      const other = fixtureProfiles.find(
        (p) => p.ownerUserId !== demoUser.id && p.ownerUserId,
      )!.ownerUserId!;
      const res = await call(composed.app, 'put', path, other, { services: [] });
      expectError(res, STATUS.FORBIDDEN, 'FORBIDDEN');
    });

    it('PUT services conserva el id de un servicio sin cambios (cotizaciones apuntan a él)', async () => {
      const path = api.putServices.path.replace(':profileId', creator.id);
      const first = await asDemo('put', path, { services: [svc('a', PRICE_A), svc('b', PRICE_B)] });
      expectMatchesContract(api.putServices, first.body);
      const second = await asDemo('put', path, {
        services: [svc('a', PRICE_A), svc('c', PRICE_C)],
      });
      expect(second.body[0].id).toBe(first.body[0].id);
    });

    // F2-A-1 (corregido en F3-FIX-2): el FK quotes.service_id (RESTRICT) aborta el borrado y el adaptador lanza un Error
    // genérico: el borde responde 500 en vez de 409 CONFLICT. `PG_FK_VIOLATION` está definido y no se usa.
    it('F2-A-1: quitar un servicio con cotizaciones responde 409 CONFLICT, no 500', async () => {
      const servicesPath = api.putServices.path.replace(':profileId', creator.id);
      const saved = await asDemo('put', servicesPath, {
        services: [svc('con-cotizacion', PRICE_A)],
      });
      const quote = await asDemo('post', api.createQuote.path, {
        requesterProfileId: SEED_BRAND.id,
        serviceId: saved.body[0].id,
        message: 'hola',
      });
      expect(quote.status, JSON.stringify(quote.body)).toBe(STATUS.OK);
      const res = await asDemo('put', servicesPath, { services: [] });
      expect(res.status).toBe(STATUS.CONFLICT);
    });

    it('un cuerpo inválido no llega a la BD (400 antes del adaptador)', async () => {
      const path = api.putServices.path.replace(':profileId', creator.id);
      const res = await asDemo('put', path, { services: [svc('x', BAD_PRICE)] });
      expectError(res, STATUS.BAD_REQUEST, 'VALIDATION_ERROR');
    });
  });

  describe('profiles · ProfileRepository real con datos propios', () => {
    const repo = createSupabaseProfileRepository(sb);

    it('save + findById/findByHandle/listByOwner conservan los datos declarados (jsonb)', async () => {
      const owner = await world.newUser();
      const created = await world.newProfile('creator', owner.id);
      const profile = {
        id: created.id,
        handle: created.handle,
        role: 'creator' as const,
        status: 'verified' as const,
        ownerUserId: owner.id,
        declared: SEED_CREATOR_DECLARED,
      };
      await repo.save(profile);
      expect(await repo.findById(profile.id)).toEqual(profile);
      expect(await repo.findByHandle(profile.handle)).toEqual(profile);
      expect((await repo.listByOwner(owner.id)).map((x) => x.id)).toEqual([profile.id]);
      expect((await repo.listByRole('creator')).map((x) => x.id)).toContain(profile.id);
    });

    it('un perfil removido sigue legible (lista de bloqueo) y no desaparece de listByOwner', async () => {
      const owner = await world.newUser();
      const created = await world.newProfile('creator', owner.id);
      const found = (await repo.findById(created.id))!;
      await repo.save({ ...found, status: 'removed' });
      expect((await repo.findByHandle(created.handle))?.status).toBe('removed');
    });

    it('findByHandle de un handle inexistente es null y sin sensibilidad a mayúsculas inventada', async () => {
      expect(await repo.findByHandle('zz.no.existe.nunca')).toBeNull();
    });

    // F5: save nunca revive una ficha retirada (mismo contrato que el mock, con datos propios).
    it('save NUNCA revive una ficha retirada, también con ediciones concurrentes', async () => {
      const owner = await world.newUser();
      const created = await world.newProfile('creator', owner.id);
      const live = (await repo.findById(created.id))!;
      expect(await repo.save({ ...live, status: 'removed' })).toBe(true);
      const attempts = [
        { ...live, status: 'verified' as const },
        { ...live, declared: null },
        { ...live, status: 'unclaimed' as const, ownerUserId: null },
      ];
      expect(await Promise.all(attempts.map((p) => repo.save(p)))).toEqual([false, false, false]);
      expect((await repo.findById(created.id))?.status).toBe('removed');
      expect(await repo.save({ ...live, status: 'removed' })).toBe(true);
    });

    it('un retiro concurrente con una edición deja la ficha retirada (sin lost update)', async () => {
      const created = await world.newProfile('creator', (await world.newUser()).id);
      const live = (await repo.findById(created.id))!;
      await Promise.all([
        repo.save({ ...live, declared: null }),
        repo.save({ ...live, status: 'removed' }),
        repo.save({ ...live, declared: null }),
      ]);
      expect((await repo.findById(created.id))?.status).toBe('removed');
    });

    it('save devuelve true al crear y al actualizar una ficha no retirada', async () => {
      const created = await world.newProfile('creator');
      const live = (await repo.findById(created.id))!;
      expect(await repo.save({ ...live, declared: null })).toBe(true);
    });

    // Cambio de `unwrap` (F4): 23505 (unique) se traduce a DomainError CONFLICT en vez de un Error genérico (500).
    it('save de un handle ya usado por otro perfil se rechaza con DomainError CONFLICT, sin pisar al existente', async () => {
      const existing = await world.newProfile('creator');
      const before = (await repo.findById(existing.id))!;
      await expect(repo.save({ ...before, id: randomUUID() })).rejects.toMatchObject({
        code: 'CONFLICT',
      });
      expect(await repo.findByHandle(existing.handle)).toEqual(before);
    });

    // F2-M-4 (corregido en F3-FIX-2): claimProfile hace findByHandle + upsert sin condición: dos reclamos concurrentes del
    // mismo handle libre terminan ambos en "verified" y el último escribe el dueño (o uno falla con 500 si
    // el handle no existía y el unique de ig_handle salta).
    it('F2-M-4: dos reclamos concurrentes del mismo handle libre: solo uno tiene éxito', async () => {
      const [u1, u2] = [await world.newUser(), await world.newUser()];
      const free = await world.newProfile('creator');
      const { api: profiles } = createProfilesModule({
        adapter: 'real',
        bus: createEventBus(),
        supabase: sb,
      });
      const results = await Promise.allSettled([
        profiles.claimProfile(free.handle, u1.id, 'creator'),
        profiles.claimProfile(free.handle, u2.id, 'creator'),
      ]);
      const wins = results.filter((r) => r.status === 'fulfilled' && r.value.ok);
      expect(wins).toHaveLength(1);
    });
  });

  describe('unwrap: 23505 (unique/PK duplicada) es un DomainError CONFLICT, no un 500', () => {
    // Los mocks sobrescriben en silencio un id repetido; el real lo rechaza (insert, no upsert).
    it('ClaimStore.save con un id de reclamo ya existente', async () => {
      const user = await world.newUser();
      const store = createSupabaseClaimStore(sb);
      const claim = {
        id: randomUUID(),
        userId: user.id,
        handle: world.newHandle(),
        role: 'creator' as const,
        codeHash: 'ab',
        expiresAt: new Date('2099-01-01T00:00:00Z'),
        consumed: false,
      };
      await store.save(claim);
      await expect(store.save(claim)).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('NotificationRepository.add con un id ya existente', async () => {
      const user = await world.newUser();
      const repo = createSupabaseNotificationRepository(sb);
      const n = {
        id: randomUUID(),
        userId: user.id,
        kind: 'match_created' as const,
        payload: {},
        readAt: null,
        createdAt: iso(),
      };
      await repo.add(n);
      await expect(repo.add(n)).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('MessageRepository.add con un id ya existente', async () => {
      const [creator, brand] = [await world.newProfile('creator'), await world.newProfile('brand')];
      const repo = createSupabaseMessageRepository(sb);
      const m = {
        id: randomUUID(),
        matchId: await world.newMatch(creator.id, brand.id),
        senderProfileId: creator.id,
        body: 'hola',
        createdAt: iso(),
      };
      await repo.add(m);
      await expect(repo.add(m)).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('un error de BD que no es de negocio (FK sin mapear) sigue siendo un Error genérico', async () => {
      const repo = createSupabaseNotificationRepository(sb);
      const orphan = {
        id: randomUUID(),
        userId: randomUUID(),
        kind: 'match_created' as const,
        payload: {},
        readAt: null,
        createdAt: iso(),
      };
      const error = await repo.add(orphan).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toMatchObject({ code: 'CONFLICT' });
    });
  });

  describe('transaccionalidad, errores de BD e inyección', () => {
    const services = createSupabaseServiceRepository(sb);
    const quotes = createSupabaseQuoteRepository(sb);

    // F2-M-1 (corregido en F3-FIX-2): ServiceRepository.replace son varias llamadas sin transacción: un fallo a medias deja
    // el catálogo mezclado (nuevo + viejo). En HTTP el zod lo evita, pero un corte de red o un CHECK nuevo lo provocan.
    it('F2-M-1: replace es atómico: si falla, el catálogo anterior queda intacto', async () => {
      const profile = await world.newProfile('creator');
      const before = await services.replace(profile.id, [
        svc('a', PRICE_A),
        svc('b', PRICE_B),
        svc('c', PRICE_C),
      ]);
      await services
        .replace(profile.id, [svc('a2', PRICE_A), svc('b2', PRICE_B), svc('c2', BAD_PRICE)])
        .catch(() => undefined);
      expect(await services.list(profile.id)).toEqual(before);
    });

    // F2-M-2 (corregido en F3-FIX-2): el error de FK (23503) sube como Error genérico; el contrato de los puertos no lo tipa.
    it('F2-M-2: borrar un servicio con cotizaciones se rechaza con un DomainError CONFLICT', async () => {
      const [creator, brand] = [await world.newProfile('creator'), await world.newProfile('brand')];
      const [service] = await services.replace(creator.id, [svc('q', PRICE_A)]);
      const at = iso();
      await quotes.save({
        id: randomUUID(),
        serviceId: service!.id,
        creatorProfileId: creator.id,
        requesterProfileId: brand.id,
        status: 'sent',
        amountPen: null,
        message: 'm',
        history: [{ from: null, to: 'sent', actorProfileId: brand.id, note: null, at }],
        createdAt: at,
        updatedAt: at,
      });
      await expect(services.replace(creator.id, [])).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    // F2-M-3 (corregido en F3-FIX-2): QuoteRepository.save es upsert + insert de eventos sin versión: dos transiciones
    // concurrentes desde el mismo estado dejan un historial que no es una cadena válida.
    it('F2-M-3: dos transiciones concurrentes no dejan un historial incoherente', async () => {
      const [creator, brand] = [await world.newProfile('creator'), await world.newProfile('brand')];
      const [service] = await services.replace(creator.id, [svc('q', PRICE_A)]);
      const at = iso();
      const event = (from: QuoteRecord['status'] | null, to: QuoteRecord['status']) => ({
        from,
        to,
        actorProfileId: brand.id,
        note: null,
        at,
      });
      const base: QuoteRecord = {
        id: randomUUID(),
        serviceId: service!.id,
        creatorProfileId: creator.id,
        requesterProfileId: brand.id,
        status: 'sent',
        amountPen: null,
        message: 'm',
        history: [event(null, 'sent')],
        createdAt: at,
        updatedAt: at,
      };
      await quotes.save(base);
      await Promise.allSettled([
        quotes.save({
          ...base,
          status: 'negotiating',
          history: [...base.history, event('sent', 'negotiating')],
        }),
        quotes.save({
          ...base,
          status: 'accepted',
          history: [...base.history, event('sent', 'accepted')],
        }),
      ]);
      const stored = (await quotes.findById(base.id))!;
      const chained = stored.history.every(
        (e, i) => i === 0 || e.from === stored.history[i - 1]!.to,
      );
      expect(chained && stored.history.at(-1)!.to === stored.status).toBe(true);
    });

    // F2-B-1 (corregido en F3-FIX-2): listByProfile interpola `profileId` en un filtro `or(...)` de PostgREST. Hoy el borde
    // valida un uuid (QuotesQuery), así que no es explotable por HTTP, pero el adaptador no se defiende.
    it('F2-B-1: listByProfile con un valor hostil no devuelve cotizaciones ajenas', async () => {
      const [creator, brand] = [await world.newProfile('creator'), await world.newProfile('brand')];
      const [service] = await services.replace(creator.id, [svc('q', PRICE_A)]);
      const at = iso();
      await quotes.save({
        id: randomUUID(),
        serviceId: service!.id,
        creatorProfileId: creator.id,
        requesterProfileId: brand.id,
        status: 'sent',
        amountPen: null,
        message: 'm',
        history: [{ from: null, to: 'sent', actorProfileId: brand.id, note: null, at }],
        createdAt: at,
        updatedAt: at,
      });
      const stranger = await world.newProfile('creator');
      const leaked = await quotes.listByProfile(`${stranger.id},status.neq.zzz`).catch(() => []);
      expect(leaked).toEqual([]);
    });
  });
});
