-- Bucket público de fotos de perfil. Lectura pública por URL; sin políticas de escritura para anon/authenticated:
-- solo el backend (service_role, que salta RLS) sube y borra.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-images', 'profile-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
