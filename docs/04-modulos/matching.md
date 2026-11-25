---
responsable: Leyla
estado: borrador
ultima_actualizacion: 2026-11-25
---

# Módulo matching (slice `matching`)

**Código:** `backend/src/modules/matching/` · **Requerimientos:** [RF-10](../01-requerimientos/RF-10.md), [RF-11](../01-requerimientos/RF-11.md)

## Responsabilidad

Feed de tarjetas ordenado por compatibilidad, filtros combinables, registro de interacciones y creación de match por interés mutuo.

## Puertos (propuesta inicial, se fija en F1)

| Tipo | Puertos |
|---|---|
| Entrada (casos de uso) | `GetFeed(filters)`, `ExpressInterest`, `Dismiss`, `ListMatches` |
| Salida | `CandidateSearch` (pgvector), `InteractionRepository`, `MatchRepository` |

**Tablas propias:** `interactions`, `matches`  
**Eventos:** emite `MatchCreated`; consume `ProfileClassified`  
**Patrones:** Strategy (scoring) + Specification (filtros) + Repository

Adaptadores `mock` y real intercambiables por `ADAPTER_MATCHING` (ver [backend-hexagonal](../02-arquitectura/backend-hexagonal.md)).
Contratos: [API](../05-contratos/api.md) · [esquema de BD](../05-contratos/esquema-bd.md) · [eventos](../05-contratos/eventos-realtime.md).
