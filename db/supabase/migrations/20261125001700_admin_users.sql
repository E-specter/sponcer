-- Administradores nombrados desde la app (ADR-008). Los de ADMIN_EMAILS viven solo en el .env.
-- RLS activo y sin políticas: solo la service role del backend la lee o escribe.
create table public.admin_users (
  email text primary key check (email = lower(email)),
  granted_by text,
  granted_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
