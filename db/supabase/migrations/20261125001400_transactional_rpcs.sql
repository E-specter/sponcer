-- RPC transaccionales para los adaptadores reales (las llama el backend con service_role).
-- Errores de negocio: SQLSTATE 'SP409' (conflicto de estado/titularidad) y 23503 (FK, p. ej. servicio con cotizaciones).

-- Reemplaza el catálogo de un creador de forma atómica conservando los ids de filas idénticas
-- (quotes.service_id es restrict: si una fila a borrar tiene cotizaciones, falla todo con 23503 y nada cambia).
create function public.replace_creator_services(p_profile_id uuid, p_services jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_free uuid[];
  v_assign uuid[] := '{}';
  v_in jsonb;
  v_id uuid;
  v_i int;
  v_n int := jsonb_array_length(p_services);
begin
  -- Serializa reemplazos concurrentes del mismo catálogo.
  perform 1 from public.profiles where id = p_profile_id for update;
  select coalesce(array_agg(id order by position, created_at, id), '{}') into v_free
    from public.creator_services where profile_id = p_profile_id;

  -- 1) Filas idénticas conservan su id.
  for v_i in 0 .. v_n - 1 loop
    v_in := p_services -> v_i;
    select s.id into v_id
      from public.creator_services s
      where s.id = any (v_free)
        and s.type = v_in ->> 'type' and s.format = v_in ->> 'format'
        and s.price_pen = (v_in ->> 'pricePen')::int and s.description = (v_in ->> 'description')
      order by array_position(v_free, s.id)
      limit 1;
    v_assign := v_assign || v_id; -- null si no hay coincidencia
    if v_id is not null then v_free := array_remove(v_free, v_id); end if;
  end loop;

  -- 2) Las demás reutilizan sobrantes por orden o se insertan.
  for v_i in 1 .. v_n loop
    if v_assign[v_i] is null then
      if cardinality(v_free) > 0 then
        v_assign[v_i] := v_free[1];
        v_free := v_free[2:];
      else
        insert into public.creator_services (profile_id, type, format, price_pen, description)
          values (p_profile_id, 'canje', 'post', 0, '') returning id into v_id;
        v_assign[v_i] := v_id;
      end if;
    end if;
  end loop;

  -- 3) Contenido y posición definitivos.
  for v_i in 1 .. v_n loop
    v_in := p_services -> (v_i - 1);
    update public.creator_services set
      type = v_in ->> 'type', format = v_in ->> 'format',
      price_pen = (v_in ->> 'pricePen')::int, description = v_in ->> 'description',
      position = v_i - 1
    where id = v_assign[v_i];
  end loop;

  -- 4) Sobrantes: si tienen cotizaciones, la FK aborta toda la transacción.
  delete from public.creator_services where profile_id = p_profile_id and id <> all (v_assign);

  return coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'type', type, 'format', format,
                                        'pricePen', price_pen, 'description', description) order by position)
    from public.creator_services where profile_id = p_profile_id
  ), '[]'::jsonb);
end;
$$;

-- Reclamo condicional: nunca pisa a otro dueño ni revive una ficha retirada.
-- Devuelve {status: 'claimed'|'owned'|'removed', profile_id}.
create function public.claim_profile(p_handle text, p_user_id uuid, p_role text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_status text;
begin
  insert into public.profiles (ig_handle, role, status, owner_user_id)
    values (p_handle, p_role, 'verified', p_user_id)
    on conflict (ig_handle) do nothing
    returning id into v_id;

  if v_id is null then
    -- El rol lo declara el usuario; si cambia, los datos declarados del otro rol no valen.
    update public.profiles set
      declared = case when role <> p_role then null else declared end,
      role = p_role, status = 'verified', owner_user_id = p_user_id, updated_at = now()
    where ig_handle = p_handle and status <> 'removed'
      and (owner_user_id is null or owner_user_id = p_user_id)
    returning id into v_id;
  end if;

  if v_id is not null then
    return jsonb_build_object('status', 'claimed', 'profile_id', v_id);
  end if;
  select status into v_status from public.profiles where ig_handle = p_handle;
  return jsonb_build_object('status', case when v_status = 'removed' then 'removed' else 'owned' end);
end;
$$;

-- Transición con concurrencia optimista: solo aplica si el estado actual es el esperado.
create function public.transition_quote(
  p_quote_id uuid, p_expected_status text, p_to text, p_actor uuid, p_amount int, p_note text,
  p_at timestamptz default now()
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  update public.quotes set status = p_to, amount_pen = p_amount, updated_at = p_at
    where id = p_quote_id and status = p_expected_status
    returning id into v_id;
  if v_id is null then
    raise exception 'quote_state_conflict' using errcode = 'SP409';
  end if;
  insert into public.quote_events (quote_id, from_status, to_status, actor_profile_id, note, at)
    values (p_quote_id, p_expected_status, p_to, p_actor, p_note, p_at);
end;
$$;

revoke execute on function public.replace_creator_services(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.claim_profile(text, uuid, text) from public, anon, authenticated;
revoke execute on function public.transition_quote(uuid, text, text, uuid, int, text, timestamptz) from public, anon, authenticated;
grant execute on function public.replace_creator_services(uuid, jsonb) to service_role;
grant execute on function public.claim_profile(text, uuid, text) to service_role;
grant execute on function public.transition_quote(uuid, text, text, uuid, int, text, timestamptz) to service_role;
