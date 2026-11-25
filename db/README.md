# db — Supabase (Postgres + pgvector, Auth, Realtime)

Migraciones SQL (fuente del esquema), políticas RLS y seed generado desde `contracts/fixtures`. Corre local con Supabase CLI + Docker.
Esquema: [docs/05-contratos/esquema-bd.md](../docs/05-contratos/esquema-bd.md) · despliegue: [docs/08-despliegue](../docs/08-despliegue/ficha-despliegue.md).
Dueños: `dev-backend` (Mariana) y `dev-data` para las migraciones de sus slices. Los tests de RLS (`db/tests/`) son de `audit`.

## Uso (desde la raíz del repo, con Docker corriendo)

| Acción                                                                      | Comando                            |
| --------------------------------------------------------------------------- | ---------------------------------- |
| Arrancar el stack (la primera vez descarga imágenes)                        | `npm run db:start`                 |
| Resetear: regenera `seed.sql` desde los fixtures, aplica migraciones y seed | `npm run db:reset`                 |
| Solo regenerar el seed                                                      | `npm run seed:build -w db`         |
| Ver URLs y claves locales                                                   | `npx supabase status --workdir db` |
| Parar                                                                       | `npm run db:stop`                  |

`db/supabase/seed.sql` es generado (`db/scripts/build-seed.ts`): no se edita a mano. No siembra clasificaciones ni embeddings (los calcula el backend).

## Servicios locales (puertos por defecto)

- API: http://127.0.0.1:55521 · Postgres: `postgresql://postgres:postgres@127.0.0.1:55522/postgres`
- Studio: http://127.0.0.1:55523
- Mailpit (correos del enlace mágico): http://127.0.0.1:55524

## Notas

- Migraciones: `db/supabase/migrations/<timestamp>_<slice>_<descripcion>.sql`.
- RLS activado en todas las tablas; solo `notifications` y `messages` tienen política de lectura para `authenticated`. Todo lo demás se accede con `service_role` desde el backend.
- Realtime publica `notifications` y `messages`.
- Usuarios del seed (`*@sponcer.local`) tienen identidad `email`: el enlace mágico con ese correo entra con el mismo id que los fixtures.
- `quotes.service_id` es `on delete restrict`: el backend no debe borrar servicios con cotizaciones (actualizar en lugar de reemplazar).
