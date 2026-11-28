-- F7 (ADR-009): cuentas Empresa/Influencer, registro con consentimiento, campañas, cotización sin match y visibilidad.
-- Todas las tablas nuevas tienen RLS activo. Sin políticas = solo service_role (backend), salvo `profile_views`.

-- ---- Cuentas y registro ----
create table public.accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  account_kind text not null check (account_kind in ('company', 'influencer')),
  -- Solo para influencers; las empresas guardan sus datos en `companies`.
  display_name text,
  city text,
  about text,
  created_at timestamptz not null default now(),
  check (account_kind <> 'influencer' or (display_name is not null and city is not null))
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references auth.users (id) on delete cascade,
  person_type text not null check (person_type in ('natural', 'juridica')),
  document_type text not null check (document_type in ('dni', 'ruc')),
  document_number text not null unique,
  legal_name text not null,
  trade_name text,
  city text not null,
  created_at timestamptz not null default now()
);

create table public.consents (
  user_id uuid not null references auth.users (id) on delete cascade,
  version text not null,
  terms boolean not null,
  privacy boolean not null,
  accepted_at timestamptz not null default now(),
  primary key (user_id, version)
);

-- Las marcas (perfiles `brand`) cuelgan de una empresa; null para creadores y fichas sin dueño.
alter table public.profiles add column company_id uuid references public.companies (id) on delete set null;
create index profiles_company_id_idx on public.profiles (company_id);

alter table public.accounts enable row level security;
alter table public.companies enable row level security;
alter table public.consents enable row level security;

-- ---- Campañas ----
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  brand_profile_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('season', 'general', 'segment', 'other')),
  description text,
  starts_on date not null,
  ends_on date,
  budget_pen integer check (budget_pen >= 0),
  target_niches text[] not null default '{}',
  target_cities text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'active', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);
create index campaigns_brand_idx on public.campaigns (brand_profile_id, created_at desc);
alter table public.campaigns enable row level security;

-- ---- Cotizaciones: siempre dentro de una campaña; el servicio es opcional (propuesta abierta) ----
alter table public.quotes add column campaign_id uuid references public.campaigns (id) on delete cascade;
alter table public.quotes alter column service_id drop not null;

-- Las cotizaciones anteriores pasan a una campaña "General" por marca.
insert into public.campaigns (brand_profile_id, name, kind, description, starts_on, status)
select distinct requester_profile_id, 'General', 'general', 'Cotizaciones anteriores a las campañas', current_date, 'active'
from public.quotes;
update public.quotes q set campaign_id = c.id
from public.campaigns c
where c.brand_profile_id = q.requester_profile_id and c.name = 'General';
alter table public.quotes alter column campaign_id set not null;

create index quotes_campaign_idx on public.quotes (campaign_id);
-- El esquema anterior permitía varias abiertas al mismo creador: queda la más reciente, las demás se cancelan.
with dup as (
  select id, status, requester_profile_id from (
    select id, status, requester_profile_id,
      row_number() over (partition by campaign_id, creator_profile_id order by created_at desc, id desc) rn
    from public.quotes where status in ('draft', 'sent', 'negotiating', 'accepted')
  ) t where rn > 1
), upd as (
  update public.quotes q set status = 'cancelled', updated_at = now() from dup where q.id = dup.id returning q.id
)
insert into public.quote_events (quote_id, from_status, to_status, actor_profile_id, note)
select id, status, 'cancelled', requester_profile_id, 'cancelada al migrar a campañas: duplicada' from dup;
-- Una sola cotización abierta (no terminal) por creador y campaña; respaldo de la regla del backend ante carreras.
create unique index quotes_open_per_creator_campaign_idx on public.quotes (campaign_id, creator_profile_id)
  where status in ('draft', 'sent', 'negotiating', 'accepted');

-- ---- Visibilidad: visitas a fichas (una fila por visitante, ficha y día) ----
create table public.profile_views (
  viewer_profile_id uuid not null references public.profiles (id) on delete cascade,
  viewed_profile_id uuid not null references public.profiles (id) on delete cascade,
  viewed_on date not null,
  count integer not null default 1 check (count > 0),
  last_at timestamptz not null default now(),
  primary key (viewer_profile_id, viewed_profile_id, viewed_on)
);
create index profile_views_viewed_idx on public.profile_views (viewed_profile_id, viewed_on desc);
alter table public.profile_views enable row level security;

-- El dueño de la ficha vista lee sus visitas; la escritura es solo de la service role.
-- Función security definer (como is_match_participant): profiles no tiene políticas de lectura para authenticated.
create function public.owns_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_profile_id and p.owner_user_id = (select auth.uid())
  );
$$;

revoke all on function public.owns_profile(uuid) from public, anon;
grant execute on function public.owns_profile(uuid) to authenticated;

create policy profile_views_select_viewed_owner on public.profile_views
  for select to authenticated using (public.owns_profile(viewed_profile_id));

-- ---- RPC ----
-- Registro atómico: cuenta + empresa/influencer + consentimiento. Errores de negocio con SQLSTATE 'SP409'
-- y mensaje 'already_registered' | 'document_taken'.
create function public.register_account(
  p_user_id uuid, p_kind text, p_company jsonb, p_influencer jsonb, p_version text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_kind = 'company' then
    begin
      insert into public.accounts (user_id, account_kind) values (p_user_id, 'company');
    exception when unique_violation then
      raise exception 'already_registered' using errcode = 'SP409';
    end;
    begin
      insert into public.companies (owner_user_id, person_type, document_type, document_number, legal_name, trade_name, city)
      values (p_user_id, p_company ->> 'personType', p_company ->> 'documentType', p_company ->> 'documentNumber',
              p_company ->> 'legalName', p_company ->> 'tradeName', p_company ->> 'city');
    exception when unique_violation then
      raise exception 'document_taken' using errcode = 'SP409';
    end;
  else
    begin
      insert into public.accounts (user_id, account_kind, display_name, city, about)
      values (p_user_id, 'influencer', p_influencer ->> 'displayName', p_influencer ->> 'city', p_influencer ->> 'about');
    exception when unique_violation then
      raise exception 'already_registered' using errcode = 'SP409';
    end;
  end if;
  insert into public.consents (user_id, version, terms, privacy) values (p_user_id, p_version, true, true);
end;
$$;

-- Igual que antes, pero una marca queda ligada a la empresa de su dueño.
create or replace function public.claim_profile(p_handle text, p_user_id uuid, p_role text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_status text;
  v_company uuid;
begin
  select id into v_company from public.companies where owner_user_id = p_user_id and p_role = 'brand';

  insert into public.profiles (ig_handle, role, status, owner_user_id, company_id)
    values (p_handle, p_role, 'verified', p_user_id, v_company)
    on conflict (ig_handle) do nothing
    returning id into v_id;

  if v_id is null then
    -- El rol lo declara el usuario; si cambia, los datos declarados del otro rol no valen.
    update public.profiles set
      declared = case when role <> p_role then null else declared end,
      role = p_role, status = 'verified', owner_user_id = p_user_id, company_id = v_company, updated_at = now()
    where ig_handle = p_handle and status <> 'removed'
      and (owner_user_id is null or owner_user_id = p_user_id)
    returning id into v_id;
  end if;

  if v_id is not null then
    return jsonb_build_object('status', 'claimed', 'profile_id', v_id);
  end if;
  select status into v_status from public.profiles where ig_handle = p_handle;
  return jsonb_build_object('status', case when v_status = 'removed' then 'removed' else 'owned' end);
end;
$$;

revoke execute on function public.register_account(uuid, text, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.register_account(uuid, text, jsonb, jsonb, text) to service_role;
