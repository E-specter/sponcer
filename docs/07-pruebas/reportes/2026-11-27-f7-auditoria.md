---
responsable: audit
estado: aprobado (tras re-verificación)
ultima_actualizacion: 2026-11-27
---

# Auditoría F7: Empresas, campañas, cotización múltiple sin match y Visibilidad (ADR-009)

Rama `feat/f7-empresas-campanas` (`git diff origin/develop...HEAD`, HEAD `ff5b278`). Sin commits ni `npm install`. Stack: Supabase local (5552x, Mailpit 55524), backend real en :3100 (`ADMIN_EMAILS=admin@sponcer.test,e2e-admin@e2e.sponcer.local`, `ADAPTER_INGESTION=mock`, resto `real`, `APP_URL=http://localhost:4421`) y frontend compilado en `frontend/dist-audit` (otra `outDir`, borrada al terminar) servido en :4421 con `PUBLIC_API_MODE=http`, `PUBLIC_AUTH_MODE=supabase` y `PUBLIC_DEMO_LOGIN=true`. No toqué `frontend/dist` ni el proceso de :4321.

## Resultado: **OBSERVACIONES** (1 hallazgo alto, 4 medios, 6 bajos)

La seguridad de datos es sólida: RLS activo y probado (permitido y denegado) en `accounts`, `companies`, `consents`, `campaigns`, `profile_views` y `quotes.campaign_id`; nadie lee documentos ni campañas ajenas; las RPC nuevas solo las llama el service role; el registro es transaccional y exclusivo; la carrera de cotización duplicada la resuelve el índice único. **El bloqueante es la migración**: falla con datos anteriores a F7 que el esquema viejo permitía (F7-A1). El resto son defectos de producto acotados (sin límite en `/registration`, edición concurrente de campañas, selector de campaña, administradores sin registro).

## Hallazgos

### Altos

**F7-A1. La migración `20261127000100` aborta si una marca tiene dos cotizaciones abiertas al mismo creador.**
`db/supabase/migrations/20261127000100_f7_accounts_campaigns_visibility.sql:70-81`: todas las cotizaciones antiguas de una marca pasan a UNA campaña "General" y luego se crea `unique (campaign_id, creator_profile_id) where status in ('draft','sent','negotiating','accepted')`. El esquema anterior no impedía repetir (la marca podía pedir varios servicios del mismo creador, o el mismo dos veces; `create-quote.ts` de develop no comprueba duplicados).
Escenario (reproducido en una BD temporal con el esquema anterior): marca B1 con cotizaciones `negotiating` (servicio 2) y `sent` (servicio 1) al creador C1 → `ERROR: could not create unique index "quotes_open_per_creator_campaign_idx"; Key (campaign_id, creator_profile_id)=(…) is duplicated`. Toda la migración (en transacción) se revierte: `db reset`/`db push` con datos de develop deja el despliegue sin F7. Sin duplicados abiertos la migración sí pasa y crea una "General" por marca con sus cotizaciones (caso 1).
Arreglo sugerido: antes del índice, repartir las duplicadas (una campaña "General" por marca y creador, o cancelar la más antigua con evento) o no migrar duplicadas a la misma campaña.
Test: `db/tests/migrations/f7-migration.sh` (+ `f7-legacy-data.sql`): caso 1 verde, caso 2 hoy falla; al corregir, ambos deben pasar. Reproducible con `bash db/tests/migrations/f7-migration.sh`.

### Medios

**F7-M1. `/api/v1/registration` no tiene límite de peticiones y sirve de oráculo de DNI/RUC.**
`backend/src/app.ts:68-71` limita `startClaim`, `verifyClaim` y `requestRemoval`, no `register`. Cualquiera puede crear un usuario con enlace mágico y probar números sin tope: `409 document_taken` ("Ya existe una empresa registrada con ese DNI") confirma que ese DNI (dato personal) es de una persona registrada. La RPC revierte cada intento fallido, así que se puede repetir indefinidamente (60 intentos seguidos, todos 409, ninguno 429).
Arreglo: `app.post(api.register.path, limiter(HOUR_MS, ~10))` por IP y/o mensaje genérico que no distinga "documento repetido" para DNI.
Test: `f7-auditoria.e2e.supabase.test.ts` › `it.fails('F7-M1 …')`.

**F7-M2. Editar una campaña a la vez que se cierra puede reabrirla (pérdida de actualización).**
`campaign-use-cases.ts:70-93` (`makeUpdateCampaign`) lee la campaña, mezcla y `campaigns.save` hace `upsert` del registro completo (`supabase-adapters.ts`, `createSupabaseCampaignRepository.save`). Dos PATCH simultáneos (`status: closed` y `name: x`): el segundo escribe el `status: active` leído antes → la campaña cerrada vuelve a `active` y admite cotizaciones. Rompe "estados solo hacia adelante".
Reproducción: 12 pares concurrentes, falla en cada corrida (4 de 4).
Arreglo: `update … where id = $1 and status = $esperado` (o `updated_at` como versión) y 409 si no actualiza.
Test: `it.fails('F7-M2 …')`.

**F7-M3. El selector "Cotizar a influencers" de la campaña no encuentra a quien la marca ya marcó.**
`CampaignQuotePicker.tsx` (líneas 26-40) sale de `loadFeed`, y el feed oculta los perfiles con interacción previa (interés o descarte). Tras "Me interesa" (o "No me interesa") el influencer desaparece del selector, justo a quien se quiere cotizar. Se puede cotizar desde su ficha o desde Visibilidad, pero no desde la campaña, que es el flujo central de F7.
Test: `e2e-16` › `test.fail('F7-M3 …')` (3 navegadores).

**F7-M4 (corregido en la suite). Un test de F7 borraba la empresa de la cuenta demo.**
`backend/tests/contract/real/accounts-campaigns.supabase.test.ts` usaba el RUC `20100070970`, que es el de `demo@sponcer.local` en el seed, y limpiaba con `delete from companies where document_number = RUC`. Cada corrida de `real-db` dejaba a `demo@` con cuenta `company` sin fila en `companies` y `marcas.company_id = null` (`on delete set null`): `GET /me` responde 500 y la app queda inservible para esa cuenta (así encontré el estado de la BD). Ahora el RUC se genera aleatorio por corrida. **Restauré a mano la fila de `companies` de `demo@` y el `company_id` de sus dos marcas** (datos del fixture). Ver F7-B3 para el endurecimiento del backend.

**F7-A2 (media). Un administrador sin registro no puede abrir `/admin`.**
`frontend/src/middleware.ts:80-96`: tras comprobar que es admin, la regla de "registro pendiente" lo manda a `/registro` (y para llegar a `/admin` hay que declararse Empresa o Influencer). `admin@sponcer.test` o cualquier correo de `ADMIN_EMAILS` que entre por primera vez ve el onboarding. Rompió los E2E de F6; en la suite se registra al admin por API como paso de preparación y el defecto queda documentado.
Test: `e2e-16` › `test.fail('F7-A2 …')`. Arreglo: eximir `/admin` (o a los admin) del redirect.

**F7-U1. La campaña rápida se crea antes de validar la cotización y deja campañas activas huérfanas.**
`QuoteComposer.tsx` (submit): con "Crear una campaña rápida…" llama a `createCampaign` y recién después valida `CreateQuoteRequest`. Con el mensaje vacío (el error más común) el formulario falla, `campaign` sigue en "nueva" y el siguiente intento crea OTRA campaña con el mismo nombre. Cada intento fallido deja una campaña activa vacía.
Test: `e2e-16` › `test.fail('F7-U1 …')`. Arreglo: validar mensaje/monto antes de crear la campaña (o crear la cotización y la campaña en el servidor).

### Bajos / informativos

- **F7-B1.** El contrato dice que "`null` o `[]` explícitos vacían", pero `description` es `.optional()` y no admite `null`: `PATCH {description:null}` da 400, y el formulario de edición manda `undefined` cuando el campo queda vacío, así que **la descripción no se puede borrar desde la UI** (`campaigns.ts:35`, `CampaignForm.tsx` `description: description.trim() || undefined`). Test: `it.fails('F7-B1 …')`.
- **F7-B3.** `AccountStore.get` (`supabase-adapters.ts` de auth) usa `.single()` sobre `companies`: si falta la fila, `/me` responde 500 y el middleware (que llama a `/me` en cada ruta protegida) deja a la persona fuera de toda la app. Test: `it.fails('F7-B3 …')`.
- **Cotizar a fichas sin dueño** se acepta (crea la cotización, cuenta contra el límite por hora y nadie la recibe hasta que se reclame). La tarjeta del feed ofrece "Cotizar" también a fichas previas. Decisión de producto pendiente; test que documenta el comportamiento actual.
- **Fecha de inicio por defecto en UTC** (`new Date().toISOString().slice(0,10)` en `CampaignForm`/`QuoteComposer`): de noche en Lima la campaña "empieza mañana".
- **Sin límite al crear campañas** (cualquier usuario con una marca puede crear cientos); `profile_views` e intereses sí quedan acotados por clave primaria.
- **Registro**: DNI y RUC 10… de la misma persona son documentos distintos (unicidad solo por texto); una cuenta anterior con perfiles de ambos roles pero sin `accounts` queda obligada a elegir un tipo y sus perfiles del otro tipo quedan sin acceso. ARCO: al retirar una ficha (`status = removed`) se conservan sus filas de `profile_views`, `campaigns` y `quotes` (no se listan, pero no se borran; solo se borran con la cuenta).
- **Firefox + axe:** `axe` cuelga el motor (`Page crashed`) en `/registro` con errores y en `/campanas` (igual que `/descubrir @1440`, F5-O-6; sin axe las mismas pantallas pasan en Firefox, e2e-16). Esas 4 pruebas se saltan solo en Firefox; Chromium y WebKit las corren y no reportan violaciones. No es un defecto del producto comprobado.

## Verificado sin hallazgos

- **Contrato:** `contracts` 11/11; `openapi.json` está al día (regenerado y comparado byte a byte); `api.ts` ↔ rutas ↔ esquemas coinciden; mock y real pasan la misma suite de `QuoteRepository`/`CampaignRepository`.
- **Arquitectura:** `lint:deps` verde (198 módulos).
- **RLS (probado permitido y denegado):** `companies`, `accounts`, `consents` y `campaigns` no se leen ni escriben con anon ni con el JWT del propio dueño; `profile_views` solo la lee el dueño de la ficha vista (el visitante, terceros y anon no; nadie escribe ni borra por PostgREST); `quotes.campaign_id` obligatorio, `service_id` opcional, cascada campaña → cotizaciones y `restrict` del servicio. `register_account` y `claim_profile` dan 42501 a anon y authenticated (también pasando el `user_id` de otro); `owns_profile` es solo para `authenticated` y responde solo por quien llama.
- **Registro (HTTP real):** tipo exclusivo (no se re-registra ni se cambia, ni con dos peticiones simultáneas: una cuenta, un consentimiento); RUC con dígito verificador y prefijo por tipo (jurídica 20, natural 10 o DNI), DNI de 8 dígitos, 10 casos 400 sin cuenta creada; consentimiento exigido y guardado con versión y fecha; documento duplicado (RUC o DNI) → 409 `document_taken` sin dejar la cuenta a medias y con reintento posible; sin registro no se reclama (403 `registration_required`); Empresa solo reclama `brand` (queda con `company_id`) e Influencer solo `creator` (400 `role_mismatch`).
- **Campañas:** solo marcas propias (403 para creador, otra empresa, perfil ajeno o inexistente; 404 para el id de una campaña ajena con el propio `profileId`); transiciones solo hacia adelante (409 `INVALID_TRANSITION` en `closed→active`, `active→draft`); PATCH parcial conserva los campos y `null`/`[]` vacían fecha fin, presupuesto, nichos y ciudades; fechas incoherentes 400 (también contra la fecha guardada); bordes (presupuesto negativo/enorme, 6 ciudades, nombre vacío, fecha inválida, `kind` inválido); estadísticas `byStatus` y `committedPen` correctas (solo aceptadas y completadas).
- **Cotización múltiple:** sin match (no se crea ninguno); servicio con precio por defecto y propuesta abierta; borrador o campaña cerrada → 400 `campaign_not_active` sin filas; `failed` por destinatario (servicio de otro creador, creador inexistente, marca como destino, ficha retirada, duplicado dentro de la misma petición); duplicado abierto → `CONFLICT`, y tras rechazar se puede volver a cotizar; **carrera de 6 peticiones simultáneas deja exactamente 1 cotización**; límite 60/hora por marca (parcial → `failed`, total → 429, otra marca no se ve afectada); `listQuotes` por `campaignId` (una campaña ajena no devuelve nada); un tercero no transiciona (403 al hacerse pasar por el destinatario); notificación al creador; el creador no ve presupuesto ni correo de la marca.
- **Visibilidad:** intereses sin match que salen al hacer match o descartar; visitas solo de tipo opuesto, no propias, no de administradores, no de fichas sin dueño ni retiradas, una por día; contadores 7 d / 30 d con datos a 2, 3, 10, 20, 40 y 45 días; paginación con cursor y orden; 403 al consultar el perfil ajeno (resumen, intereses y visitas); perfiles ARCO excluidos de listas y contadores; la respuesta no contiene correo, `userId`, `companyId`, razón social ni documento del visitante; al borrar la cuenta se borran visitas, consentimientos y empresa.
- **Frontend contra el backend real:** enlace mágico por Mailpit → `/registro` (toda ruta protegida lleva allí); registro completo como Empresa (RUC inválido y RUC 10 para jurídica con error en vivo, consentimiento obligatorio, primer reclamo de marca, `companies`/`consents`/`company_id` en BD) y como Influencer; el tipo no se cambia (409 por API, `/registro` redirige al panel); acceso demo con `demo@` (Empresa, 2 marcas, `/campanas`) y `demo-influencer@` (Influencer, `/campanas` redirige al panel); crear y activar campaña por la UI, cotizar a 2 influencers (uno con servicio, otro propuesta abierta) sin match, segundo envío al mismo creador informado como fallido, aceptación por el influencer y avance en la campaña (monto comprometido), cierre (la UI deja de ofrecer cotizar y la API da 400), otra empresa recibe 404; visibilidad tras visitar una ficha con la otra cuenta (visita una vez, interés sin match, devolver interés crea el match, sin correo ni RUC en el HTML).
- **Accesibilidad (axe, WCAG 2.1 AA, 1440 y 414 px):** `/registro` en sus cuatro pasos y con errores, `/campanas` (lista, formulario con errores, detalle, selector y compositor), diálogo de cotización y `/visibilidad` (ambas pestañas): sin violaciones en Chromium y WebKit (en Firefox ver nota arriba).
- **Secretos:** `frontend/dist-audit/` no contiene la service key, el token de Apify, `DEMO_PASSWORD` ni la contraseña E2E.

## Tests añadidos o actualizados

| Archivo | Qué cubre |
|---|---|
| `backend/tests/contract/real/f7-auditoria.e2e.supabase.test.ts` (nuevo, 58 casos, 4 `it.fails`) | HTTP real con JWT y Supabase: registro, campañas, cotización múltiple, visibilidad y privacidad (todo lo de "verificado") más F7-M1, F7-M2, F7-B1, F7-B3 |
| `db/tests/f7-rls.test.ts` (nuevo, 17 casos) | RLS del dueño, RPC solo service role (`register_account`, `claim_profile`, `owns_profile`), `profile_views`, índice único de cotización abierta, cascadas |
| `db/tests/migrations/f7-migration.sh` y `f7-legacy-data.sql` (nuevos) | Migración F7 sobre datos del esquema anterior en una BD temporal (F7-A1) |
| `frontend/tests/e2e/e2e-16-f7-empresas-campanas.spec.ts` (nuevo, 8 tests, 3 `test.fail`) | Registro Empresa e Influencer con enlace mágico, acceso demo por tipo, campaña y cotización múltiple, visibilidad; F7-U1, F7-A2, F7-M3 |
| `frontend/tests/e2e/a11y/axe-f7.spec.ts` (nuevo, 10 tests) | axe en las pantallas nuevas a 1440 y 414 px |
| `frontend/tests/e2e/support/{api,session,bulk,removals,env}.ts` | El cliente registra la cuenta antes de reclamar (`ensureRegistered`), `createQuote`/`createCampaign` con el modelo nuevo, `loginAs` deja al usuario registrado (o `null`), `seedQuotes` con campañas, el admin de prueba se registra, y se restaura el `DEMO_PASSWORD` de `backend/.env` |
| E2E existentes ajustados | `e2e-01` (primer acceso va a `/registro`), `e2e-02/03/04` (textos "Influencer", rol fijo), `e2e-04` y `e2e-06` ("Cotizar" en diálogo, campaña rápida), `e2e-13` (Origin en el POST del formulario: antes se saltaba y devuelve 403 por el CSRF), `e2e-15` (invitado y usuario existente aterrizan en `/registro`), `a11y/axe` y `a11y/keyboard` (flujo de cotización nuevo) |
| `backend/tests/contract/real/accounts-campaigns.supabase.test.ts` | RUC aleatorio en vez del de `demo@` (F7-M4) |

Los `it.fails` y `test.fail` pasan hoy porque el defecto existe; al corregirlos fallarán y hay que quitar `.fails`/`test.fail`.

## Cómo se ejecutó

```
backend:  PORT=3100 CORS_ORIGIN=http://localhost:4421 APP_URL=http://localhost:4421 \
          ADMIN_EMAILS=admin@sponcer.test,e2e-admin@e2e.sponcer.local npx tsx --env-file=.env src/main.ts
frontend: PUBLIC_API_URL=http://localhost:3100 PUBLIC_API_MODE=http PUBLIC_AUTH_MODE=supabase PUBLIC_DEMO_LOGIN=true \
          npx astro build --outDir dist-audit ; HOST=127.0.0.1 PORT=4421 DEMO_PASSWORD='E2E-demo-Passw0rd!' node dist-audit/server/entry.mjs
          E2E_DEMO_PASSWORD='E2E-demo-Passw0rd!' npx playwright test
```

Resultados finales: backend `unit` 63 archivos / 776 tests pasan (2 saltados); `real-db` 284 pasan, 4 fallos esperados (`it.fails`), 15 saltados (Apify); `db` (RLS) 222/222; `contracts` 11/11; `lint:deps` verde; `typecheck` 0 errores; Playwright (Chromium, Firefox y WebKit) **295 pasan, 8 saltados, 0 fallos** (los 3 `test.fail` de e2e-16 cuentan como pasados); `prettier --check --end-of-line auto` y `eslint` limpios en `backend/tests`, `db/tests` y `frontend/tests`. La primera corrida completa (antes de ajustar los E2E) dio 19 fallos en Chromium por F7: usuarios sin registro (`/registro`), textos "Solicitar cotización"/"Creador", `seedQuotes` sin campaña y `e2e-13` (403 CSRF).

## Estado al terminar

- BD limpia de datos de prueba (0 perfiles `zz.`/`e2e.`, 0 usuarios `audit.test`/`e2e.sponcer.local`, BD temporal `mig_audit` borrada). `companies` conserva las 3 del seed (`demo@`, `usuario2@`, `usuario4@`).
- Las cuentas `demo@`, `demo-influencer@` y `usuario4@sponcer.local` quedan con el `DEMO_PASSWORD` de `backend/.env` (los E2E de acceso demo ya no las dejan con una contraseña aleatoria). `usuario1-3@` no tienen contraseña hasta correr `npm run demo:accounts`.
- Detuve los procesos que arranqué (:3100, :4421) y borré `frontend/dist-audit`. No toqué `frontend/dist` ni el proceso de :4321.
- Las reglas del hook de estilo (`no-magic-numbers`, bucles) que aparecieron al escribir los tests no forman parte del `eslint` del repo y no se aplicaron a los tests.

## Re-verificación (tras las correcciones A1, M1, M2, M3, A2, U1, B1, B3 y fichas sin dueño)

Veredicto: **APROBADO**. Probado sobre el árbol de trabajo (HEAD `8885289`) con `supabase db reset` local (migración editada en su sitio) y `npm run demo:accounts`, backend en :3100 y frontend compilado en `frontend/dist-audit` (borrado al terminar) en :4421, en modo http. No toqué `frontend/dist` ni :4321.

| Hallazgo | Estado | Evidencia |
|---|---|---|
| F7-A1 migración con duplicadas abiertas | **Resuelto** | `bash db/tests/migrations/f7-migration.sh` ampliado con aserciones sobre el contenido: de tres cotizaciones abiertas de una marca al mismo creador queda abierta solo la más reciente (`b1-c1 newest`, `negotiating`); las otras dos (`sent` y `draft`) pasan a `cancelled` con un evento `from→cancelled` y nota "cancelada al migrar a campañas: duplicada" (2 eventos); la `rejected` antigua y las de otra marca no se tocan. Caso sin duplicados sigue creando una "General" por marca. `db reset` real aplica la migración sin errores |
| F7-M1 `/registration` sin límite | **Resuelto** | 5/hora por usuario: el test de 60 intentos recibe 429 (ya no es `it.fails`) |
| F7-M2 reapertura por edición concurrente | **Resuelto** | `update … where status = esperado`, CONFLICT si cambió; 12 pares concurrentes dejan siempre `closed` |
| F7-M3 selector sin influencers ya marcados | **Resuelto** | E2E de punta a punta en modo http (3 navegadores): un influencer con "Me interesa" y otro descartado aparecen en el selector de la campaña y se les cotiza a ambos (`Cotizaciones creadas (2)`) |
| F7-A2 admin sin registro | **Resuelto** | un `admin@sponcer.test` sin cuenta abre `/admin/exclusiones` con 200 |
| F7-U1 campaña rápida huérfana | **Resuelto** | mensaje vacío → error sin crear campaña (o se reutiliza la creada); tras corregir queda una sola "Rápida E2E" |
| F7-B1 `description: null` | **Resuelto** | `PATCH description:null` vacía la descripción |
| F7-B3 `/me` con empresa faltante | **Resuelto** | `/me` responde 200 con `company: null` |
| Cotizar a fichas sin dueño | **Resuelto** | `failed` con `VALIDATION_ERROR` por destinatario |

Cambios en la suite: quité todos los `it.fails`/`test.fail` de F7 (ahora son pruebas normales); `f7-migration.sh` verifica el contenido migrado y sale con error si no coincide; el test de M3 cubre también el descarte y la cotización posterior.

Resultados: backend `unit` 777 pasan (2 saltados); `real-db` 288 pasan, 0 fallos esperados, 15 saltados (Apify); `db` (RLS) 222/222; `contracts` 11/11; `lint:deps` verde; `typecheck` 0 errores; `prettier --check --end-of-line auto` y `eslint` limpios en `backend/tests`, `db/tests` y `frontend/tests`; Playwright en Chromium, Firefox y WebKit **294 pasan, 8 saltados (incluye el salto conocido de axe en Firefox), 1 fallo intermitente**: `e2e-05` ("¡Match con @…!" no apareció en 15 s) en Firefox, en el arranque en frío; repetido 4 veces en Firefox pasa (8/8) y pasó en las corridas anteriores en los 3 navegadores. No está ligado a F7 (no usa campañas ni el selector).

Observaciones menores que quedan (no bloquean):
- La migración conserva la más reciente por fecha, aunque la antigua esté `accepted` y la nueva sea un `draft`: la aceptada se cancela. Para datos reales conviene priorizar `accepted`.
- El límite de `/registration` es por usuario: quien cree muchos usuarios (un correo por cada uno) puede repetir 5 sondeos de documento por usuario; el correo de enlace mágico limita el ritmo, pero el mensaje `document_taken` sigue siendo un oráculo débil de DNI.
- `update` condicional protege el estado, no los demás campos: dos ediciones simultáneas de campos distintos todavía se pisan (la última gana).
- `demo:accounts` actualizó 6 cuentas (el seed trae 6, no 7). Las cuentas demo quedan con el `DEMO_PASSWORD` de `backend/.env` (verificado: las 6 inician sesión).

Estado final: BD recién reseteada, sin datos de prueba (0 perfiles `zz.`/`e2e.`, 0 usuarios de prueba, `mig_audit` borrada, 3 empresas del seed); procesos :3100 y :4421 detenidos.
