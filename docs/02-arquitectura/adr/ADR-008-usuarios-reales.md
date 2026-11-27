---
responsable: Eduard
estado: aprobado
ultima_actualizacion: 2026-11-25
---

# ADR-008: Usuarios reales y altas manuales de administración (F6)

## Contexto

Hasta v1.2.1 solo entran personas reales con las cuentas demo: el enlace mágico llega a Mailpit local, los administradores se definen únicamente en `ADMIN_EMAILS` (archivo `.env`) y las fichas previas solo aparecen cuando alguien busca un @handle. El equipo decidió abrir la app a usuarios reales manteniendo el despliegue en la PC de Eduard con el túnel de ADR-007, y que el administrador pueda dar altas manuales.

## Decisiones

1. **Correo real con Brevo (SMTP).** Supabase Auth envía los enlaces por `smtp-relay.brevo.com:587` (plan gratuito, 300 correos/día, remitente verificado, sin dominio propio). Credenciales solo en variables de entorno (`SMTP_USER`, `SMTP_PASS`, `SMTP_SENDER`), nunca en el repo. Sin esas variables todo sigue como hoy: Mailpit local. Se sube `auth.rate_limit.email_sent` (2/h por defecto) a un valor útil para varios usuarios.
2. **Alojamiento:** se mantiene la PC local con el túnel (ADR-007). La URL pública cambia en cada arranque; los enlaces de los correos usan `PUBLIC_SITE_URL`, ya permitido por el glob `https://*.trycloudflare.com/auth/callback`.
3. **Ingesta real para usuarios reales.** Con usuarios reales, el reclamo de cuentas (código en la bio) y las altas por @handle necesitan `ADAPTER_INGESTION=real` (Apify, crédito gratuito mensual). Los 30 perfiles ficticios del seed conviven con los reales.
4. **Altas manuales (solo administradores):**
   - **Perfiles por @handle** (`POST /api/v1/admin/profiles`): reutiliza la ingesta bajo demanda existente (solo cuentas públicas profesionales, respeta la lista de exclusión ARCO) y crea una ficha previa sin dueño, clasificada. Sin el límite por usuario de la búsqueda.
   - **Invitar por correo** (`POST /api/v1/admin/invitations`): invitación de Supabase Auth con enlace a `/auth/callback`; si el correo ya tiene cuenta, se le envía un enlace de acceso.
   - **Nombrar o quitar administradores** (`/api/v1/admin/admins`): tabla `admin_users` (RLS activo, sin políticas: solo la service role del backend). `ADMIN_EMAILS` sigue funcionando como administradores fijos de arranque y no se pueden quitar desde la app; tampoco se puede quitar al último administrador.
   - Toda alta manual queda registrada con quién la hizo y cuándo.
5. **Fuera de alcance de F6:** asignar un perfil a un usuario sin el código en la bio (no lo pidió el equipo), hosting en la nube, dominio propio.

## Consecuencias

- Los usuarios reales necesitan que la PC esté encendida y el túnel activo; cada reinicio cambia la URL pública (los correos ya enviados con la URL anterior dejan de funcionar).
- El plan gratuito de Brevo limita a 300 correos/día y los correos pueden llegar a spam al no tener dominio propio.
- El panel de administración crece a cuatro secciones: exclusiones, perfiles, invitaciones y administradores.
