---
responsable: leader
estado: propuesto
ultima_actualizacion: 2026-11-25
---

# ADR-007 — Demo accesible fuera de la PC local

## Contexto

- El despliegue es local (ADR-001, [ficha de despliegue](../../08-despliegue/ficha-despliegue.md)). Para la demo, otras personas tienen que abrir Sponcer desde su propio dispositivo.
- El navegador habla con dos orígenes: el frontend (Astro, puerto 4321) y Supabase (auth y Realtime, puerto 55521). El backend (3000) solo lo llama el BFF del frontend desde el servidor.
- El enlace mágico de Supabase local llega a Mailpit, así que un visitante externo nunca lo recibiría.
- No hay presupuesto ni dominio propio.

## Decisión

1. **Dos túneles rápidos de Cloudflare** (`cloudflared tunnel --url`, gratuitos y sin cuenta): uno al frontend y otro a la API de Supabase. El backend **no** se expone.
   - Las URL `*.trycloudflare.com` cambian en cada arranque. Un script (`npm run demo:tunnel`) levanta los túneles, lee sus URL, recompila el frontend con `PUBLIC_SUPABASE_URL` apuntando al túnel de Supabase y lo arranca.
2. **Redirect del enlace mágico:** `additional_redirect_urls` admite `https://*.trycloudflare.com/auth/callback`, así que no hay que tocar la configuración en cada arranque.
3. **Acceso de demo:** con `PUBLIC_DEMO_LOGIN=true` (desactivado por defecto), `/login` muestra "Entrar con una cuenta demo" e inicia sesión con correo y contraseña en las cuentas sembradas `*@sponcer.local`. La contraseña la fija `npm run demo:accounts` desde la variable `DEMO_PASSWORD` del `.env` local, y nunca se versiona. Sin esa variable, el botón no aparece.
4. **IP real para los límites por IP:**
   - El BFF reenvía la IP del cliente (`CF-Connecting-IP` o el primer valor de `X-Forwarded-For` que pone el túnel) en `X-Forwarded-For`.
   - El backend usa `trust proxy: 'loopback'`, de modo que solo confía en esa cabecera cuando la petición llega desde localhost, es decir, desde el BFF.
5. **Cookies:** con origen https, las cookies de sesión ya salen `Secure` (ADR-006). No cambia nada más.

## Consecuencias

- (+) Costo cero, sin cuenta ni dominio, y el backend y la base de datos no quedan expuestos.
- (−) Las URL cambian en cada arranque y hay que compartir la nueva. La PC tiene que seguir encendida durante la demo.
- (−) El túnel de Supabase expone la API pública (anon key + RLS) a Internet mientras dure la demo. Es la misma superficie que tendría un despliegue real; RLS está probado (148 tests).
- **Riesgo:** con `PUBLIC_DEMO_LOGIN` activo, cualquiera que tenga la URL puede entrar como usuario demo. Es aceptable para una demo con datos ficticios. Se apaga al terminar.
