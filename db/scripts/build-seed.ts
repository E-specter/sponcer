// Genera db/supabase/seed.sql desde @sponcer/contracts/fixtures. Uso: npm run seed:build -w db
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fixtureProfiles, fixtureSocial, fixtureUsers } from '@sponcer/contracts/fixtures';

const OUT_PATH = fileURLToPath(new URL('../supabase/seed.sql', import.meta.url));
const NIL_UUID = '00000000-0000-0000-0000-000000000000';
const EMAIL_PROVIDER = 'email';

// Comilla simple de SQL: se duplica dentro del literal.
// Coincide: "Sofi's" (la comilla). No coincide: "Sofi".
// Probar: https://regex101.com/?regex=%27&testString=Sofi%27s&flavor=javascript
const SINGLE_QUOTE = /'/g;

type Sql = string;
const str = (v: string): Sql => `'${v.replace(SINGLE_QUOTE, "''")}'`;
const nullable = <T>(v: T | null | undefined, f: (x: T) => Sql): Sql =>
  v === null || v === undefined ? 'null' : f(v);
const num = (v: number): Sql => String(v);
const json = (v: unknown): Sql => `${str(JSON.stringify(v))}::jsonb`;
const ts = (v: string): Sql => `${str(v)}::timestamptz`;
const uuid = (v: string): Sql => `${str(v)}::uuid`;

const insert = (table: string, cols: string[], rows: Sql[][]): Sql =>
  rows.length === 0
    ? ''
    : `insert into ${table} (${cols.join(', ')}) values\n${rows.map((r) => `  (${r.join(', ')})`).join(',\n')};\n`;

const users = insert(
  'auth.users',
  [
    'instance_id',
    'id',
    'aud',
    'role',
    'email',
    'encrypted_password',
    'email_confirmed_at',
    'raw_app_meta_data',
    'raw_user_meta_data',
    'created_at',
    'updated_at',
    'confirmation_token',
    'recovery_token',
    'email_change',
    'email_change_token_new',
  ],
  fixtureUsers.map((u) => [
    uuid(NIL_UUID),
    uuid(u.id),
    str('authenticated'),
    str('authenticated'),
    str(u.email),
    str(''),
    'now()',
    json({ provider: EMAIL_PROVIDER, providers: [EMAIL_PROVIDER] }),
    json({ name: u.name }),
    'now()',
    'now()',
    str(''),
    str(''),
    str(''),
    str(''),
  ]),
);

const identities = insert(
  'auth.identities',
  [
    'id',
    'user_id',
    'provider_id',
    'provider',
    'identity_data',
    'created_at',
    'updated_at',
    'last_sign_in_at',
  ],
  fixtureUsers.map((u) => [
    'gen_random_uuid()',
    uuid(u.id),
    str(u.id),
    str(EMAIL_PROVIDER),
    json({ sub: u.id, email: u.email, email_verified: true }),
    'now()',
    'now()',
    'now()',
  ]),
);

const profiles = insert(
  'public.profiles',
  ['id', 'ig_handle', 'role', 'status', 'owner_user_id', 'declared'],
  fixtureProfiles.map((p) => [
    uuid(p.id),
    str(p.snapshot.handle),
    str(p.role),
    str(p.status),
    nullable(p.ownerUserId, uuid),
    nullable(p.declared, json),
  ]),
);

const services = insert(
  'public.creator_services',
  ['id', 'profile_id', 'type', 'format', 'price_pen', 'description'],
  fixtureProfiles.flatMap((p) =>
    p.services.map((s) => [
      uuid(s.id),
      uuid(p.id),
      str(s.type),
      str(s.format),
      num(s.pricePen),
      str(s.description),
    ]),
  ),
);

const snapshots = insert(
  'public.ig_snapshots',
  ['ig_handle', 'fetched_at', 'payload', 'source'],
  fixtureProfiles.map((p) => [
    str(p.snapshot.handle),
    ts(p.snapshot.fetchedAt),
    json(p.snapshot),
    str(p.snapshot.source),
  ]),
);

const interactions = insert(
  'public.interactions',
  ['id', 'actor_profile_id', 'target_profile_id', 'kind', 'created_at'],
  fixtureSocial.interactions.map((i) => [
    uuid(i.id),
    uuid(i.actorProfileId),
    uuid(i.targetProfileId),
    str(i.kind),
    ts(i.createdAt),
  ]),
);

const matches = insert(
  'public.matches',
  ['id', 'creator_profile_id', 'brand_profile_id', 'created_at'],
  fixtureSocial.matches.map((m) => [
    uuid(m.id),
    uuid(m.creatorProfileId),
    uuid(m.brandProfileId),
    ts(m.createdAt),
  ]),
);

const messages = insert(
  'public.messages',
  ['id', 'match_id', 'sender_profile_id', 'body', 'created_at'],
  fixtureSocial.messages.map((m) => [
    uuid(m.id),
    uuid(m.matchId),
    uuid(m.senderProfileId),
    str(m.body),
    ts(m.createdAt),
  ]),
);

const quotes = insert(
  'public.quotes',
  [
    'id',
    'service_id',
    'creator_profile_id',
    'requester_profile_id',
    'status',
    'amount_pen',
    'message',
    'created_at',
    'updated_at',
  ],
  fixtureSocial.quotes.map((q) => [
    uuid(q.id),
    uuid(q.serviceId),
    uuid(q.creatorProfileId),
    uuid(q.requesterProfileId),
    str(q.status),
    nullable(q.amountPen, num),
    str(q.message),
    ts(q.createdAt),
    ts(q.updatedAt),
  ]),
);

const quoteEvents = insert(
  'public.quote_events',
  ['quote_id', 'from_status', 'to_status', 'actor_profile_id', 'note', 'at'],
  fixtureSocial.quotes.flatMap((q) =>
    q.history.map((e) => [
      uuid(q.id),
      nullable(e.from, str),
      str(e.to),
      uuid(e.actorProfileId),
      nullable(e.note, str),
      ts(e.at),
    ]),
  ),
);

const notifications = insert(
  'public.notifications',
  ['id', 'user_id', 'kind', 'payload', 'read_at', 'created_at'],
  fixtureSocial.notifications.map((n) => [
    uuid(n.id),
    uuid(n.userId),
    str(n.kind),
    json(n.payload),
    nullable(n.readAt, ts),
    ts(n.createdAt),
  ]),
);

const sql = [
  '-- GENERADO por db/scripts/build-seed.ts desde contracts/fixtures. No editar a mano.\n',
  users,
  identities,
  profiles,
  services,
  snapshots,
  interactions,
  matches,
  messages,
  quotes,
  quoteEvents,
  notifications,
].join('\n');

writeFileSync(OUT_PATH, sql);
console.log(`seed.sql escrito en ${OUT_PATH}`);
