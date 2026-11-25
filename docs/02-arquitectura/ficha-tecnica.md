---
responsable: leader
estado: borrador
ultima_actualizacion: 2026-11-25
---

# Ficha técnica

Las versiones exactas se fijan en F1 con los `package.json`. Esta tabla muestra lo que está decidido hoy.

| Capa | Tecnología | Nota |
|---|---|---|
| Runtime | Node ≥ 22 LTS (local: 26) | `engines` en la raíz |
| Monorepo | npm workspaces | [ADR-004](adr/ADR-004-monorepo-contratos.md) |
| Contratos | zod → tipos TS + OpenAPI 3.1 generado | `contracts/` |
| Backend | Express + TypeScript strict, tsx (dev), Vitest | [ADR-005](adr/ADR-005-backend-hexagonal.md) |
| Reglas de dependencia | dependency-cruiser | CI |
| BD | Supabase (Postgres + pgvector, Auth, Realtime, Storage) vía Supabase CLI **local con Docker** | Docker 29 y CLI 3.4 disponibles en la PC de despliegue |
| Ingesta | Apify `apify/instagram-profile-scraper` (`apify-client`) | [ADR-001](adr/ADR-001-ingesta-instagram.md) |
| Embeddings | `@huggingface/transformers` + `Xenova/multilingual-e5-small` (384 d) | [ADR-003](adr/ADR-003-clasificacion-matching.md) |
| Frontend | Astro v7 + `@astrojs/node` + `@astrojs/react` + Nano Stores | [ADR-006](adr/ADR-006-frontend.md) |
| E2E | Playwright | [estrategia](../07-pruebas/estrategia.md) |
| CI | GitHub Actions | lint, typecheck, test, lint:deps |
