---
responsable: leader
estado: aprobado
ultima_actualizacion: 2026-11-25
---

# Alcance, limitaciones y supuestos

## Dentro del MVP

Los RF-01 a RF-13 de [01-requerimientos](../01-requerimientos/), con las decisiones de la Fase 0:

- Solo **cuentas profesionales** (Business/Creator) y **públicas** de Instagram.
- Login por **enlace mágico** (Supabase Auth). La propiedad de la cuenta de IG se verifica con un **código en la bio**.
- Multiperfil: una cuenta puede tener perfiles de creador **y** de marca.
- Match por **interés mutuo**. Pedir una cotización es unidireccional y no requiere match.
- Notificaciones **solo in-app**. Interfaz **solo en español (Perú)**. Montos en PEN.

## Fuera del MVP

- Pagos o cobros dentro de la plataforma.
- Web push, correo transaccional (salvo el enlace mágico) y apps móviles.
- Cuentas personales de Instagram.
- Instagram Graph API y OAuth de Meta (no hay app de Meta).
- Aprendizaje automático a partir de las interacciones (se registran, pero no se entrena).
- Despliegue en la nube.

## Limitaciones

- La ingesta depende de Apify (plan gratuito: unos 1.900 perfiles al mes) y solo ve los últimos ~12 posts.
- El despliegue se hace en una PC local (Docker + Node) y no es un servicio público 24/7.

## Supuestos

- Presupuesto: 0 USD. Se acepta un gasto mínimo solo si destraba el desarrollo, con aprobación de Eduard.
- Equipo: 4 personas ([09-equipo](../09-equipo/responsables.md)) apoyadas por agentes de IA.
