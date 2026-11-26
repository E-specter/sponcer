import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anonClient,
  clientWithJwt,
  createWorld,
  hasSupabase,
  SERVICE_AUTH_HEADER,
  serviceClient,
  SUPABASE_URL,
  TEST_HANDLE_PREFIX,
  uniqueTag,
} from './support/supabase';

/**
 * RLS contra Supabase local (RNF-03): por cada tabla, el caso permitido y los denegados.
 * Solo `notifications` (propias) y `messages` (de matches donde el usuario es dueño de un perfil)
 * tienen política de lectura para `authenticated`; todo lo demás es solo del backend (service_role).
 * Crea usuarios y filas temporales (prefijo `zz.` / dominio `audit.test`) y los borra al terminar.
 */
const TABLES = [
  'admin_users',
  'creator_services',
  'ig_snapshots',
  'ingestion_blocklist',
  'interactions',
  'matches',
  'messages',
  'notifications',
  'profile_claim_attempts',
  'profile_claims',
  'profile_classifications',
  'profile_embeddings',
  'profile_removal_requests',
  'profiles',
  'quote_events',
  'quotes',
] as const;
type Table = (typeof TABLES)[number];
const READABLE_BY_AUTHENTICATED: Table[] = ['notifications', 'messages'];
const NEVER_READABLE = TABLES.filter((t) => !READABLE_BY_AUTHENTICATED.includes(t));

const RLS_DENIED = '42501';
/** Columna clave de cada tabla (todas usan `id` salvo admin_users, cuya clave es el correo). */
const keyOf = (t: Table) => (t === 'admin_users' ? 'email' : 'id');
const EMBEDDING_DIMS = 384;
const SETUP_TIMEOUT_MS = 60_000;
const NO_ROW_UUID = '00000000-0000-4000-8000-000000000000';
const WINDOW_MINUTES = 60;
const MAX_ATTEMPTS = 5;
const BURST_FACTOR = 3;
const HTTP_OK = 200;
const BENIGN_DATE = '2000-01-01T00:00:00.000Z';
const embeddingLiteral = `[${Array.from({ length: EMBEDDING_DIMS }, (_, i) => (i === 0 ? 1 : 0)).join(',')}]`;
const zeros = `[${Array.from({ length: EMBEDDING_DIMS }, () => 0).join(',')}]`;

describe.skipIf(!hasSupabase)('RLS (Supabase local)', () => {
  const sb = serviceClient();
  const world = createWorld(sb);
  const anon = anonClient();
  const ids = {} as Record<Table, string>;
  const own = {} as Record<string, string>;
  let asA = anon;
  let asB = anon;
  let asC = anon;
  const tag = uniqueTag();

  async function insert(table: Table, row: object): Promise<string> {
    const res = await sb.from(table).insert(row).select('id').single<{ id: string }>();
    if (res.error) throw new Error(`seed ${table}: ${res.error.message}`);
    return String(res.data.id);
  }

  beforeAll(async () => {
    const [userA, userB, userC] = [
      await world.newUser(),
      await world.newUser(),
      await world.newUser(),
    ];
    [asA, asB, asC] = (await Promise.all(
      [userA, userB, userC].map(async (u) => clientWithJwt(await world.signIn(u))),
    )) as [typeof anon, typeof anon, typeof anon];
    Object.assign(own, { userA: userA.id, userB: userB.id, userC: userC.id });
    const pa = await world.newProfile('creator', userA.id);
    const pb = await world.newProfile('brand', userB.id);
    const pc = await world.newProfile('brand', null);
    const service = await world.newService(pa.id);
    const m1 = await world.newMatch(pa.id, pb.id);
    const m2 = await world.newMatch(pa.id, pc.id);
    Object.assign(own, { pa: pa.id, pb: pb.id, pc: pc.id, pcHandle: pc.handle, service, m1, m2 });

    ids.profiles = pa.id;
    ids.creator_services = service;
    ids.matches = m1;
    ids.messages = await insert('messages', {
      match_id: m1,
      sender_profile_id: pa.id,
      body: `m1-${tag}`,
    });
    own.messageM2 = await insert('messages', {
      match_id: m2,
      sender_profile_id: pa.id,
      body: `m2-${tag}`,
    });
    ids.notifications = await insert('notifications', {
      user_id: userA.id,
      kind: 'match_created',
      payload: { tag },
    });
    own.notificationB = await insert('notifications', {
      user_id: userB.id,
      kind: 'match_created',
      payload: { tag },
    });
    const quote = await insert('quotes', {
      service_id: service,
      creator_profile_id: pa.id,
      requester_profile_id: pb.id,
      status: 'sent',
      message: 'hola',
    });
    ids.quotes = quote;
    ids.quote_events = await insert('quote_events', {
      quote_id: quote,
      to_status: 'sent',
      actor_profile_id: pb.id,
    });
    ids.interactions = await insert('interactions', {
      actor_profile_id: pb.id,
      target_profile_id: pa.id,
      kind: 'interest',
    });
    ids.profile_claims = await insert('profile_claims', {
      user_id: userA.id,
      ig_handle: `${TEST_HANDLE_PREFIX}${tag}`,
      role: 'creator',
      code_hash: 'ab',
      expires_at: '2099-01-01T00:00:00Z',
    });
    ids.profile_removal_requests = await insert('profile_removal_requests', {
      ig_handle: `${TEST_HANDLE_PREFIX}${tag}`,
      email: `x@audit.test`,
    });
    ids.ingestion_blocklist = await insert('ingestion_blocklist', {
      ig_handle: `${TEST_HANDLE_PREFIX}b${tag}`,
    });
    ids.ig_snapshots = await insert('ig_snapshots', {
      ig_handle: `${TEST_HANDLE_PREFIX}${tag}`,
      payload: {},
      source: 'mock',
    });
    ids.profile_classifications = await insert('profile_classifications', {
      profile_id: pa.id,
      tier: 'nano',
    });
    ids.profile_embeddings = await insert('profile_embeddings', {
      profile_id: pa.id,
      embedding: embeddingLiteral,
      model: 'test',
    });
    await sb.rpc('record_claim_attempt', {
      p_user_id: userA.id,
      p_window_minutes: WINDOW_MINUTES,
      p_max: MAX_ATTEMPTS,
    });
    const attempt = await sb
      .from('profile_claim_attempts')
      .select('id')
      .eq('user_id', userA.id)
      .single<{ id: number }>();
    ids.profile_claim_attempts = String(attempt.data!.id);
    ids.admin_users = `rls.${tag}@audit.test`;
    const admin = await sb.from('admin_users').insert({ email: ids.admin_users });
    if (admin.error) throw new Error(`seed admin_users: ${admin.error.message}`);
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    const handle = `${TEST_HANDLE_PREFIX}%${tag}`;
    await sb.from('ig_snapshots').delete().like('ig_handle', handle);
    await sb.from('ingestion_blocklist').delete().like('ig_handle', handle);
    await sb.from('profile_removal_requests').delete().like('ig_handle', handle);
    await sb.from('admin_users').delete().like('email', `%${tag}@audit.test`);
    await world.cleanup();
  }, SETUP_TIMEOUT_MS);

  const serviceCount = async (table: Table, filter?: [string, string]) => {
    const q = sb.from(table).select('*', { count: 'exact', head: true });
    const { count } = await (filter ? q.eq(filter[0], filter[1]) : q);
    return count ?? 0;
  };

  it('el esquema expone exactamente las tablas esperadas (una tabla nueva obliga a ampliar esta suite)', async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, { headers: SERVICE_AUTH_HEADER });
    const spec = (await res.json()) as { definitions: Record<string, unknown> };
    expect(Object.keys(spec.definitions).sort()).toEqual([...TABLES].sort());
  });

  describe('precondición: hay datos que proteger', () => {
    it.each(TABLES)(
      '%s tiene filas visibles para service_role (si no, "0 filas" no probaría nada)',
      async (table) => {
        expect(await serviceCount(table)).toBeGreaterThan(0);
      },
    );
  });

  describe('anon (sin sesión)', () => {
    it.each(TABLES)('no lee nada de %s', async (table) => {
      const { data, error } = await anon.from(table).select('*');
      expect(error ? [] : data).toEqual([]);
    });
  });

  describe('authenticated: lectura', () => {
    it.each(NEVER_READABLE)('no lee ninguna fila de %s, ni siquiera la propia', async (table) => {
      const { data, error } = await asA.from(table).select('*');
      expect(error ? [] : data).toEqual([]);
    });

    it('lee solo sus notificaciones (permitido) y no las de otro usuario (denegado)', async () => {
      const mine = await asA.from('notifications').select('id, user_id');
      expect(mine.error).toBeNull();
      expect(mine.data?.length).toBeGreaterThan(0);
      expect(mine.data?.every((n) => n.user_id === own.userA)).toBe(true);
      const theirs = await asA.from('notifications').select('id').eq('id', own.notificationB);
      expect(theirs.data).toEqual([]);
      const filtered = await asA.from('notifications').select('id').eq('user_id', own.userB);
      expect(filtered.data).toEqual([]);
    });

    // R-1 (corregido en 20261125001300): la política usa is_match_participant (security definer); antes consultaba
    // matches/profiles con RLS sin políticas y nadie podía leer mensajes, tampoco por Realtime.
    it('R-1: lee los mensajes de los matches donde es dueño de un perfil (A: M1 y M2; B: solo M1)', async () => {
      const a = await asA.from('messages').select('id').in('id', [ids.messages, own.messageM2!]);
      expect((a.data ?? []).map((m) => m.id).sort()).toEqual([ids.messages, own.messageM2].sort());
      const b = await asB.from('messages').select('id').in('id', [ids.messages, own.messageM2!]);
      expect((b.data ?? []).map((m) => m.id)).toEqual([ids.messages]);
    });

    it('un usuario sin perfiles en el match no lee sus mensajes', async () => {
      const c = await asC.from('messages').select('id').in('id', [ids.messages, own.messageM2!]);
      expect(c.data).toEqual([]);
    });

    it('un perfil sin dueño no da acceso al match a nadie más (M2 solo es de A)', async () => {
      const b = await asB.from('messages').select('id').eq('match_id', own.m2!);
      expect(b.data).toEqual([]);
    });
  });

  describe('escritura denegada para authenticated y anon', () => {
    const insertRows: Record<Table, () => object> = {
      admin_users: () => ({ email: `x${uniqueTag()}@audit.test` }),
      creator_services: () => ({ profile_id: own.pa, type: 'canje', format: 'reel', price_pen: 1 }),
      ig_snapshots: () => ({
        ig_handle: `${TEST_HANDLE_PREFIX}i${uniqueTag()}`,
        payload: {},
        source: 'mock',
      }),
      ingestion_blocklist: () => ({ ig_handle: `${TEST_HANDLE_PREFIX}b${uniqueTag()}` }),
      interactions: () => ({
        actor_profile_id: own.pa,
        target_profile_id: own.pb,
        kind: 'interest',
      }),
      matches: () => ({ creator_profile_id: own.pa, brand_profile_id: own.pc }),
      messages: () => ({ match_id: own.m1, sender_profile_id: own.pa, body: 'suplantado' }),
      notifications: () => ({ user_id: own.userA, kind: 'match_created', payload: {} }),
      profile_claim_attempts: () => ({ user_id: own.userA }),
      profile_claims: () => ({
        user_id: own.userA,
        ig_handle: 'x',
        role: 'creator',
        code_hash: 'a',
        expires_at: '2099-01-01',
      }),
      profile_classifications: () => ({ profile_id: own.pc, tier: 'mega' }),
      profile_embeddings: () => ({ profile_id: own.pc, embedding: zeros, model: 'x' }),
      profile_removal_requests: () => ({ ig_handle: 'x', email: 'a@b.pe' }),
      profiles: () => ({
        ig_handle: `${TEST_HANDLE_PREFIX}p${uniqueTag()}`,
        role: 'creator',
        owner_user_id: own.userA,
      }),
      quote_events: () => ({
        quote_id: ids.quotes,
        to_status: 'accepted',
        actor_profile_id: own.pa,
      }),
      quotes: () => ({
        service_id: own.service,
        creator_profile_id: own.pa,
        requester_profile_id: own.pb,
        status: 'sent',
        message: 'x',
      }),
    };
    // Una columna inocua por tabla para probar el UPDATE.
    const touch: Record<Table, Record<string, unknown>> = {
      admin_users: { granted_by: 'hack@audit.test' },
      creator_services: { price_pen: 1 },
      ig_snapshots: { created_at: BENIGN_DATE },
      ingestion_blocklist: { reason: 'hack' },
      interactions: { kind: 'dismiss' },
      matches: { created_at: BENIGN_DATE },
      messages: { body: 'editado' },
      notifications: { read_at: BENIGN_DATE },
      profile_claim_attempts: { at: BENIGN_DATE },
      profile_claims: { attempts: 0, consumed: true },
      profile_classifications: { tier: 'mega' },
      profile_embeddings: { model: 'hack' },
      profile_removal_requests: { status: 'applied' },
      profiles: { status: 'removed' },
      quote_events: { note: 'editado' },
      quotes: { status: 'accepted' },
    };
    const roles = { authenticated: () => asA, anon: () => anon };

    describe.each(Object.keys(roles) as Array<keyof typeof roles>)('como %s', (role) => {
      it.each(TABLES)('INSERT en %s falla por RLS (42501)', async (table) => {
        const before = await serviceCount(table);
        const { error } = await roles[role]().from(table).insert(insertRows[table]());
        expect(error?.code).toBe(RLS_DENIED);
        expect(await serviceCount(table)).toBe(before);
      });

      it.each(TABLES)('UPDATE en %s no cambia ninguna fila', async (table) => {
        const { data } = await roles[role]()
          .from(table)
          .update(touch[table])
          .eq(keyOf(table), ids[table])
          .select();
        expect(data ?? []).toEqual([]);
        const check = await sb.from(table).select('*').eq(keyOf(table), ids[table]).single();
        const changed = Object.entries(touch[table]).filter(
          ([k, v]) => k !== 'attempts' && check.data?.[k] === v,
        );
        expect(changed).toEqual([]);
      });

      it.each(TABLES)('DELETE en %s no borra ninguna fila', async (table) => {
        const { data } = await roles[role]()
          .from(table)
          .delete()
          .eq(keyOf(table), ids[table])
          .select();
        expect(data ?? []).toEqual([]);
        expect(await serviceCount(table, [keyOf(table), ids[table]])).toBe(1);
      });
    });

    it('un UPDATE/DELETE masivo (sin filtro de id) tampoco toca nada', async () => {
      const before = await serviceCount('profiles');
      await asA.from('profiles').update({ status: 'removed' }).neq('id', NO_ROW_UUID);
      await asA.from('profiles').delete().neq('id', NO_ROW_UUID);
      expect(await serviceCount('profiles')).toBe(before);
      const removed = await sb
        .from('profiles')
        .select('id')
        .eq('status', 'removed')
        .eq('id', own.pa!);
      expect(removed.data).toEqual([]);
    });
  });

  describe('is_match_participant (security definer, solo authenticated)', () => {
    it('anon no puede ejecutarla', async () => {
      const r = await anon.rpc('is_match_participant', { p_match_id: own.m1 });
      expect(r.data).toBeNull();
      expect(r.error).not.toBeNull();
    });

    it('authenticated solo obtiene verdadero para sus propios matches (no es un oráculo de terceros)', async () => {
      const mine = await asA.rpc('is_match_participant', { p_match_id: own.m1 });
      expect(mine.data).toBe(true);
      const theirs = await asB.rpc('is_match_participant', { p_match_id: own.m2 });
      expect(theirs.data).toBe(false);
      const none = await asC.rpc('is_match_participant', { p_match_id: own.m1 });
      expect(none.data).toBe(false);
    });
  });

  // F5: bucket público de fotos. Lectura pública por URL; escritura y borrado SOLO del backend (service_role).
  describe('Storage · bucket profile-images', () => {
    const BUCKET = 'profile-images';
    const PNG = new Uint8Array(Buffer.from('iVBORw0KGgo=', 'base64'));
    const objectPath = () => `${TEST_HANDLE_PREFIX}${tag}/foto-${uniqueTag()}.png`;
    const upload = (client: typeof anon, path: string) =>
      client.storage.from(BUCKET).upload(path, PNG, { contentType: 'image/png' });

    it('el bucket es público pero no admite escritura de anon ni de authenticated', async () => {
      const [a, u] = [objectPath(), objectPath()];
      const [asAnon, asUser] = await Promise.all([upload(anon, a), upload(asA, u)]);
      expect(asAnon.error).not.toBeNull();
      expect(asUser.error).not.toBeNull();
      const present = await sb.storage.from(BUCKET).list(`${TEST_HANDLE_PREFIX}${tag}`);
      expect(present.data ?? []).toEqual([]);
    });

    it('lectura pública por URL de un objeto subido por el backend; anon y authenticated no pueden borrarlo ni reemplazarlo', async () => {
      const path = objectPath();
      expect((await upload(sb, path)).error).toBeNull();
      const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      expect((await fetch(url)).status).toBe(HTTP_OK);
      await Promise.all([
        anon.storage.from(BUCKET).remove([path]),
        asA.storage.from(BUCKET).remove([path]),
      ]);
      expect((await fetch(url)).status).toBe(HTTP_OK);
      const overwrite = await asA.storage
        .from(BUCKET)
        .upload(path, PNG, { contentType: 'image/png', upsert: true });
      expect(overwrite.error).not.toBeNull();
      expect((await sb.storage.from(BUCKET).remove([path])).error).toBeNull();
      expect((await fetch(url)).status).not.toBe(HTTP_OK);
    });

    it('rechaza tipos que no son imagen aunque suba el backend (allowed_mime_types)', async () => {
      const bad = await sb.storage
        .from(BUCKET)
        .upload(objectPath(), new TextEncoder().encode('<h1>x</h1>'), { contentType: 'text/html' });
      expect(bad.error).not.toBeNull();
    });
  });

  describe('funciones RPC (solo service_role)', () => {
    const attempt = {
      p_user_id: NO_ROW_UUID,
      p_window_minutes: WINDOW_MINUTES,
      p_max: MAX_ATTEMPTS,
    };
    const candidates = { p_embedding: zeros, p_role: 'creator', p_exclude: [], p_limit: 1 };
    const DENIED = [RLS_DENIED, 'PGRST202'];

    it.each([
      ['anon', () => anon],
      ['authenticated', () => asA],
    ])('%s no puede ejecutar record_claim_attempt ni match_candidates', async (_role, client) => {
      const a = await client().rpc('record_claim_attempt', { ...attempt, p_user_id: own.userA });
      expect(DENIED).toContain(a.error?.code);
      expect(a.data).toBeNull();
      const m = await client().rpc('match_candidates', candidates);
      expect(DENIED).toContain(m.error?.code);
      expect(m.data).toBeNull();
    });

    // RPC transaccionales de F3-FIX-2: mutan datos; si fueran ejecutables, authenticated podría vaciar catálogos,
    // reclamar perfiles ajenos o mover cotizaciones saltándose los casos de uso.
    it.each([
      ['anon', () => anon],
      ['authenticated', () => asA],
    ])(
      '%s no puede ejecutar replace_creator_services, claim_profile ni transition_quote (y nada cambia)',
      async (_role, client) => {
        const replace = await client().rpc('replace_creator_services', {
          p_profile_id: own.pa,
          p_services: [],
        });
        const claim = await client().rpc('claim_profile', {
          p_handle: own.pcHandle,
          p_user_id: own.userA,
          p_role: 'brand',
        });
        const transition = await client().rpc('transition_quote', {
          p_quote_id: ids.quotes,
          p_expected_status: 'sent',
          p_to: 'accepted',
          p_actor: own.pa,
          p_amount: 1,
          p_note: 'x',
          p_at: BENIGN_DATE,
        });
        [replace, claim, transition].forEach((r) => {
          expect(DENIED).toContain(r.error?.code);
          expect(r.data).toBeNull();
        });
        expect(await serviceCount('creator_services', ['profile_id', own.pa!])).toBe(1);
        const pc = await sb.from('profiles').select('owner_user_id').eq('id', own.pc!).single();
        expect(pc.data?.owner_user_id).toBeNull();
        const quote = await sb.from('quotes').select('status').eq('id', ids.quotes).single();
        expect(quote.data?.status).toBe('sent');
      },
    );

    it('record_claim_attempt denegada no registró ningún intento nuevo', async () => {
      const { count } = await sb
        .from('profile_claim_attempts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', own.userA!);
      expect(count).toBe(1);
    });

    it('service_role sí las ejecuta (control positivo)', async () => {
      const a = await sb.rpc('record_claim_attempt', { ...attempt, p_user_id: own.userB });
      expect(a.error).toBeNull();
      expect(a.data).toBe(true);
      const m = await sb.rpc('match_candidates', {
        ...candidates,
        p_embedding: embeddingLiteral,
        p_role: 'creator',
      });
      expect(m.error).toBeNull();
      expect(Array.isArray(m.data)).toBe(true);
    });

    it('record_claim_attempt es atómica y respeta el máximo bajo concurrencia', async () => {
      const burst = await Promise.all(
        Array.from({ length: MAX_ATTEMPTS * BURST_FACTOR }, () =>
          sb.rpc('record_claim_attempt', { ...attempt, p_user_id: own.userC }),
        ),
      );
      expect(burst.filter((r) => r.data === true)).toHaveLength(MAX_ATTEMPTS);
    });
  });
});
