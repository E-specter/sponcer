---
responsable: Eduard
estado: verificado (ejecución completa, 2026-11-25)
ultima_actualizacion: 2026-11-25
---

# Demo pública (túneles de Cloudflare)

Decisión y riesgos: [ADR-007](../02-arquitectura/adr/ADR-007-demo-publica.md). Requiere la PC local ya desplegada ([ficha](ficha-despliegue.md)) y Supabase arrancado (`npm run db:start`).

## Pasos

1. En `backend/.env` añade `DEMO_PASSWORD=<contraseña>` (mínimo 6 caracteres; no se versiona). Sin ella `demo:accounts` sale con error.
2. `npm run demo:accounts -w backend`: fija esa contraseña a los usuarios `*@sponcer.local` existentes (no crea usuarios; idempotente) y lista los actualizados.
3. `npm run demo:tunnel -w backend`: abre dos quick tunnels (`cloudflared@0.7.3` vía `npx`, sin cuenta), recompila el frontend con `PUBLIC_SUPABASE_URL` del túnel y `PUBLIC_DEMO_LOGIN=true` (solo variables de proceso; `frontend/.env` no se toca), arranca backend (si no corre) y frontend, comprueba `/`, `/login` y `/auth/v1/health` a través de los túneles e imprime la URL a compartir.
4. Comparte la URL del frontend. Los visitantes entran con "Entrar con una cuenta demo".

La URL cambia en cada arranque, y la PC debe seguir encendida. `additional_redirect_urls` en `db/supabase/config.jsonc` ya admite `https://*.trycloudflare.com/auth/callback` (tras cambiarlo hay que reiniciar Supabase con `npm run db:stop` y `npm run db:start`; no borra datos).

## Qué se expone y qué no

- Expuesto: frontend (:4321) y API de Supabase (:55521: auth, REST y Realtime con anon key + RLS).
- No expuesto: backend (:3000, solo lo llama el BFF), Postgres (:55522), Studio y Mailpit.

## Riesgos

- Cualquiera con la URL entra como usuario demo mientras dure la demo (datos ficticios).
- La API de Supabase queda en Internet; la protege RLS.
- La contraseña demo queda fijada en la BD local: cámbiala o ejecuta `db:reset` al terminar.

## Apagar

Si el puerto 4321 ya lo usa otro proyecto, elige otro: `DEMO_FRONTEND_PORT=4322 npm run demo:tunnel`.

`Ctrl+C` en la terminal de `demo:tunnel` (cierra túneles y servidores que lanzó). Si quedó algo vivo, en Windows: `taskkill /PID <pid> /T /F`. Para volver al modo local, recompila con `npm run build` (usa `frontend/.env`).

## Correo real con Brevo

[ADR-008](../02-arquitectura/adr/ADR-008-usuarios-reales.md). Por defecto Supabase Auth envía a Mailpit local. Para enviar a correos reales por Brevo (`smtp-relay.brevo.com:587`, plan gratuito, 300/día):

1. Crea una cuenta en Brevo, verifica un remitente y genera una clave SMTP (Brevo → SMTP y API).
2. Copia `db/.env.example` a `db/.env` y rellena `SMTP_USER`, `SMTP_PASS` y `SMTP_SENDER` (el remitente verificado). `db/.env` no se versiona.
3. Reinicia Supabase con las variables en el entorno y el interruptor `SUPABASE_AUTH_EMAIL_SMTP_ENABLED=true` (PowerShell):

```powershell
npm run db:stop
$env:SUPABASE_AUTH_EMAIL_SMTP_ENABLED='true'; $env:SMTP_USER='<usuario>'; $env:SMTP_PASS='<clave>'; $env:SMTP_SENDER='<remitente>'; npm run db:start
```

Sin esas variables (o sin el interruptor) todo sigue igual: Mailpit y `supabase start` funciona en un clon limpio. Por qué así: en `db/supabase/config.jsonc` el bloque `auth.email.smtp` queda con `enabled: false`; el CLI no deja vacío un `env(VAR)` sin definir (lo pasaría literal a Auth), pero sí permite sobrescribir una clave existente con `SUPABASE_<RUTA_EN_MAYÚSCULAS>` (verificado en CLI 2.x leyendo las variables `GOTRUE_SMTP_*` del contenedor de Auth). `auth.rate_limit.email_sent` está en 30/h (solo aplica con SMTP real; con Mailpit el CLI no limita).

Seguridad del registro: `auth.email.enable_confirmations = true` (un `signUp` público no obtiene sesión hasta confirmar el correo; los usuarios de demo/seed ya nacen confirmados) y el backend solo da `isAdmin` a correos verificados. Las plantillas de correo (`db/supabase/templates/{invite,magic_link,confirmation}.html`, en español) enlazan a `/auth/callback?token_hash=...&type=...`, que el frontend canjea con `verifyOtp`. Tras cambiar `config.jsonc` o las plantillas hay que reiniciar el stack (`supabase stop && supabase start`). Invitaciones: máx. 20/hora por administrador (`RATE_LIMITED`).

Los correos pueden llegar a spam (sin dominio propio). Las invitaciones usan `APP_URL` (`demo:tunnel` se la pasa al backend si lo arranca él; si el backend ya corría, reinícialo con `APP_URL=<url del frontend>`).
