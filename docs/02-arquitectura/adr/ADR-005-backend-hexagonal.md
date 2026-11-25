---
responsable: leader
estado: aprobado
ultima_actualizacion: 2026-11-25
---

# ADR-005 — Arquitectura del backend: hexágono por slice

## Contexto

- La core API (Express + TS) concentra la lógica de negocio.
- Varias personas y agentes trabajan en paralelo y necesitan límites claros.
- Cada módulo debe tener un adaptador mock y uno real (§7 del prompt).

## Decisión

1. **Slices verticales** `auth`, `profiles`, `ingestion`, `classification`, `matching`, `quotes`, `notifications`, `chat`. Cada uno es un hexágono (`domain` / `application/ports/{in,out}` + `use-cases` / `infrastructure/{in/http,out/supabase,out/mock}`). La estructura normativa está en [backend-hexagonal](../backend-hexagonal.md).
2. **Inyección de dependencias manual** en `main.ts` (composition root): cada `<slice>.module.ts` exporta `createXModule(deps)`. No hay contenedor de DI. Se reevalúa con un ADR nuevo solo si el cableado supera ~150 líneas.
3. **Selección de adaptadores** por variable de entorno `ADAPTER_<SLICE>=mock|<real>`, validada con zod en `config/`. El valor por defecto es `mock`.
4. **Errores:** los casos de uso devuelven `Result<T, DomainError>` (de `shared/`). Los controladores lo traducen a HTTP. No se lanzan excepciones de negocio.
5. **Eventos de dominio:** bus en proceso tipado (`shared/events`), síncrono para el MVP. Los tipos de evento viven en `contracts/src/events`.
6. **Persistencia por slice:** cada slice es dueño de sus tablas (ver la columna "Tablas propias" en [04-modulos](../../04-modulos/)). Para leer de otro slice se usa su puerto in.
7. **Tests de contrato por puerto out:** una suite compartida que deben pasar los adaptadores mock y real (sustitución de Liskov). La escribe *audit*.

### Verificación de las reglas de dependencia en CI

Se usa **`dependency-cruiser`** (`.dependency-cruiser.cjs` en `backend/`), en el job `npm run lint:deps` de GitHub Actions. Las reglas `forbidden`:

| Regla | De | No puede importar |
|---|---|---|
| `domain-puro` | `modules/*/domain/**` | `application`, `infrastructure`, `express`, `@supabase/*`, cualquier paquete npm salvo `@sponcer/contracts` |
| `application-sin-infra` | `modules/*/application/**` | `infrastructure/**`, `express`, `@supabase/*` |
| `slices-por-index` | `modules/A/**` | `modules/B/**` salvo `modules/B/index.ts` |
| `shared-sin-negocio` | `shared/**` | `modules/**` |
| `sin-ciclos` | cualquiera | dependencias circulares |

Si una regla se rompe, el PR no se puede fusionar (ver [protección de ramas](../../06-desarrollo/proteccion-ramas.md)).

## Consecuencias

- (+) Los slices se desarrollan y prueban aislados con mocks, y la frontera la verifica una máquina, no la memoria del equipo.
- (−) Hay más archivos por funcionalidad que en un Express plano. Se acepta por el trabajo en paralelo.
- (−) El bus de eventos es síncrono y en proceso: si un suscriptor falla no hay reintento. Es suficiente para el MVP con un solo proceso.
