---
responsable: Eduard (propuesto)
estado: borrador
ultima_actualizacion: 2026-11-25
---

# Módulo auth (slice `auth`)

**Código:** `backend/src/modules/auth/` · **Requerimientos:** [RF-02](../01-requerimientos/RF-02.md), [RF-03](../01-requerimientos/RF-03.md), [RF-04](../01-requerimientos/RF-04.md)

## Responsabilidad

Identidad y sesión sobre Supabase Auth (enlace mágico). Verifica el JWT de Supabase en cada request de la core API (middleware) y expone el usuario actual.

## Puertos (propuesta inicial, se fija en F1)

| Tipo | Puertos |
|---|---|
| Entrada (casos de uso) | `GetCurrentUser`, `StartProfileClaim`, `ConfirmProfileClaim` |
| Salida | `IdentityProvider` (Supabase Auth), `ClaimCodeStore`, `ProfileOwnershipChecker` (vía puerto in de `ingestion`) |

**Tablas propias:** `profile_claims`  
**Eventos:** emite `ProfileVerified`  
**Patrones:** Adapter (Supabase Auth) + middleware Express

Adaptadores `mock` y real intercambiables por `ADAPTER_AUTH` (ver [backend-hexagonal](../02-arquitectura/backend-hexagonal.md)).
Contratos: [API](../05-contratos/api.md) · [esquema de BD](../05-contratos/esquema-bd.md) · [eventos](../05-contratos/eventos-realtime.md).
