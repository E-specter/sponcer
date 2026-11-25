---
responsable: leader
estado: borrador
ultima_actualizacion: 2026-11-25
---

# Entorno local

Los comandos exactos se completan en F1, cuando exista el `package.json` raíz.

## Requisitos

- Node ≥ 22 LTS y npm.
- Docker Desktop (para Supabase local).
- Supabase CLI (`npx supabase`).
- Git.
- Opcional: cuenta gratuita de Apify (solo quien use `ADAPTER_INGESTION=apify`).

## Arranque previsto

```bash
npm install                       # instala los workspaces
npx supabase start                # Postgres + Auth + Realtime + Mailpit (correo local) en Docker
npm run db:reset                  # migraciones + seed desde contracts/fixtures
npm run dev                       # backend (ADAPTER_*=mock por defecto) + frontend
```

- **Correo del enlace mágico en local:** Supabase local captura los correos en **Mailpit** (la URL la muestra `supabase start`). No hace falta SMTP.
- **Modo sin backend:** con `PUBLIC_API_MODE=mock`, el frontend funciona solo con fixtures.

## Claude Code

- Copiar [claude-settings.example.json](claude-settings.example.json) a `.claude/settings.json`.
- Herramientas y MCP: [herramientas-ia](herramientas-ia.md).
