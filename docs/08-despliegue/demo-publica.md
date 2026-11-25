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

`Ctrl+C` en la terminal de `demo:tunnel` (cierra túneles y servidores que lanzó). Si quedó algo vivo, en Windows: `taskkill /PID <pid> /T /F`. Para volver al modo local, recompila con `npm run build` (usa `frontend/.env`).
