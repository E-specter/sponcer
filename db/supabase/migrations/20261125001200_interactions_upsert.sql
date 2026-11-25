-- Una interacción por par (actor, objetivo): el upsert de matching reemplaza la anterior. `quote` ya no es un tipo de interacción.
delete from public.interactions where kind = 'quote';

-- Si hubiera duplicados por par, se conserva la más reciente.
delete from public.interactions a
  using public.interactions b
  where a.actor_profile_id = b.actor_profile_id
    and a.target_profile_id = b.target_profile_id
    and (a.created_at, a.id) < (b.created_at, b.id);

alter table public.interactions drop constraint interactions_kind_check;
alter table public.interactions add constraint interactions_kind_check check (kind in ('interest', 'dismiss'));
alter table public.interactions add column updated_at timestamptz not null default now();
alter table public.interactions
  add constraint interactions_actor_target_key unique (actor_profile_id, target_profile_id);
