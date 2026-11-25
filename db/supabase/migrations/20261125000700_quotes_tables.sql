create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.creator_services (id) on delete restrict,
  creator_profile_id uuid not null references public.profiles (id) on delete cascade,
  requester_profile_id uuid not null references public.profiles (id) on delete cascade,
  status text not null check (status in ('draft', 'sent', 'negotiating', 'accepted', 'rejected', 'completed', 'cancelled')),
  amount_pen integer check (amount_pen >= 0),
  message text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index quotes_service_idx on public.quotes (service_id);
create index quotes_creator_idx on public.quotes (creator_profile_id);
create index quotes_requester_idx on public.quotes (requester_profile_id);

create table public.quote_events (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  from_status text check (from_status in ('draft', 'sent', 'negotiating', 'accepted', 'rejected', 'completed', 'cancelled')),
  to_status text not null check (to_status in ('draft', 'sent', 'negotiating', 'accepted', 'rejected', 'completed', 'cancelled')),
  actor_profile_id uuid not null references public.profiles (id) on delete cascade,
  note text,
  at timestamptz not null default now()
);
create index quote_events_quote_idx on public.quote_events (quote_id);
create index quote_events_actor_idx on public.quote_events (actor_profile_id);

alter table public.quotes enable row level security;
alter table public.quote_events enable row level security;
