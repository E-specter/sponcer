---
responsable: leader
estado: vivo
ultima_actualizacion: 2026-11-25
---

# Changelog

Formato [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versiones con SemVer y tag `vX.Y.Z`.

## [Sin publicar]

## [1.1.0] - 2026-11-25

### Añadido

- Tarjetas del feed con foto y bio, con la procedencia del dato ("Bio compartida · Instagram" / "Declarado en Sponcer"); foto también en el panel lateral y en la ficha.
- Fotos ficticias generadas para los 30 perfiles de demostración.
- Ingesta real: copia de la foto de perfil en Supabase Storage (`profile-images`), borrada al retirar la ficha.
- Verificación visual con Playwright obligatoria al cierre de cada implementación con UI (`npm run e2e:visual -w frontend`), con detección de desborde horizontal e imágenes rotas.

### Corregido

- Hidratación del perfil activo, desborde horizontal en móvil y ajustes de diseño según Figma.

## [1.0.0] - 2026-11-25

### Añadido

- F1: contratos (zod, 18 endpoints, OpenAPI, 30 perfiles semilla), monorepo y CI; core API hexagonal con 8 slices en mock; BD Supabase (migraciones, RLS, Realtime, seed); frontend Astro v7 completo en mock.
- F2: adaptadores reales Supabase en todos los slices; ingesta Apify (ACL); clasificación con e5 local; matching con pgvector (RPC `match_candidates`); RPC transaccionales (servicios, reclamo, cotizaciones); login por enlace mágico, BFF y Realtime de solo lectura.
- F4: suite E2E Playwright (9 flujos) y accesibilidad axe sin violaciones; ingesta bajo demanda de handles desconocidos con límite por usuario; fichas `noindex`; despliegue local verificado en clon limpio; caché del modelo e5 persistente con precarga.
- Diseño: dirección visual de Figma aplicada (tokens, componentes, portada, app escritorio/móvil).
- F3: integración punta a punta en modo real; retiro de ficha borra snapshots, clasificación y embedding y bloquea el handle (Ley 29733).

- F0: documentación base (`docs/`), ADR-001 a 006, definiciones de agentes, reglas de bloqueo de git, plantilla de PR, CODEOWNERS y roadmap.
