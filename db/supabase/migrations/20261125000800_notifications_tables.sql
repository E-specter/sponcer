create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('match_created', 'quote_status_changed', 'message_received')),
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy notifications_select_own on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));

alter publication supabase_realtime add table public.notifications;
