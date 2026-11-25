---
responsable: Eduard
estado: borrador
ultima_actualizacion: 2026-11-25
---

# Ficha de despliegue (PC local)

**Destino:** una PC con Windows, Docker Desktop y Node ≥ 22. No hay nube y el costo es 0.

| Componente | Cómo corre | Puerto previsto |
|---|---|---|
| Supabase (Postgres + pgvector, Auth, Realtime, Mailpit) | `npm run db:start` (Docker). Puertos 5552x para no chocar con otros stacks locales de Supabase | 55521 (API), 55522 (DB), 55524 (Mailpit) |
| Backend (core API) | `npm run start -w backend` (build con `tsc`) | 3000 |
| Frontend (Astro, Node standalone) | `npm run build -w frontend && node frontend/dist/server/entry.mjs` | 4321 |

## Procedimiento (se valida en F4)

1. Clonar el repo y hacer checkout de un tag `vX.Y.Z`.
2. Copiar `.env.example` a `.env` en `backend/` y `frontend/` y completar las variables ([variables](variables.md)).
3. `npm ci` → `npx supabase start` → `npm run db:reset` → `npm run build` → `npm run start`.
4. Smoke test: `GET /api/v1/health` y abrir `http://localhost:4321`.

Para una demo fuera de la PC (opcional): exponer los puertos con un túnel gratuito. Se decide en F4 si hace falta.

Rollback: [rollback](rollback.md).
