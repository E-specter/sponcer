---
responsable: Mariana (QA)
estado: en revisión (suite F4-E2E ejecutada; validación humana pendiente)
ultima_actualizacion: 2026-11-25
---

# Casos E2E

Suite Playwright en `frontend/tests/e2e/` contra el **stack real local** (Supabase + backend con `ADAPTER_*=real` salvo ingesta `mock` + frontend en modo `supabase`). Cómo correrla y los resultados: [reporte F4-E2E](reportes/2026-11-25-f4-e2e.md).

| ID | Flujo | RF | Spec | Estado |
|---|---|---|---|---|
| E2E-01 | Login con enlace mágico (Mailpit) → panel vacío | RF-03 | `e2e-01-login.spec.ts` | Pasa |
| E2E-02 | Reclamar @handle → código → verificar (ingesta mock) → perfil vinculado | RF-02, RF-04 | `e2e-02-claim.spec.ts` | Pasa |
| E2E-03 | Completar datos declarados de creador + 1 servicio → ficha actualizada y reclasificada | RF-05, RF-06, RF-07, RF-09 | `e2e-03-declared.spec.ts` | Pasa |
| E2E-04 | Marca completa necesidades → feed de creadores ordenado y filtrado | RF-08, RF-10 | `e2e-04-feed.spec.ts` | Pasa |
| E2E-05 | Interés mutuo → match → notificación a ambos | RF-10, RF-12 | `e2e-05-match.spec.ts` | Pasa |
| E2E-06 | Cotización: enviada → en negociación → aceptada → completada | RF-11 | `e2e-06-quotes.spec.ts` | Pasa |
| E2E-07 | Chat entre las partes del match en tiempo real (2 navegadores) | RF-13 | `e2e-07-chat.spec.ts` | Pasa |
| E2E-08 | Un usuario sin match no puede leer mensajes ajenos (RLS) | RNF-03 | `e2e-08-rls.spec.ts` | Pasa |
| E2E-09 | Ficha previa de un perfil sin dueño visible solo con sesión; pedido de exclusión | RF-01, RNF-05 | `e2e-09-preview.spec.ts` | Pasa con 2 defectos abiertos (B-01 noindex, B-02 ingesta bajo demanda), marcados con `test.fail` |
| A11Y | axe WCAG 2.1 AA en 10 pantallas a 1440 y 414 px + estados abiertos + teclado del flujo "Me interesa" | brief de diseño | `a11y/axe.spec.ts`, `a11y/keyboard.spec.ts` | Pasa; 1 defecto abierto (B-03, chips < 44 px), marcado con `test.fail` |

`test.fail` mantiene la suite verde mientras el defecto exista y **falla en cuanto se corrija**: entonces hay que quitar la marca del test.
