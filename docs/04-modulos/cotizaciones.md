---
responsable: Mariana (propuesto)
estado: borrador
ultima_actualizacion: 2026-11-25
---

# Módulo cotizaciones (slice `quotes`)

**Código:** `backend/src/modules/quotes/` · **Requerimientos:** [RF-11](../01-requerimientos/RF-11.md)

## Responsabilidad

Solicitudes de cotización sobre servicios del creador con máquina de estados explícita. Sin pagos.

## Puertos (propuesta inicial, se fija en F1)

| Tipo | Puertos |
|---|---|
| Entrada (casos de uso) | `RequestQuote`, `TransitionQuote`, `ListQuotes` |
| Salida | `QuoteRepository` |

**Tablas propias:** `quotes`, `quote_events`  
**Eventos:** emite `QuoteStatusChanged`  
**Patrones:** State (borrador → enviada → en negociación → aceptada / rechazada → completada / cancelada)

Adaptadores `mock` y real intercambiables por `ADAPTER_QUOTES` (ver [backend-hexagonal](../02-arquitectura/backend-hexagonal.md)).
Contratos: [API](../05-contratos/api.md) · [esquema de BD](../05-contratos/esquema-bd.md) · [eventos](../05-contratos/eventos-realtime.md).
