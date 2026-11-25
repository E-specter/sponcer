-- Columnas que necesitan los adaptadores reales y el esquema inicial no tenía.

-- Orden estable del catálogo de servicios: se actualizan por id (FK de quotes), no se borran y reinsertan.
alter table public.creator_services add column position integer not null default 0;

-- Estado del pedido de exclusión: `applied` (lo pidió el dueño verificado) | `pending` (revisión manual).
alter table public.profile_removal_requests
  add column status text not null default 'pending' check (status in ('pending', 'applied'));

alter table public.profile_claims add column consumed boolean not null default false;

-- Orden de inserción del historial (varios eventos pueden compartir `at`).
alter table public.quote_events add column seq bigint generated always as identity;
create index quote_events_quote_seq_idx on public.quote_events (quote_id, seq);
