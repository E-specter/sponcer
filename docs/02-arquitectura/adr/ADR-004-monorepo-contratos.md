---
responsable: leader
estado: aprobado
ultima_actualizacion: 2026-11-25
---

# ADR-004 — Herramientas del monorepo y ubicación de los contratos

## Contexto

- Backend y frontend deben consumir **los mismos** tipos, esquemas de validación y especificación OpenAPI, con una sola ubicación.
- El equipo es de 4 personas en Windows y tiene 1 semana. Se busca la menor fricción de instalación.

## Decisión

**Monorepo con npm workspaces** (viene con Node; no se usa pnpm, Turborepo ni Nx).

```
sponcer/
├── contracts/   @sponcer/contracts — ÚNICA fuente de contratos
│   ├── src/schemas/     esquemas zod por slice (DTOs, enums/catálogos)
│   ├── src/events/      tipos de eventos de dominio y de realtime
│   ├── fixtures/        perfiles semilla JSON (los usan los mocks de backend y frontend, y el seed de BD)
│   └── openapi.json     GENERADO desde los esquemas zod (no se edita a mano)
├── backend/     depende de @sponcer/contracts
├── frontend/    depende de @sponcer/contracts
├── db/          migraciones SQL (fuente del esquema de BD) + seed generado desde contracts/fixtures
└── docs/
```

Reglas:

- **zod es la fuente de verdad.** Los tipos TS salen de `z.infer` y el OpenAPI 3.1 se genera desde zod con un script (`npm run contracts:build`).
- **El esquema de BD vive en `db/supabase/migrations/`** (SQL, Supabase CLI). Los tipos de BD se generan con `supabase gen types` y solo los usan los adaptadores `supabase` del backend. Nunca llegan al frontend.
- Hay un solo `fixtures/` para todos los mocks y seeds, así que no se duplican datos semilla.
- Herramientas comunes: TypeScript `strict`, ESLint, Prettier, Vitest (backend y contracts), Playwright (E2E), `dependency-cruiser` (ADR-005), Supabase CLI (local con Docker).
- Node ≥ 22 LTS (`engines` en el `package.json` raíz).
- **Propiedad de `contracts/`:** la escribe el leader, *audit* la valida y cualquier cambio pasa por PR con revisión de un dev de cada lado consumidor.

## Consecuencias

- (+) Instalación con un solo `npm install` y cero herramientas extra.
- (+) Un cambio de contrato rompe la compilación de los dos lados a la vez. Eso es lo que se busca.
- (−) npm workspaces no cachea tareas como Turborepo. Con 3 paquetes no importa.
- Añade la carpeta raíz `contracts/` a las 4 del §3.1 del prompt.
