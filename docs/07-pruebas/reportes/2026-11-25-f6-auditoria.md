---
responsable: audit
estado: observaciones
ultima_actualizacion: 2026-11-25
---

# Auditoría F6: usuarios reales y altas manuales (ADR-008)

Rama `feat/f6-usuarios-reales` (commits `5c9fc98..bff34d9`). Sin commits ni `npm install`. Stack: Supabase local (5552x), backend real en :3100 (`ADMIN_EMAILS=admin@sponcer.test,e2e-admin@e2e.sponcer.local`, `ADAPTER_INGESTION=mock`), frontend compilado (`astro build` + `node dist/server/entry.mjs`) con `PUBLIC_API_MODE=http` y `PUBLIC_AUTH_MODE=supabase`.

## Resultado: **OBSERVACIONES** (2 hallazgos altos, 2 medios)

El control de acceso por correo del backend es correcto (403 en los 5 endpoints, rol dinámico, reglas de revocación, RLS de `admin_users`). Pero hay dos defectos que impiden dar F6 por cerrada: el registro público de Supabase permite usurpar un correo administrador, y el enlace de invitación no abre sesión.

## Hallazgos

### Altos

**F6-A1. Quien conozca un correo administrador aún no registrado (o invitado) se hace administrador con `signUp` público.**
`db/supabase/config.jsonc` (`enable_signup: true`, `email.enable_confirmations: false`): Supabase entrega sesión con `email_confirmed_at` ya puesto sin verificar el correo. El backend decide `isAdmin` solo por el correo del JWT (`backend/src/shared/admin.ts:isAdmin`, `get-current-user.ts`), sin exigir correo verificado.
Escenario (reproducido): un admin nombra `nueva@x.pe` en `/admin/administradores` o la invita (`inviteUserByEmail` crea el usuario sin confirmar); un atacante llama `anon.auth.signUp({email:'nueva@x.pe', password})` con la anon key pública (el túnel expone la API de Supabase) y obtiene un JWT válido de ese mismo usuario (mismo `id` que el invitado). `GET /api/v1/me` da `isAdmin: true` y accede a exclusiones, altas, invitaciones y administradores. Con SMTP real sigue igual: `GOTRUE_MAILER_AUTOCONFIRM=true` en el contenedor actual. Preexistía para `ADMIN_EMAILS`, pero F6 lo amplía a cualquier correo nombrado y a invitados.
Arreglo sugerido: `enable_confirmations = true` (o cerrar el registro con contraseña y dejar solo OTP), y/o exigir `email_confirmed_at` en el middleware de auth antes de aplicar `isAdmin`.
Test: `admin-altas.e2e.supabase.test.ts` › `it.fails('un correo nombrado admin pero no registrado no se puede usurpar...')` (hoy pasa porque el defecto existe; al corregirlo fallará y habrá que quitar `.fails`).

**F6-A2. La invitación (y el enlace de acceso a un correo ya registrado) no inicia sesión.**
`inviteUserByEmail` y `signInWithOtp` desde el backend usan el flujo implícito: el correo redirige a `/auth/callback#access_token=...&type=invite` (verificado con `fetch(..., {redirect:'manual'})`: 303 con fragmento). `frontend/src/pages/auth/callback.ts:9-11` solo canjea `?code=` (PKCE) y sin `code` manda a `/login`. La persona invitada llega a `/login` sin sesión ni explicación (el fallback manual es pedir otro enlace desde `/login`).
Test: `e2e-15-admin-altas.spec.ts` › `test.fail('la persona invitada que sigue el enlace del correo queda con sesión en /descubrir')`.
Arreglo sugerido: que el callback acepte `token_hash`/`type` (`verifyOtp`) o que la invitación genere el enlace con `generateLink` y apunte a una ruta del frontend que haga `verifyOtp`.

### Medios

**F6-M1. Regresión de F5: un no administrador recibe HTTP 200 (no 404) en `/admin/*`.**
`frontend/src/layouts/AdminShell.astro:24` fija `Astro.response.status = 404` dentro del layout, cuando la respuesta ya empezó a enviarse; antes se hacía en la página (`exclusiones.astro` en develop). El cuerpo sí es "Página no encontrada", así que no se filtra contenido, pero el panel "existe" para quien mire el código de estado y `e2e-12-admin.spec.ts` (primer test) queda **rojo en los 3 navegadores** contra la build. Arreglo: fijar el estado en la página/frontmatter antes de renderizar el layout.
Test: `e2e-12` (sin tocar) y `e2e-15` › `test.fail('un usuario normal recibe HTTP 404 (no 200) en /admin/*')`.

**F6-M2. La suite RLS quedó rota por la tabla nueva y no cubría `admin_users`.**
`db/tests/rls.test.ts` exige el listado exacto de tablas y todo se indexa por `id`; `admin_users` (clave `email`) lo rompía (1 fallo). **Corregido en la suite** (añadida a `TABLES`, columna clave por tabla, semilla, INSERT/UPDATE/DELETE denegados para anon y authenticated, lectura vacía). 160/160 pasan. La migración en sí es correcta (RLS activo, sin políticas).

**F6-M3. Capacidad de correo compartida.** Con SMTP real `auth.rate_limit.email_sent = 30/h` es un tope global (login + invitaciones + enlaces de acceso), y Brevo 300/día. Las invitaciones no tienen límite propio: un administrador (o quien usurpe uno, F6-A1) puede agotar el cupo y bloquear el login de todos. Sugerido: límite por hora en `adminInviteUser` (como los de `app.ts`). Con Mailpit no aplica (el CLI fija `GOTRUE_RATE_LIMIT_EMAIL_SENT=360000`).

### Bajos / informativos

- **Último admin, condición de carrera (no probada):** `revoke` lee la lista y luego borra (`admin-users.ts`, `all.length <= 1`). Con `ADMIN_EMAILS` vacío, dos admins de la app que se quiten mutuamente a la vez pueden dejar 0. Con `ADMIN_EMAILS` no vacío no ocurre (los de env no se quitan).
- **Registro "con quién y cuándo" (ADR punto 4):** solo `granted_by/granted_at` se persisten; invitaciones y altas por @handle van únicamente a stdout (`logger.info('admin.action')`), que se pierde al reiniciar. Los logs incluyen correos (no hay requisito en RNF-05 sobre logs).
- **Reinvitar al mismo correo en menos de ~1 s** da `over_email_send_rate_limit` de Supabase y el adaptador lo convierte en `UPSTREAM_ERROR` (502). Observado al probar el contrato real; no hay mensaje específico en la UI.
- **12 altas por @handle en paralelo** contra el Supabase local dejaron 1-2 peticiones sin responder en 2 de ~5 corridas (el mismo código en serie va siempre bien). No se determinó si es del producto o del entorno local; el test usa serie.
- **Mensajes mock vs real:** el mock dice "Esa ficha ya existe" y el backend "Ya existe una ficha para ese handle" (`tests/visual/admin-flow.spec.ts` solo cubre el mock).
- **SMTP (punto 4):** `smtp.enabled:false` + `env(SMTP_*)` es coherente y no hay secretos versionados (`git grep`, `.gitignore` cubre `db/.env`, `backend/.env`, `frontend/.env`; el bundle `frontend/dist` no contiene la service key, el token de Apify ni `SMTP_PASS`). **No verifiqué** que `SUPABASE_AUTH_EMAIL_SMTP_ENABLED=true` active el SMTP: exige reiniciar el stack local en uso. La doc cita "CLI 2.x" pero el repo usa `supabase ^3.4.0`; conviene probarlo una vez antes de depender de ello.
- **`APP_URL`:** `demo:tunnel` solo lo pasa si arranca él el backend (documentado). Verificado que la invitación usa `APP_URL` sin barra final (`redirect_to=https://<host>/auth/callback`, con una URL permitida por el glob de trycloudflare).

## Lo verificado sin hallazgos

- **403 a no admin en modo real** en los 5 endpoints (`adminAddProfile`, `adminInviteUser`, `adminListAdmins`, `adminGrantAdmin`, `adminRevokeAdmin`), sin efectos colaterales (sin fila en `admin_users`, sin ficha, sin usuario creado) y 401 sin sesión. Un no admin recibe la misma respuesta al invitar un correo existente o nuevo (sin oráculo).
- **Admin nombrado en la app:** `Me.isAdmin=true` con el mismo JWT de antes, accede al panel de exclusiones y puede nombrar; al revocarlo pierde `isAdmin` y recibe 403 en todo. Mayúsculas: se guarda en minúsculas, `granted_by` correcto, idempotente.
- **Reglas de revocación (BD real):** admin de `.env` 409, correo ajeno 404, último admin 409; nombrar un admin de `.env` no crea fila duplicada ni lo vuelve revocable.
- **RLS `admin_users`:** anon/authenticated no leen, insertan, hacen upsert, actualizan ni borran (PostgREST); service_role sí.
- **Alta por @handle (real, ingesta con snapshot fresco):** crea ficha `unclaimed` sin dueño con el rol pedido; 409 en duplicado y en carrera de dos altas simultáneas (una fila); sin límite por hora (12 seguidas); 403 y sin ficha para cuentas privadas, no profesionales, handle en lista ARCO y ficha retirada tras aplicar una exclusión; 400 con handle o rol inválido.
- **Invitación:** `redirect_to` = `APP_URL/auth/callback`; correo nuevo → `sent` y usuario creado; correo con cuenta → `already_registered` sin crear usuarios.
- **CSRF del BFF:** `POST /bff/adminGrantAdmin` con Origin ajeno (`text/plain` o formulario), `Origin: null`, `Sec-Fetch-Site: cross-site` o sin cabeceras da 403 y no cambia nada; el mismo POST same-origin con JSON funciona. Las cookies son `Lax`+httpOnly. Una petición cross-site con `application/json` no la bloquea el middleware (la frena el preflight CORS del navegador, el BFF no emite CORS; la cookie `Lax` tampoco viajaría).
- **E2E del flujo real:** magic link por Mailpit para el admin, recorrido de las 4 secciones, nombrar y quitar un admin (con confirmación y efecto inmediato en otra sesión), invitación de un correo ficticio (llega a Mailpit con enlace de verificación `type=invite` y `redirect_to` a `/auth/callback`), alta por @handle con ingesta mock, y 404 (contenido) para un usuario normal y para `usuario1@sponcer.local` en las 4 secciones.
- `lint:deps` verde (186 módulos), contratos OK (7), `tsc` de backend, db y `frontend/tests` sin errores.

## Tests añadidos

| Archivo | Qué cubre |
|---|---|
| `backend/tests/contract/real/admin-altas.e2e.supabase.test.ts` (nuevo, 26 casos, 1 `it.fails`) | Todo lo de "verificado" con Supabase real y Mailpit, más F6-A1 |
| `backend/tests/contract/admin/invitation-sender.contract.ts` + `admin.mock.test.ts` (nuevos) | Suite del puerto `InvitationSender`: la pasan el mock y el adaptador de Supabase (esta última dentro del archivo real) |
| `frontend/tests/e2e/e2e-15-admin-altas.spec.ts` (nuevo, 10 tests, 2 `test.fail`) | E2E real (login por Mailpit, 4 secciones, administradores, invitaciones, altas, 404/403, CSRF del BFF) |
| `db/tests/rls.test.ts` (ampliado) | `admin_users` en el listado de tablas y en las matrices de RLS (+9 casos) |

`frontend/tests/visual/admin-flow.spec.ts` (mock) se **deja donde está** (pertenece al modo mock del config visual) y pasa contra una build en mock; no duplica el E2E real.

## Cómo se ejecutó

```
backend:  PORT=3100 CORS_ORIGIN=http://localhost:4421 APP_URL=http://localhost:4321 \
          ADMIN_EMAILS=admin@sponcer.test,e2e-admin@e2e.sponcer.local npx tsx --env-file=.env src/main.ts
frontend: PUBLIC_API_URL=http://localhost:3100 PUBLIC_API_MODE=http PUBLIC_AUTH_MODE=supabase npx astro build
          HOST=127.0.0.1 PORT=4421 node dist/server/entry.mjs ; npx playwright test
```

(`APP_URL` debe ser un origen permitido por Supabase, hoy `http://localhost:4321`; los E2E reenvían esa redirección al frontend bajo prueba como E2E-01.)

Resultados: backend `unit` 57 archivos / 729 tests pasan; `real-db` pasan (mi archivo: 25 + 1 fallo esperado); `db` 160/160; Playwright (3 navegadores) **236 pasan, 7 saltados, 3 fallan** (todos `e2e-12` primer test, F6-M1). `prettier --check --end-of-line auto` y `eslint` limpios en `backend/tests`, `db/tests`, `frontend/tests`. Sin datos residuales en la BD (0 perfiles/usuarios/bloqueos de prueba, `admin_users` vacía).

## Incidente durante la auditoría

Compilé el frontend dos veces sobre `frontend/dist`, que en ese momento servía la demo pública en :4321 (túneles de Cloudflare activos). Restauré el build con las mismas variables que usa `demo:tunnel` (URLs de los túneles obtenidas de `/quicktunnel`, `PUBLIC_DEMO_LOGIN=true`); el hash del CSS que sirve el proceso en marcha vuelve a existir y `/login` responde 200 por el túnel. Si algo se ve raro en la demo, basta con repetir `npm run demo:tunnel`. Detuve los procesos que arranqué (:3100, :4421, :4521).
