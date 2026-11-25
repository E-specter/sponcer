create table public.profile_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ig_handle text not null,
  role text not null check (role in ('creator', 'brand')),
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now()
);
create index profile_claims_user_id_idx on public.profile_claims (user_id);
create index profile_claims_ig_handle_idx on public.profile_claims (ig_handle);

alter table public.profile_claims enable row level security;
