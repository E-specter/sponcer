create table public.ig_snapshots (
  id uuid primary key default gen_random_uuid(),
  ig_handle text not null,
  fetched_at timestamptz not null default now(),
  payload jsonb not null,
  source text not null check (source in ('mock', 'apify')),
  created_at timestamptz not null default now()
);
create index ig_snapshots_handle_fetched_idx on public.ig_snapshots (ig_handle, fetched_at desc);

create table public.ingestion_blocklist (
  id uuid primary key default gen_random_uuid(),
  ig_handle text not null unique,
  reason text,
  created_at timestamptz not null default now()
);

alter table public.ig_snapshots enable row level security;
alter table public.ingestion_blocklist enable row level security;
