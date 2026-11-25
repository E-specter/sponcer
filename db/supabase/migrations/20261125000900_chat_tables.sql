create table public.messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  sender_profile_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
create index messages_match_created_idx on public.messages (match_id, created_at);
create index messages_sender_idx on public.messages (sender_profile_id);

alter table public.messages enable row level security;

-- Lectura solo para los dueños de alguno de los dos perfiles del match.
create policy messages_select_match_owner on public.messages
  for select to authenticated using (
    exists (
      select 1
      from public.matches m
      join public.profiles p on p.id in (m.creator_profile_id, m.brand_profile_id)
      where m.id = messages.match_id
        and p.owner_user_id = (select auth.uid())
    )
  );

alter publication supabase_realtime add table public.messages;
