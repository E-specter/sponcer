---
responsable: leader
estado: vivo
ultima_actualizacion: 2026-11-25
---

# Tablero de tareas

Estados: `pendiente` · `en progreso` · `en audit` · `hecho` · `bloqueado`. Cada agente actualiza solo sus filas.

| ID | Tarea | Fase | Agente | Persona | Estado | Docs |
|---|---|---|---|---|---|---|
| F0-01 | Análisis del prompt y preguntas | F0 | leader | Eduard | hecho | — |
| F0-02 | ADR-001 a ADR-006 | F0 | leader | Eduard | hecho (aprobado 25-nov) | [adr](../02-arquitectura/adr/README.md) |
| F0-03 | Scaffold de carpetas y docs | F0 | leader | Eduard | hecho | [README](../README.md) |
| F0-04 | Definición de subagentes | F0 | leader | Eduard | hecho | [responsables](../09-equipo/responsables.md) |
| F0-05 | Control de versiones (deny, flujo, PR, CODEOWNERS, protección) | F0 | leader | Eduard | hecho; falta configurar GitHub | [git-flujo](../06-desarrollo/git-flujo.md) |
| F0-06 | Reparto de huecos | F0 | leader | Eduard | hecho (confirmado 25-nov) | [responsables](../09-equipo/responsables.md) |
| F0-07 | Roadmap | F0 | leader | Eduard | hecho (aprobado 25-nov) | [roadmap](roadmap.md) |
| F1-C | Contratos: zod, catálogos, eventos, registro `api`, OpenAPI, fixtures (30 perfiles) | F1 | leader | Eduard | hecho (6 tests, typecheck OK) | [api](../05-contratos/api.md) |
| F1-R | Monorepo: workspaces, tsconfig, ESLint, Prettier, CI | F1 | leader | Eduard | hecho | [ADR-004](../02-arquitectura/adr/ADR-004-monorepo-contratos.md) |
| F1-B1 | Núcleo core API + auth + profiles (mock) | F1 | dev-backend | Eduard | hecho | [auth](../04-modulos/auth.md), [perfiles](../04-modulos/perfiles.md) |
| F1-DB | Supabase local: migraciones, RLS, Realtime, seed | F1 | dev-backend | Mariana | hecho | [esquema-bd](../05-contratos/esquema-bd.md) |
| F1-FE | Frontend Astro en modo mock (todas las rutas) | F1 | dev-frontend | Esteban | hecho | [frontend](../02-arquitectura/frontend.md) |
| F1-D | ingestion + classification + matching (mock) | F1 | dev-data | Eduard / Leyla | hecho | [ADR-003](../02-arquitectura/adr/ADR-003-clasificacion-matching.md) |
| F1-Q | quotes (State) | F1 | dev-backend | Mariana | hecho | [cotizaciones](../04-modulos/cotizaciones.md) |
| F1-NC | notifications + chat | F1 | dev-backend | Esteban | hecho | [chat](../04-modulos/chat.md) |
| F1-A | dependency-cruiser + suites de contrato + revisión | F1 | audit | Mariana | hecho | [estrategia](../07-pruebas/estrategia.md) |
| F2-B | Adaptadores Supabase: auth, profiles, quotes, notifications, chat + RPC | F2 | dev-backend | Eduard / Mariana | hecho | [esquema-bd](../05-contratos/esquema-bd.md) |
| F2-D | Adaptadores reales: ingestion (Apify), classification (e5, 76,7 % top-1 / 100 % top-3), matching (pgvector) | F2 | dev-data | Eduard / Leyla | hecho | [ADR-003](../02-arquitectura/adr/ADR-003-clasificacion-matching.md) |
| F2-FE | Frontend modo http: enlace mágico PKCE, cookies httpOnly, BFF, Realtime | F2 | dev-frontend | Esteban | hecho | [ADR-006](../02-arquitectura/adr/ADR-006-frontend.md) |
| F2-A | Auditoría F2: RLS (15 tablas), contratos mock = real, concurrencia | F2 | audit | Mariana | hecho (aprobado tras correcciones) | [reporte](../07-pruebas/reportes/2026-11-25-f2-real-adapters.md) |
| F3-I | Integración punta a punta en modo real (salvo ingesta: falta APIFY_TOKEN) | F3 | leader + todos | Eduard | hecho | [roadmap](roadmap.md) |
| F3-A | Auditoría F3: slices de datos, privacidad (ProfileRemoved) | F3 | audit | Mariana | hecho (aprobado) | [reporte](../07-pruebas/reportes/2026-11-25-f3-data-slices.md) |
| F3-P | Brief de diseño desde Figma + restyle | F3 | leader + dev-frontend | Esteban | hecho | [brief](../03-diseno/brief.md) |
| F3-APIFY | Ingesta real con Apify (verificada: fetchLiveBio ~5 s, fetchProfile 10–23 s) | F3 | dev-data | Eduard | hecho | [ADR-001](../02-arquitectura/adr/ADR-001-ingesta-instagram.md) |
| F4-E2E | Suite Playwright E2E-01..09 + axe (WCAG 2.1 AA) contra stack real | F4 | audit | Mariana | hecho (57/57, 0 violaciones axe) | [reporte](../07-pruebas/reportes/2026-11-25-f4-e2e.md) |
| F4-DEPLOY | Ensayo de despliegue en clon limpio (producción, adaptadores reales) | F4 | dev-backend | Eduard | hecho | [ficha](../08-despliegue/ficha-despliegue.md) |
| F4-FIX | B-01 noindex, B-02 ingesta bajo demanda, B-03 chips 44 px, cotizar desde el feed, caché del modelo fuera de node_modules | F4 | dev-frontend, dev-backend, dev-data | Esteban, Eduard, Leyla | hecho | [reporte](../07-pruebas/reportes/2026-11-25-f4-e2e.md) |
| F4-REL | Release v1.0.0 (PR develop → main + tag) | F4 | leader | Eduard | hecho (PR #1 fusionado, tag v1.0.0, release publicada) | [git-flujo](../06-desarrollo/git-flujo.md) |
| F5-VIS | Verificación visual Playwright obligatoria + hidratación, desborde móvil y ajustes Figma | F5 | audit, dev-frontend | Mariana, Esteban | hecho (22/22, E2E 57/57) | [visual](../../frontend/tests/visual/README.md) |
| F5-C | Contrato F5: búsqueda `q` y ciudad en el feed, `City`, paginación de matches y cotizaciones, panel de exclusiones, `isAdmin` | F5 | leader | Eduard | hecho | [api](../05-contratos/api.md) |
| F5-DATA | Búsqueda/ciudad en matching, feed sin perfiles perdidos, purga de snapshots, mocks coherentes | F5 | dev-data | Leyla / Eduard | hecho | [ADR-003](../02-arquitectura/adr/ADR-003-clasificacion-matching.md) |
| F5-BE | Panel de exclusiones (API), `isAdmin`, paginación de cotizaciones, retiro sin pérdida de cambios, IP real en límites | F5 | dev-backend | Eduard / Mariana | hecho | [RNF-05](../01-requerimientos/no-funcionales.md) |
| F5-FE | Búsqueda y ciudad, paginación, página de exclusiones, acceso demo, IP del cliente en el BFF | F5 | dev-frontend | Esteban | hecho | [ADR-007](../02-arquitectura/adr/ADR-007-demo-publica.md) |
| F5-DEMO | Túneles de Cloudflare, cuentas demo y guía de demo pública | F5 | dev-backend | Eduard | hecho | [ADR-007](../02-arquitectura/adr/ADR-007-demo-publica.md) |
| F5-QA | Auditoría F5: 911 tests backend, E2E 3 navegadores (209/213, 4 saltos por motor), visual 24/24 | F5 | audit | Mariana | hecho | [reporte](../07-pruebas/reportes/2026-11-25-f5-features.md) |
