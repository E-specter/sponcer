---
responsable: Esteban (propuesto)
estado: borrador
ultima_actualizacion: 2026-11-25
---

# Módulo notificaciones (slice `notifications`)

**Código:** `backend/src/modules/notifications/` · **Requerimientos:** [RF-12](../01-requerimientos/RF-12.md)

## Responsabilidad

Crea notificaciones in-app reaccionando a eventos de dominio. El frontend las recibe por Supabase Realtime.

## Puertos (propuesta inicial, se fija en F1)

| Tipo | Puertos |
|---|---|
| Entrada (casos de uso) | `ListNotifications`, `MarkAsRead` |
| Salida | `NotificationRepository` |

**Tablas propias:** `notifications`  
**Eventos:** consume `MatchCreated`, `QuoteStatusChanged`, `MessageSent`  
**Patrones:** Observer (bus de eventos de dominio)

Adaptadores `mock` y real intercambiables por `ADAPTER_NOTIFICATIONS` (ver [backend-hexagonal](../02-arquitectura/backend-hexagonal.md)).
Contratos: [API](../05-contratos/api.md) · [esquema de BD](../05-contratos/esquema-bd.md) · [eventos](../05-contratos/eventos-realtime.md).
