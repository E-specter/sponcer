---
responsable: Mariana (QA) · agente audit
estado: borrador
ultima_actualizacion: 2026-11-25
---

# Estrategia de pruebas

| Nivel | Herramienta | Ubicación | Autor | Cuándo bloquea |
|---|---|---|---|---|
| Unitarias (dominio, casos de uso, Specifications, Strategies) | Vitest | junto al código, `*.test.ts` | dev del área | CI de cada PR |
| Contrato de puertos (mock y real pasan la misma suite) | Vitest | `backend/tests/contract/` | audit | antes de cambiar un mock por el real (F3) |
| Contrato de API (respuestas contra los esquemas zod y OpenAPI) | Vitest + supertest | `backend/tests/integration/` | audit | CI |
| RLS (cada política: permitido y denegado) | Vitest + Supabase local | `db/tests/` | audit | CI |
| Reglas de dependencia | dependency-cruiser | `backend/.dependency-cruiser.cjs` | audit | CI |
| E2E (flujos de los RF) | Playwright | `frontend/tests/e2e/` | audit, validado por Mariana | F4 |
| Accesibilidad | Playwright + axe | `frontend/tests/e2e/a11y/` | audit | F4 |

**Regla de independencia:** ningún dev aprueba su propio trabajo. *Audit* revisa y emite un reporte en [reportes/](reportes/).

**Datos:** siempre desde `contracts/fixtures` (adaptadores mock). Los tests nunca llaman a Apify; los tests con `apify` se ejecutan a mano, con un presupuesto de llamadas acotado.

Casos E2E: [casos-e2e](casos-e2e.md).
