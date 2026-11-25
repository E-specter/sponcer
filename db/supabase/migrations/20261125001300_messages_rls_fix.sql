-- La policy anterior hacía subselect sobre profiles/matches (RLS sin policies): el usuario no veía nada.
-- Función security definer: solo responde si auth.uid() participa, sin abrir lectura de esas tablas.
create function public.is_match_participant(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.matches m
    join public.profiles p on p.id in (m.creator_profile_id, m.brand_profile_id)
    where m.id = p_match_id
      and p.owner_user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_match_participant(uuid) from public, anon;
grant execute on function public.is_match_participant(uuid) to authenticated;

drop policy messages_select_match_owner on public.messages;
create policy messages_select_match_owner on public.messages
  for select to authenticated using (public.is_match_participant(match_id));
