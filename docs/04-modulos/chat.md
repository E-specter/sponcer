---
responsable: Esteban (propuesto)
estado: borrador
ultima_actualizacion: 2026-11-25
---

# Módulo chat (slice `chat`)

**Código:** `backend/src/modules/chat/` · **Requerimientos:** [RF-13](../01-requerimientos/RF-13.md)

## Responsabilidad

Mensajería entre perfiles con match. Envío por la core API; entrega en tiempo real por Supabase Realtime (ver [ADR-006](../02-arquitectura/adr/ADR-006-frontend.md)).

## Puertos (propuesta inicial, se fija en F1)

| Tipo | Puertos |
|---|---|
| Entrada (casos de uso) | `SendMessage`, `ListConversation` |
| Salida | `MessageRepository`, `MatchReader` (vía puerto in de `matching`), `RealtimeGateway` |

**Tablas propias:** `messages`  
**Eventos:** emite `MessageSent`  
**Patrones:** Adapter (`RealtimeGateway` sobre Supabase Realtime)

Adaptadores `mock` y real intercambiables por `ADAPTER_CHAT` (ver [backend-hexagonal](../02-arquitectura/backend-hexagonal.md)).
Contratos: [API](../05-contratos/api.md) · [esquema de BD](../05-contratos/esquema-bd.md) · [eventos](../05-contratos/eventos-realtime.md).
