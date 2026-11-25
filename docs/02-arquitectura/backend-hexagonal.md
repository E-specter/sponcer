---
responsable: leader
estado: aprobado
ultima_actualizacion: 2026-11-25
---

# Backend: hexágono por slice (normativo)

La decisión y sus motivos están en [ADR-005](adr/ADR-005-backend-hexagonal.md). Este documento es la **regla operativa** que siguen `dev-backend` y `dev-data` y que verifica `audit`.

```
backend/src/
├── modules/<slice>/
│   ├── domain/                      Entidades, value objects, reglas, eventos. TS puro
│   ├── application/
│   │   ├── ports/in/                Interfaces de casos de uso
│   │   ├── ports/out/               Interfaces de repositorios y proveedores
│   │   └── use-cases/               Un caso de uso por archivo
│   ├── infrastructure/
│   │   ├── in/http/                 Rutas + controladores Express + validación zod (@sponcer/contracts)
│   │   └── out/{supabase,mock,...}/ Adaptadores
│   ├── <slice>.module.ts            createXModule(deps): cablea adaptadores ↔ puertos
│   └── index.ts                     API pública: puertos in + eventos. Nada más
├── shared/                          Result, DomainError, tipos base, bus de eventos, logger
├── config/                          Entorno validado con zod; ADAPTER_<SLICE>=mock|real
└── main.ts                          Composition root
```

## Reglas (las verifica `dependency-cruiser` en CI)

1. Las dependencias van hacia dentro: `infrastructure → application → domain`. `domain` no importa librerías de infraestructura.
2. Un slice solo importa el `index.ts` de otro slice, o reacciona a sus eventos.
3. Cada slice es dueño de sus tablas. Para leer datos ajenos usa el puerto del slice dueño.
4. La inyección de dependencias es manual, en `main.ts`.
5. Un modelo escrito en otro lenguaje entra como adaptador out (un servicio HTTP) detrás del mismo puerto.

## SOLID aplicado

| Principio | Cómo se cumple aquí |
|---|---|
| S | Un caso de uso por archivo. El controlador solo traduce entre HTTP y el caso de uso |
| O | Un proveedor o una estrategia nueva entra como adaptador o Strategy nuevos |
| L | Los adaptadores mock y real pasan la misma suite de contrato del puerto |
| I | Puertos pequeños (`ProfileReader` ≠ `ProfileWriter`) |
| D | Los casos de uso dependen de puertos, nunca de Supabase, Express ni Apify |

## Tests

| Tipo | Ubicación | Quién |
|---|---|---|
| Unitarios (domain, use-cases) | junto al código: `*.test.ts` | dev del slice |
| Contrato de puertos out | `backend/tests/contract/<slice>/` | audit |
| Integración HTTP | `backend/tests/integration/` | audit |

Patrones por slice: [patrones-por-slice](patrones-por-slice.md).
