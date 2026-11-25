-- Revisión de pedidos de exclusión por administradores.
alter table public.profile_removal_requests drop constraint profile_removal_requests_status_check;
alter table public.profile_removal_requests
  add constraint profile_removal_requests_status_check check (status in ('pending', 'applied', 'rejected')),
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references auth.users (id) on delete set null,
  add column review_note text;
create index profile_removal_requests_status_created_idx on public.profile_removal_requests (status, created_at desc);

-- `declared.city` pasa a ser un slug del catálogo City: se normaliza (minúsculas, sin tildes) y lo que no
-- pertenezca al catálogo se quita (el dato es opcional) para que Declared.parse no falle al leer.
update public.profiles
set declared = case
  when translate(lower(declared ->> 'city'), 'áéíóúüñ', 'aeiouun') in (
    'lima', 'arequipa', 'trujillo', 'chiclayo', 'piura', 'cusco', 'iquitos', 'huancayo', 'tacna', 'ica',
    'juliaca', 'puno', 'pucallpa', 'chimbote', 'cajamarca', 'ayacucho', 'huaraz', 'tarapoto', 'otra'
  )
  then jsonb_set(declared, '{city}', to_jsonb(translate(lower(declared ->> 'city'), 'áéíóúüñ', 'aeiouun')))
  else declared - 'city'
end
where declared ? 'city';
