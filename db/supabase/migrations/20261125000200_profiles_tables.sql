create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  ig_handle text not null unique check (ig_handle ~ '^[a-z0-9._]{1,30}$'),
  role text not null check (role in ('creator', 'brand')),
  status text not null default 'unclaimed' check (status in ('unclaimed', 'verified', 'removed')),
  owner_user_id uuid references auth.users (id) on delete set null,
  declared jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_owner_user_id_idx on public.profiles (owner_user_id);

create table public.creator_services (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('publicacion-patrocinada', 'canje', 'embajador', 'evento', 'contenido-ugc')),
  format text not null check (format in ('post', 'reel', 'story', 'live', 'combo')),
  price_pen integer not null check (price_pen >= 0),
  description text not null default '',
  created_at timestamptz not null default now()
);
create index creator_services_profile_id_idx on public.creator_services (profile_id);

create table public.profile_removal_requests (
  id uuid primary key default gen_random_uuid(),
  ig_handle text not null,
  email text not null,
  reason text,
  created_at timestamptz not null default now()
);
create index profile_removal_requests_ig_handle_idx on public.profile_removal_requests (ig_handle);

alter table public.profiles enable row level security;
alter table public.creator_services enable row level security;
alter table public.profile_removal_requests enable row level security;
