---
responsable: leader
estado: propuesto
ultima_actualizacion: 2026-11-25
---

# Matriz RACI

R = ejecuta · A = aprueba/responde · C = consultado · I = informado. E = Eduard, L = Leyla, S = Esteban, M = Mariana.

| Entregable | E | L | S | M | leader (agente) | audit (agente) |
|---|---|---|---|---|---|---|
| ADR y docs | A | C | C | C | R | I |
| Contratos (`contracts/`) | A | C | C | C | R | C |
| Esquema BD, migraciones, RLS | C | C | I | A | I | R (tests RLS) |
| Core API: auth, perfiles | A | I | C | C | I | C |
| Ingesta Apify + verificación | A | I | I | C | I | C |
| Clasificación + matching | C | A | I | C | I | C |
| Cotizaciones | C | I | I | A | I | C |
| Notificaciones + chat | C | I | A | C | I | C |
| Frontend y brief de diseño | C | C | A | C | I | C |
| Tests de contrato, integración, E2E | I | I | I | A | I | R |
| Commits, PR, release | A/R | R | R | R | I | I |
| Despliegue local | A/R | I | I | C | C | C |

Los agentes `dev-*` hacen la implementación (R técnica) en el área de cada persona, y la persona responde por ella (A).
