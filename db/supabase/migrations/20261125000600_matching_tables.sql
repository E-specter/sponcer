create table public.interactions (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid not null references public.profiles (id) on delete cascade,
  target_profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('interest', 'dismiss', 'quote')),
  created_at timestamptz not null default now()
);
create index interactions_actor_idx on public.interactions (actor_profile_id);
create index interactions_target_idx on public.interactions (target_profile_id);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  creator_profile_id uuid not null references public.profiles (id) on delete cascade,
  brand_profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (creator_profile_id, brand_profile_id)
);
create index matches_brand_idx on public.matches (brand_profile_id);

alter table public.interactions enable row level security;
alter table public.matches enable row level security;
