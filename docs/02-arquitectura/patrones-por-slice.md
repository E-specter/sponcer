---
responsable: leader
estado: aprobado
ultima_actualizacion: 2026-11-25
---

# Patrones por slice

| Slice | Patrones | Motivo |
|---|---|---|
| `ingestion` | Adapter + Strategy + Factory + Anti-Corruption Layer | Cambiar entre `mock` y `apify` (y Graph API en el futuro); traducir el JSON del proveedor a `IgProfileSnapshot` ([ADR-001](adr/ADR-001-ingesta-instagram.md)) |
| `classification` | Strategy + Pipeline | Etapas extracción → features → nicho → persistencia; reglas y embedding como estrategias ([ADR-003](adr/ADR-003-clasificacion-matching.md)) |
| `matching` | Strategy (scoring) + Specification (filtros) + Repository | Pesos intercambiables; filtros componibles y testeables por separado |
| `quotes` | State | Estados y transiciones explícitos: borrador → enviada → en negociación → aceptada / rechazada → completada / cancelada |
| `notifications` | Observer | Reacciona a `MatchCreated`, `QuoteStatusChanged` y `MessageSent` sin acoplar los slices |
| `chat` | Adapter (`RealtimeGateway`) | Aislar Supabase Realtime |
| `auth` | Adapter (Supabase Auth) + middleware | Aislar el proveedor de identidad |
| Transversal | Result/Either, DTO + zod en los bordes, Factory mock/real por entorno | Errores explícitos, entradas validadas, cambio de adaptador sin tocar código |
