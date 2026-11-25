-- Contrato de RPC (docs/05-contratos/esquema-bd.md). Las llama el backend con service_role.

create table public.profile_claim_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);
create index profile_claim_attempts_user_at_idx on public.profile_claim_attempts (user_id, at desc);
alter table public.profile_claim_attempts enable row level security; -- sin políticas: solo service_role

-- Atómico: el advisory lock por usuario serializa cuenta+inserción concurrentes.
create function public.record_claim_attempt(p_user_id uuid, p_window_minutes int, p_max int)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_used int;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select count(*) into v_used
    from public.profile_claim_attempts
    where user_id = p_user_id and at >= now() - make_interval(mins => p_window_minutes);
  if v_used >= p_max then
    return false;
  end if;
  insert into public.profile_claim_attempts (user_id) values (p_user_id);
  return true;
end;
$$;

create function public.match_candidates(
  p_embedding extensions.vector(384),
  p_role text,
  p_exclude uuid[],
  p_limit int
)
returns table (profile_id uuid, similarity double precision)
language sql
stable
security invoker
set search_path = ''
as $$
  select e.profile_id, 1 - (e.embedding operator(extensions.<=>) p_embedding) as similarity
  from public.profile_embeddings e
  join public.profiles p on p.id = e.profile_id
  where p.role = p_role
    and p.status <> 'removed'
    and p.id <> all (p_exclude)
  order by e.embedding operator(extensions.<=>) p_embedding
  limit p_limit;
$$;

revoke execute on function public.record_claim_attempt(uuid, int, int) from public, anon, authenticated;
revoke execute on function public.match_candidates(extensions.vector, text, uuid[], int) from public, anon, authenticated;
grant execute on function public.record_claim_attempt(uuid, int, int) to service_role;
grant execute on function public.match_candidates(extensions.vector, text, uuid[], int) to service_role;
