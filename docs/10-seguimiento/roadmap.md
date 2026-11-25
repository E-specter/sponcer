---
responsable: leader
estado: propuesto
ultima_actualizacion: 2026-11-25
---

# Roadmap (1 semana, trabajo intensivo)

| Fase | Fecha | Hito | Responsables | Criterio de salida |
|---|---|---|---|---|
| **F0 Fundamentos** | mié 25-nov | ADR-001 a 006, docs, agentes, git | leader · aprueba Eduard | Eduard aprueba el plan, hace el commit inicial y crea `main` y `develop` |
| **F1 Contratos y mocks** | jue 26-nov | `contracts/` (zod, enums, eventos, ~30 fixtures), OpenAPI generado · workspaces + CI · esqueleto de backend con todos los slices en `mock` · migraciones + RLS + seed · esqueleto Astro con `PUBLIC_API_MODE=mock` · brief de diseño | leader (contratos, CI) · dev-backend (E, M) · dev-data (E, L) · dev-frontend (S) · audit (suites de contrato, depcruise) | `npm run dev` muestra un feed de tarjetas con datos semilla · CI en verde · audit aprueba los contratos |
| **F2 Desarrollo en paralelo** | vie 27 – dom 29-nov | Real: ingesta Apify + verificación por bio (E) · clasificación + embeddings + scoring/filtros pgvector (L) · auth y perfiles Supabase (E) · cotizaciones State (M) · notificaciones y chat + Realtime (S) · todas las vistas (S) | dev-* por área · audit revisa cada PR | Cada adaptador real pasa la suite de contrato de su puerto · cada vista funciona en modo mock |
| **F3 Integración** | lun 30-nov | Cambio de mock a real por slice (solo con aprobación de audit) · frontend en `http` · flujo completo sobre Supabase local | leader integra · E hace los commits | El flujo principal ([ficha](../02-arquitectura/ficha-arquitectura.md)) funciona de punta a punta en local |
| **F4 Pruebas E2E y despliegue** | mar 1-dic | E2E-01 a 09, accesibilidad, ensayo de despliegue en una PC limpia, tag `v1.0.0` | audit + Mariana · Eduard (despliegue) | E2E en verde · despliegue reproducido siguiendo [08-despliegue](../08-despliegue/ficha-despliegue.md) |
| Margen y entrega | mié 2-dic | Correcciones y demo | todos | Entrega |

## Línea de recorte

Si el domingo 29-nov F2 va atrasada, se recorta en este orden sin tocar el flujo principal:

1. El chat pasa de Realtime a polling cada 5 s.
2. Las notificaciones se muestran en una lista sin tiempo real.
3. Las cotizaciones se reducen a 4 estados (enviada → aceptada / rechazada → completada).
4. La clasificación se queda solo con reglas, sin embeddings. El matching usa solapamiento de nichos + presupuesto + engagement.

## Riesgos principales

| Riesgo | Mitigación |
|---|---|
| Se agota el crédito de Apify o un bloqueo | Snapshots en caché, semilla ≤ 300 perfiles; la demo puede correr en `mock` |
| La carga del modelo de embeddings es lenta | Precarga al arrancar; plan B: recorte 4 |
| RLS mal configurado expone el chat | Tests de RLS obligatorios (audit) antes de F3 |
| Choques entre sesiones de agentes | Propiedad exclusiva de carpetas ([responsables](../09-equipo/responsables.md)) |
