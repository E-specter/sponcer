---
responsable: Eduard
estado: verificado (ensayo en clon limpio, 2026-11-25)
ultima_actualizacion: 2026-11-25
---

# Ficha de despliegue (PC local)

**Destino:** una PC con Windows, Docker Desktop y Node ≥ 22.23. No hay nube y el costo es 0.

| Componente | Cómo corre | Puerto |
|---|---|---|
| Supabase (Postgres + pgvector, Auth, Realtime, Mailpit) | `npm run db:start` (Docker) | 55521 (API), 55522 (DB), 55524 (Mailpit) |
| Backend (core API) | `npm run start -w backend` (`tsx`, sin paso de build) | 3000 |
| Frontend (Astro, Node standalone) | `npm run build -w frontend` y `npm run start -w frontend` | 4321 |

`npm run start` en la raíz levanta backend y frontend juntos (`concurrently`).

## Procedimiento verificado

1. Clonar y fijar versión: `git clone <repo> sponcer && cd sponcer && git checkout vX.Y.Z`.
2. Crear los `.env` **antes de compilar** (el frontend incorpora las `PUBLIC_*` en el build):

   PowerShell:
   ```powershell
   Copy-Item backend\.env.example backend\.env; Copy-Item frontend\.env.example frontend\.env
   ```
   bash:
   ```bash
   cp backend/.env.example backend/.env && cp frontend/.env.example frontend/.env
   ```
   Valores de producción local (ver [variables](variables.md)):
   - `backend/.env`: `NODE_ENV=production`, los 8 `ADAPTER_*=real` (con `mock` el backend se niega a arrancar), `SUPABASE_URL=http://127.0.0.1:55521`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` (salen de `npx supabase status --workdir db`) y `APIFY_TOKEN`.
   - `frontend/.env`: `PUBLIC_API_MODE=http`, `PUBLIC_AUTH_MODE=supabase`, `PUBLIC_SUPABASE_URL` y `PUBLIC_SUPABASE_ANON_KEY` (la misma anon key).
3. `npm ci`
4. BD: `npm run db:start`; en una instalación nueva, `npm run db:reset` (aplica migraciones y seed; **borra datos**).
5. `npm run model:prefetch -w backend`: descarga el modelo e5 (~110 MB, una sola vez) a `backend/.cache/models` (o `MODEL_CACHE_DIR`), fuera de `node_modules`, así que `npm ci` ya no lo borra. Sale con error si falla tras 3 intentos. Con la caché presente tarda ~2 s.
6. `npm run build` (compila contracts y frontend; ~7 s). Regenera `contracts/openapi.json`: no es un cambio a versionar.
6. `npm run start` (o dos terminales con `npm run start -w backend` y `npm run start -w frontend`).
7. Smoke test:

   PowerShell:
   ```powershell
   Invoke-RestMethod http://localhost:3000/api/v1/health            # {"status":"ok"}
   curl.exe -s -o NUL -w "%{http_code}\n" http://localhost:4321/        # 200
   curl.exe -s -o NUL -w "%{http_code}\n" http://localhost:4321/login   # 200
   curl.exe -s -o NUL -w "%{http_code} %{redirect_url}\n" http://localhost:4321/descubrir   # 302 .../login
   ```
   bash: los mismos `curl` con `-w "%{http_code} %{redirect_url}\n"`.
   Llamada autenticada: crear un usuario con la API admin de Auth (`POST $SUPABASE_URL/auth/v1/admin/users`, `email_confirm: true`), iniciar sesión (`POST /auth/v1/token?grant_type=password`) y llamar `GET /api/v1/me` con `Authorization: Bearer <access_token>`. Debe responder `200 {userId,email,profiles}`; sin token, `401`. Borrar el usuario al terminar (`DELETE /auth/v1/admin/users/<id>`).

## Tiempos medidos

| Paso | Tiempo |
|---|---|
| `npm ci` | ~18 s |
| `npm run build` | ~7 s |
| Arranque backend / frontend | < 5 s cada uno |
| Primer arranque: descarga del modelo e5 (~110 MB) | 1 a 2 min según la red; ocurre en segundo plano |
| `db dump --data-only` | ~4 s (~1 MB) |

## Notas

- **Modelo e5:** el backend corre un backfill de clasificación al arrancar; si hay perfiles pendientes, descarga el modelo en ese momento (queda en `node_modules/@huggingface/transformers/.cache`, así que `npm ci` lo borra y se vuelve a descargar). La API responde mientras tanto. El log `clasificados N perfiles` marca el fin. Sin conexión la clasificación falla, no el resto de la API.
- **Frontend:** `npm run start -w frontend` ya carga `frontend/.env` en runtime (`--env-file-if-exists`); las `PUBLIC_*` se fijan al compilar, así que cambiarlas exige `npm run build -w frontend`.
- **CORS:** `CORS_ORIGIN` en `backend/.env` debe ser el origen exacto del frontend (por defecto `http://localhost:4321`).
- **Proxy / túnel:** sin proxy no hace falta nada. Si se expone con un túnel, el rate limit por IP verá una sola IP hasta configurar `trust proxy` (pendiente, ver `backend/src/app.ts`).
- Los scripts de instalación de `npm ci` se omiten con un aviso (`install-scripts`); es inofensivo para este flujo.

Demo fuera de la PC: [demo pública](demo-publica.md).

Rollback: [rollback](rollback.md).
