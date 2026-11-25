---
responsable: Eduard
estado: borrador
ultima_actualizacion: 2026-11-25
---

# Módulo ingesta-instagram (slice `ingestion`)

**Código:** `backend/src/modules/ingestion/` · **Requerimientos:** [RF-01](../01-requerimientos/RF-01.md), [RF-02](../01-requerimientos/RF-02.md)

## Responsabilidad

Obtiene datos públicos de cuentas profesionales de Instagram y los traduce al modelo de dominio (capa anticorrupción). Guarda snapshots para no repetir llamadas pagadas.

## Puertos (propuesta inicial, se fija en F1)

| Tipo | Puertos |
|---|---|
| Entrada (casos de uso) | `IngestProfile(handle)`, `FetchLiveBio(handle)`, `RefreshProfile` |
| Salida | `InstagramSource` (adaptadores: `mock`, `apify`), `SnapshotRepository` |

**Tablas propias:** `ig_snapshots`  
**Eventos:** emite `ProfileIngested`  
**Patrones:** Adapter + Strategy + Factory + ACL ([ADR-001](../02-arquitectura/adr/ADR-001-ingesta-instagram.md))

Adaptadores `mock` y real intercambiables por `ADAPTER_INGESTION` (ver [backend-hexagonal](../02-arquitectura/backend-hexagonal.md)).
Contratos: [API](../05-contratos/api.md) · [esquema de BD](../05-contratos/esquema-bd.md) · [eventos](../05-contratos/eventos-realtime.md).
