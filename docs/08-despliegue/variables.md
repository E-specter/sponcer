---
responsable: Eduard
estado: borrador
ultima_actualizacion: 2026-11-25
---

# Variables de entorno

Los valores reales van solo en `.env`, que no se versiona. Cada paquete tiene su `.env.example`.

| Variable | Paquete | Secreta | Valor por defecto | Uso |
|---|---|---|---|---|
| `SUPABASE_URL` | backend | no | local | Cliente Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | backend | **sí** | — | Acceso del backend a la BD (nunca en frontend) |
| `SUPABASE_JWT_SECRET` | backend | **sí** | — | Verificar el JWT de los usuarios |
| `APIFY_TOKEN` | backend | **sí** | — | Solo con `ADAPTER_INGESTION=apify` |
| `ADAPTER_<SLICE>` | backend | no | `mock` | `mock` \| real (ver [04-modulos](../04-modulos/)) |
| `MATCH_WEIGHTS` | backend | no | `0.5,0.25,0.15,0.1` | Pesos del puntaje ([ADR-003](../02-arquitectura/adr/ADR-003-clasificacion-matching.md)) |
| `PUBLIC_API_URL` | frontend | no | `http://localhost:3000` | Core API |
| `PUBLIC_API_MODE` | frontend | no | `http` | `mock` \| `http` |
| `PUBLIC_SUPABASE_URL` | frontend | no | local | Auth + Realtime |
| `PUBLIC_SUPABASE_ANON_KEY` | frontend | no (pública por diseño) | — | Auth + Realtime, protegido por RLS |
