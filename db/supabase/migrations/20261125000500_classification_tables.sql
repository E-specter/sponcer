create table public.profile_classifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  niches jsonb not null default '[]',
  tier text not null check (tier in ('nano', 'micro', 'mid', 'macro', 'mega')),
  followers integer not null default 0 check (followers >= 0),
  engagement_rate double precision not null default 0 check (engagement_rate >= 0),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  classified_at timestamptz not null default now()
);

create table public.profile_embeddings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  embedding extensions.vector(384) not null,
  model text not null,
  created_at timestamptz not null default now()
);
create index profile_embeddings_embedding_idx on public.profile_embeddings
  using hnsw (embedding extensions.vector_cosine_ops);

alter table public.profile_classifications enable row level security;
alter table public.profile_embeddings enable row level security;
