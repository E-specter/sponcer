---
responsable: leader
estado: propuesto
ultima_actualizacion: 2026-11-25
---

# Responsables y propiedad de carpetas

> **Confirmado por Eduard el 2026-11-25.** La marca *(nuevo)* indica un hueco del §6 asignado ahora.

## Personas

| Integrante | GitHub | Áreas | Agente con el que trabaja |
|---|---|---|---|
| Eduard | `@E-specter` | Ingesta / Apify · **core API: auth, perfiles, composition root** *(nuevo)* · despliegue local · integración y commits | `dev-data` (ingesta), `dev-backend` |
| Leyla | `@lnaragio14` | Matching · **clasificación** *(nuevo)* (comparten embeddings) | `dev-data` |
| Esteban | `@esteban-abanto-2709` | Frontend: vistas y flujos · **notificaciones y chat** *(nuevo)* (backend + realtime) · validación del brief de diseño | `dev-frontend`, `dev-backend` |
| Mariana | `@MPachas17-hub` | QA y E2E · **base de datos: esquema, migraciones, RLS y seeds** *(nuevo)* · **cotizaciones** *(nuevo)* | `audit`, `dev-backend` |

Por qué este reparto:

- Clasificación va con Leyla porque usa los mismos embeddings y features que matching.
- Chat y notificaciones son sobre todo Realtime y UI, así que van con Esteban.
- La BD y sus RLS se prueban de la mano de QA, por eso van con Mariana. Cotizaciones es un slice pequeño (State) que equilibra su carga en F2, cuando QA todavía tiene poco que probar.
- Eduard concentra la integración porque es quien hace los commits.

## Agentes y propiedad exclusiva de carpetas

| Agente | Modelo / esfuerzo | Escribe **solo** en |
|---|---|---|
| `leader` | opus / high | `docs/` (salvo `docs/07-pruebas/`), `contracts/`, archivos raíz (`package.json`, `.gitignore`, `.github/`), `.claude/` |
| `dev-backend` | sonnet / medium | `backend/src/` salvo `modules/{ingestion,classification,matching}/` · `db/` completo salvo `db/tests/` (incluye las migraciones de todos los slices; dev-data pide los cambios de esquema) |
| `dev-data` | sonnet / medium | `backend/src/modules/{ingestion,classification,matching}/` |
| `dev-frontend` | sonnet / medium | `frontend/` salvo `frontend/tests/` |
| `audit` | sonnet / high | `backend/tests/`, `frontend/tests/`, `db/tests/`, `backend/.dependency-cruiser.cjs`, `docs/07-pruebas/` |

**Por qué `dev-data`:** con 1 semana, la ingesta (Eduard) y la clasificación y el matching (Leyla) avanzan en paralelo con la core API. Separarlos de `dev-backend` evita que dos sesiones editen el mismo slice. Para tareas mecánicas (búsquedas, formateo) se usa `haiku`.

Matriz RACI: [raci](raci.md).
