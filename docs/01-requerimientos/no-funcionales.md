---
responsable: leader
estado: aprobado
ultima_actualizacion: 2026-11-25
---

# Requerimientos no funcionales

| ID | Categoría | Requerimiento | Cómo se verifica |
|---|---|---|---|
| RNF-01 | UX | La interfaz es clara e intuitiva. El flujo de reclamar y verificar un perfil se completa en ≤ 3 pantallas | Caso E2E + prueba con usuarios del equipo |
| RNF-02 | Accesibilidad | WCAG 2.1 AA en las vistas principales | Revisión de audit (Playwright + axe) |
| RNF-03 | Seguridad | RLS activado en **todas** las tablas expuestas. Los secretos (`APIFY_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`) solo viven en `.env` del backend y nunca llegan al frontend | Tests de RLS (audit) + revisión del bundle |
| RNF-04 | Seguridad | Validación zod en todos los bordes (API y formularios). Rate limit en verificación e ingesta bajo demanda | Tests de integración |
| RNF-05 | Privacidad (Ley N.º 29733 y su reglamento) | Ver la sección siguiente | Checklist de audit |
| RNF-06 | Despliegue | Reproducible en una PC limpia siguiendo [08-despliegue](../08-despliegue/ficha-despliegue.md) | Ensayo en F4 |
| RNF-07 | Calidad | TypeScript `strict`. CI en verde (lint, typecheck, tests, reglas de dependencia) para fusionar | GitHub Actions |
| RNF-08 | Costo | 0 USD de operación. Ingesta dentro del crédito gratuito de Apify | Monitoreo del uso en Apify |

## Privacidad (RNF-05)

- **Minimización:** solo se guardan datos públicos necesarios para clasificar (bio, métricas, últimos posts). No se guardan comentarios de terceros ni datos de seguidores.
- **Transparencia:**
  - hay una página `/privacidad` con la finalidad, el responsable, el origen de los datos y los derechos ARCO;
  - el consentimiento se registra al crear la cuenta y al reclamar un perfil.
- **Fichas previas (RF-01):** solo de cuentas profesionales, visibles solo para usuarios autenticados y con `noindex`.
- **Derechos ARCO / exclusión:** cualquier titular puede pedir la exclusión y el borrado de su ficha (`RequestProfileRemoval`). El handle excluido queda en una lista de bloqueo para la ingesta.
- **Seguridad:** RLS, secretos fuera del repo y acceso a la BD solo con el rol de servicio en el backend.
- **Nota:** esto es una implementación técnica de buenas prácticas, **no una opinión legal**. Si el proyecto sale de la demo académica, se recomienda revisar el banco de datos ante la ANPD.
