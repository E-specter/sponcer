---
responsable: leader
estado: borrador
ultima_actualizacion: 2026-11-25
---

# Contrato de API

- **Fuente de verdad:** los esquemas zod en `contracts/src/schemas/` ([ADR-004](../02-arquitectura/adr/ADR-004-monorepo-contratos.md)).
- **Especificación:** `contracts/openapi.json`, generada con `npm run contracts:build`. No se edita a mano.
- **Versionado:** la API usa el prefijo `/api/v1`. Un cambio incompatible exige `v2` o una migración coordinada en el mismo PR.
- **Convenciones:** JSON en camelCase, errores con `{ error: { code, message, details? } }`, paginación por cursor (`?cursor=&limit=`), auth con `Authorization: Bearer <jwt de Supabase>`.

## Endpoints

**Lista normativa:** `contracts/src/api.ts` (registro `api`). Resumen:

| Slice | Método y ruta | RF |
|---|---|---|
| auth | `GET /api/v1/health` · `GET /api/v1/me` · `POST /api/v1/claims` · `POST /api/v1/claims/:id/verify` | RF-02, RF-03, RF-04 |
| profiles | `GET /api/v1/profiles/:handle` · `PATCH /api/v1/profiles/:id/declared` · `PUT /api/v1/profiles/:id/services` · `POST /api/v1/profiles/:handle/removal-requests` | RF-01, RF-04 a RF-08 |
| matching | `GET /api/v1/feed?profileId=&filters…` · `POST /api/v1/interactions` · `GET /api/v1/matches` | RF-10, RF-11 |
| quotes | `POST /api/v1/quotes` · `POST /api/v1/quotes/:id/transitions` · `GET /api/v1/quotes` | RF-11 |
| notifications | `GET /api/v1/notifications` · `POST /api/v1/notifications/:id/read` | RF-12 |
| chat | `GET /api/v1/matches/:id/messages` · `POST /api/v1/matches/:id/messages` | RF-13 |
