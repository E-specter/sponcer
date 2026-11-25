---
responsable: Eduard
estado: verificado (ensayo 2026-11-25)
ultima_actualizacion: 2026-11-25
---

# Variables de entorno

Los valores reales van solo en `.env`, que no se versiona. Cada paquete tiene su `.env.example`. Una variable vacía (`FOO=`) cuenta como ausente.

## Backend (`backend/.env`)

| Variable | Secreta | Por defecto | Uso |
|---|---|---|---|
| `PORT` | no | `3000` | Puerto de la API |
| `NODE_ENV` | no | `development` | `production` prohíbe cualquier `ADAPTER_*=mock` |
| `CORS_ORIGIN` | no | `http://localhost:4321` | Origen permitido (el del frontend) |
| `SUPABASE_URL` | no | — | Obligatoria si algún adaptador es `real` (local: `http://127.0.0.1:55521`) |
| `SUPABASE_SERVICE_ROLE_KEY` | **sí** | — | Idem; acceso del backend a la BD, nunca en el frontend |
| `SUPABASE_ANON_KEY` | no (pública) | — | Idem; verificación del JWT del usuario |
| `APIFY_TOKEN` | **sí** | — | Obligatoria con `ADAPTER_INGESTION=real` |
| `MATCH_WEIGHTS` | no | `0.5,0.25,0.15,0.1` | Pesos del puntaje: similitud, nichos, presupuesto, engagement ([ADR-003](../02-arquitectura/adr/ADR-003-clasificacion-matching.md)) |
| `ADAPTER_AUTH`, `_PROFILES`, `_INGESTION`, `_CLASSIFICATION`, `_MATCHING`, `_QUOTES`, `_NOTIFICATIONS`, `_CHAT` | no | `mock` | `mock` \| `real`. Con `ADAPTER_PROFILES=mock` ningún otro slice (salvo ingestion) puede ir `real` |

## Frontend (`frontend/.env`; las `PUBLIC_*` se fijan al compilar)

| Variable | Secreta | Por defecto | Uso |
|---|---|---|---|
| `PUBLIC_API_MODE` | no | `mock` | `mock` \| `http` (producción: `http`) |
| `PUBLIC_API_URL` | no | `http://localhost:3000` | Core API |
| `PUBLIC_AUTH_MODE` | no | `mock` | `mock` \| `supabase` (producción: `supabase`) |
| `PUBLIC_SUPABASE_URL` | no | — | Auth + Realtime |
| `PUBLIC_SUPABASE_ANON_KEY` | no (pública por diseño) | — | Auth + Realtime, protegido por RLS |
