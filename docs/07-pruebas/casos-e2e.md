---
responsable: Mariana (QA)
estado: borrador
ultima_actualizacion: 2026-11-25
---

# Casos E2E (borrador; se detallan en F2)

| ID | Flujo | RF |
|---|---|---|
| E2E-01 | Login con enlace mágico (Mailpit) → panel vacío | RF-03 |
| E2E-02 | Reclamar @handle → código → verificar (ingesta mock) → perfil vinculado | RF-02, RF-04 |
| E2E-03 | Completar datos declarados de creador + 1 servicio → ficha actualizada y reclasificada | RF-05, RF-06, RF-07, RF-09 |
| E2E-04 | Marca completa necesidades → feed de creadores ordenado y filtrado | RF-08, RF-10 |
| E2E-05 | Interés mutuo → match → notificación a ambos | RF-10, RF-12 |
| E2E-06 | Cotización: enviada → en negociación → aceptada → completada | RF-11 |
| E2E-07 | Chat entre las partes del match en tiempo real (2 navegadores) | RF-13 |
| E2E-08 | Un usuario sin match no puede leer mensajes ajenos (RLS) | RNF-03 |
| E2E-09 | Ficha previa de un perfil sin dueño visible solo con sesión; pedido de exclusión | RF-01, RNF-05 |
