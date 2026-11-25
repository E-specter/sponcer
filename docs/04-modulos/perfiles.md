---
responsable: Eduard (propuesto)
estado: borrador
ultima_actualizacion: 2026-11-25
---

# Módulo perfiles (slice `profiles`)

**Código:** `backend/src/modules/profiles/` · **Requerimientos:** [RF-01](../01-requerimientos/RF-01.md), [RF-04](../01-requerimientos/RF-04.md), [RF-05](../01-requerimientos/RF-05.md), [RF-06](../01-requerimientos/RF-06.md), [RF-07](../01-requerimientos/RF-07.md), [RF-08](../01-requerimientos/RF-08.md), [RF-11](../01-requerimientos/RF-11.md)

## Responsabilidad

Fichas de creador y marca: datos ingeridos (solo lectura), datos declarados (editables), servicios del creador, necesidades de la marca.

## Puertos (propuesta inicial, se fija en F1)

| Tipo | Puertos |
|---|---|
| Entrada (casos de uso) | `GetProfile`, `ListMyProfiles`, `UpdateDeclaredData`, `ManageServices`, `ManageBrandNeeds`, `RequestProfileRemoval` |
| Salida | `ProfileReader`, `ProfileWriter`, `ServiceRepository` |

**Tablas propias:** `profiles`, `creator_services`, `profile_removal_requests`  
**Eventos:** emite `ProfileDeclaredDataChanged`; consume `ProfileVerified`, `ProfileIngested`  
**Patrones:** Repository, DTO + zod en el borde

Adaptadores `mock` y real intercambiables por `ADAPTER_PROFILES` (ver [backend-hexagonal](../02-arquitectura/backend-hexagonal.md)).
Contratos: [API](../05-contratos/api.md) · [esquema de BD](../05-contratos/esquema-bd.md) · [eventos](../05-contratos/eventos-realtime.md).
