---
responsable: leader
estado: borrador
ultima_actualizacion: 2026-11-25
---

# Eventos de dominio y canales realtime

Tipos en `contracts/src/events/`. Bus en proceso ([ADR-005](../02-arquitectura/adr/ADR-005-backend-hexagonal.md)).

| Evento | Emite | Consumen | Payload mínimo |
|---|---|---|---|
| `ProfileIngested` | ingestion | profiles, classification | igHandle, snapshotId |
| `ProfileVerified` | auth | profiles | igHandle, userId |
| `ProfileDeclaredDataChanged` | profiles | classification | profileId |
| `ProfileRemoved` | profiles | ingestion (blocklist + borrar snapshots), classification (borrar clasificación y embedding) | profileId, igHandle |
| `ProfileClassified` | classification | matching | profileId |
| `MatchCreated` | matching | notifications, chat | matchId, creatorProfileId, brandProfileId |
| `QuoteStatusChanged` | quotes | notifications | quoteId, from, to |
| `MessageSent` | chat | notifications | messageId, matchId, senderProfileId |

## Realtime (de solo lectura para el frontend, [ADR-006](../02-arquitectura/adr/ADR-006-frontend.md))

| Canal | Fuente | Filtro | Protección |
|---|---|---|---|
| `notifications:{userId}` | `postgres_changes` INSERT en `notifications` | `user_id=eq.{userId}` | RLS |
| `messages:{matchId}` | `postgres_changes` INSERT en `messages` | `match_id=eq.{matchId}` | RLS |
