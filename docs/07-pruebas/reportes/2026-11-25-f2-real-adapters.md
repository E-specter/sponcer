---
responsable: agente audit
estado: aprobado
ultima_actualizacion: 2026-11-25
---

# Auditoría F2-A1: RLS y adaptadores reales de auth, profiles, quotes, notifications y chat

**RF/RNF:** RNF-03 (RLS, secretos), RNF-04, RNF-05 · **ADR:** ADR-005, ADR-006 · **Responsable humana:** Mariana
**Auditor:** agente audit (independiente de dev-backend y dev-data)

## Resultado: **OBSERVACIONES**

- **RLS: aprobado.** Las 15 tablas de `public` tienen RLS efectivo. Solo `notifications` (propias) y `messages` (de matches donde se es dueño de un perfil) se leen como `authenticated`. Ninguna tabla admite INSERT/UPDATE/DELETE de `anon` ni `authenticated`. Las RPC de servicio no son ejecutables por ellos.
- **Adaptadores reales: pasan las mismas suites de contrato que los mocks** (Liskov) sobre Supabase local: ClaimStore, ServiceRepository, RemovalRequestStore, QuoteRepository, NotificationRepository, MessageRepository e IdentityProvider.
- Durante la auditoría se encontró **un defecto alto de RLS (R-1)**, que dev-backend corrigió en la misma jornada (migración `20261125001300`). Queda verificado.
- Quedan **1 hallazgo medio-alto, 3 medios y 5 bajos** (abajo). Ninguno bloquea F2 en local, pero **F2-A-1 debe corregirse antes de exponer la edición de servicios** (devuelve 500 cuando debería ser 409).

## Archivos revisados

`backend/src/modules/{auth,profiles,quotes,notifications,chat}/infrastructure/out/supabase/`, `backend/src/shared/supabase/unwrap.ts`, `backend/src/compose.ts`, `backend/src/app.ts`, `db/supabase/migrations/{20261125000200..000900,001000,001100,001200,001300}_*.sql`, casos de uso de `quotes`, `notifications` y `chat` (solo el control de acceso). **No revisados** (siguen en desarrollo): adaptadores reales de `ingestion`, `classification` y `matching`.

## Verificación

| Comando | Resultado |
|---|---|
| `cd db && npx vitest run` (Supabase local) | 1 archivo, **146 tests pasan** |
| `cd backend && npx vitest run` | 35 archivos pasan y 2 saltados (los tests reales del dev), **434 tests pasan, 10 `it.fails`** (hallazgos abiertos), 11 saltados |
| `npx tsc -p backend/tsconfig.json` y `npx tsc -p db/tsconfig.json` | sin errores |
| `npm run lint:deps -w backend` | **0 violaciones** (163 módulos, 618 dependencias) |
| `eslint` y `prettier --check` sobre `backend/tests` y `db/tests` | limpios |

Los tests contra BD se saltan solos (`describe.skipIf(!hasSupabase)`) si no hay `SUPABASE_URL`/claves en el entorno o en `backend/.env`, y **solo corren si el host es local** (127.0.0.1, localhost): nunca escriben en un proyecto remoto. Las credenciales se leen en tiempo de ejecución y no se imprimen. Los datos de prueba (`zz.*`, `@audit.test`) se rastrean y se borran al terminar; tras las corridas no queda ningún resto (comprobado).

## RLS (RNF-03) · `db/tests/rls.test.ts`

Usuarios temporales creados con `auth.admin` (service_role), JWT reales con `signInWithPassword`, y clientes anon + JWT.

| Qué se prueba | Resultado |
|---|---|
| El esquema de `public` expone **exactamente** estas 15 tablas (una nueva obliga a ampliar la suite): `creator_services`, `ig_snapshots`, `ingestion_blocklist`, `interactions`, `matches`, `messages`, `notifications`, `profile_claim_attempts`, `profile_claims`, `profile_classifications`, `profile_embeddings`, `profile_removal_requests`, `profiles`, `quote_events`, `quotes` | cumple |
| Precondición: cada tabla tiene filas que ver con service_role (si no, "0 filas" no probaría nada) | cumple (15/15) |
| `anon`: SELECT en cada tabla | 0 filas en las 15 |
| `authenticated`: SELECT en las 13 tablas no legibles, **incluso las propias** (p. ej. su `profiles`, sus `quotes`, sus `profile_claims`) | 0 filas |
| **Permitido:** A lee sus `notifications` y no las de B (por id ni filtrando `user_id`) | cumple |
| **Permitido:** A (dueño del creador de M1 y M2) lee los mensajes de ambos matches; B (marca de M1) solo los de M1 | cumple |
| **Denegado:** un usuario sin perfiles en el match no lee sus mensajes; un perfil sin dueño no da acceso a nadie | cumple |
| INSERT como `authenticated` y como `anon` en cada tabla | error 42501 y el conteo no cambia (30 casos) |
| UPDATE y DELETE por id como `authenticated` y como `anon` en cada tabla (también `notifications` y `messages`) | 0 filas afectadas, el valor no cambia (60 casos). UPDATE/DELETE masivo sin filtro tampoco |
| `record_claim_attempt` y `match_candidates` como `anon` y `authenticated` | `permission denied` / no encontradas; no se registró ningún intento |
| Control positivo: las dos RPC como `service_role` | ejecutan; `record_claim_attempt` bajo ráfaga de 15 concurrentes devuelve `true` exactamente 5 veces |
| `is_match_participant` (nueva, `security definer`): `anon` no la ejecuta; `authenticated` solo obtiene `true` para sus matches (no es un oráculo de terceros) | cumple |

### R-1 · La política de lectura de `messages` nunca dejaba leer nada (ALTO, **corregido**)

`messages_select_match_owner` hacía un `EXISTS` sobre `matches` y `profiles`, que tienen RLS sin políticas: dentro de la política el usuario no veía esas filas y el `EXISTS` siempre era falso. *Escenario:* A, dueño de un perfil del match, llamaba a `select * from messages` y recibía 0 filas, y la entrega en vivo por Realtime (`postgres_changes`, ADR-006) no llegaba a nadie. Se detectó con el test positivo (`it.fails`). dev-backend lo corrigió con `public.is_match_participant(match_id)`: `security definer`, `search_path = ''`, `revoke ... from public, anon`, `grant ... to authenticated`. La corrección está verificada (positivo y denegados) y el `.fails` se retiró.
**Pendiente:** no hay test end-to-end de Realtime (un cliente suscrito que reciba el INSERT). Se recomienda añadirlo en F4 con Playwright.

### Revisión de las migraciones

- `security invoker` + `set search_path = ''` + `revoke ... from public, anon, authenticated` + `grant ... to service_role` en `record_claim_attempt` y `match_candidates`: **correcto y probado**. `match_candidates` excluye perfiles `removed` (privacidad).
- `record_claim_attempt` usa un advisory lock por usuario: es atómica (probado con ráfaga).
- Bajo: `profile_claim_attempts` no tiene retención ni purga (crece sin cota). `messages.body` no tiene `CHECK` de longitud en BD (el límite de 2000 solo lo aplica zod en el borde).

## Contratos contra los adaptadores reales · `backend/tests/contract/`

Las suites son las mismas funciones `describe<Port>Contract(factory)` que corren contra los mocks; cada una recibe un *harness* (el adaptador + datos propios). Archivos nuevos o reescritos:

| Suite | Mock | Real (Supabase local) |
|---|---|---|
| `auth/claim-store.contract.ts` (reescrita: solo `tryRecordAttempt`, atómico, ráfaga, por usuario, ventana) | pasa | pasa (con `clockInjectable: false`, ver F2-L-1) |
| `auth/identity-provider.contract.ts` (fixture asíncrona) | pasa | pasa con JWT reales de Supabase Auth |
| `profiles/service-repository.contract.ts` (+ `findById` y 4 casos de **ids estables**) | 4 `it.fails` (F2-L-2) | **pasa, incluidos los ids estables** |
| `profiles/removal-request-store.contract.ts` (handle propio por test) | pasa | pasa |
| `quotes/quote-repository.contract.ts` (nueva: append-only, idempotente, orden con mismo instante, partes, ISO con Z) | pasa | pasa |
| `notifications/notification-repository.contract.ts` (nueva: orden, paginación, ACL por usuario, `markRead`) | pasa | pasa |
| `chat/message-repository.contract.ts` (nueva: orden, paginación, ACL por match, tildes/emoji) | pasa | pasa |

La suite de `ProfileReader`+`ProfileWriter` **no se enchufa al real** porque asume los fixtures del seed y modifica filas (estropearía el seed). En su lugar, `real-adapters.review.supabase.test.ts` prueba el repositorio real con datos propios (jsonb de `declared`, lecturas por id/handle/dueño/rol, perfil removido legible).

### Pruebas HTTP sobre los adaptadores reales (compose con `ADAPTER_PROFILES=real` y `ADAPTER_QUOTES=real`, auth mock)

`GET /me`, `GET /profiles/:handle`, `PATCH declared`, `PUT services` y 403 de no dueño, todo contra la BD real y validado con los esquemas `api.*.response`. `PUT services` conserva el id de un servicio sin cambios.

## Hallazgos de la revisión de código F2-B

### Medio-alto

**F2-A-1 · Quitar un servicio con cotizaciones responde 500 en vez de 409** (`profiles/infrastructure/out/supabase/supabase-adapters.ts:67`, `shared/supabase/unwrap.ts:5-9`; `PG_FK_VIOLATION` está definido y no se usa)
`quotes.service_id` es `ON DELETE RESTRICT`. *Escenario reproducido por HTTP:* un creador con una cotización sobre su servicio hace `PUT /profiles/:id/services {"services":[]}`; la BD rechaza el borrado (23503), `unwrap` lanza un `Error` genérico y la API responde `500 INTERNAL_ERROR` (y registra un error). El mock sí lo permite (sin FK), así que el fallo solo aparece en real. Tests: `F2-A-1` (HTTP) y `F2-M-2` (adaptador debe rechazar con `DomainError CONFLICT`), ambos `it.fails`.
*Sugerencia:* el puerto `ServiceRepository.replace` debería devolver `Result` (o lanzar un `DomainError('CONFLICT', ...)`) al ver 23503, y la UI explicar "este servicio tiene cotizaciones". La misma regla aplica a los demás FK (`quote.save` con servicio inexistente da 23503 → 500; en la práctica los casos de uso lo previenen).

### Medio

**F2-M-1 · `ServiceRepository.replace` no es atómico** (`supabase-adapters.ts:63-80`, shortcut documentado por el dev)
Borra las sobrantes y luego hace N `update`/`insert` en paralelo (`Promise.all`). *Escenario reproducido:* catálogo [a, b, c] reemplazado por [a2, b2, c2 con un precio que viola el CHECK] deja [a2, b2, c]: catálogo mezclado. Dos `PUT` simultáneos pueden rechazarse entre sí. Por HTTP el zod evita el precio inválido, pero un corte de red a mitad lo provoca. Test `F2-M-1` (`it.fails`).
*Sugerencia:* una RPC `replace_services(p_profile_id, p_services jsonb)` (un solo statement transaccional) que haga el mismo plan por contenido.

**F2-M-3 · `QuoteRepository.save` no es seguro ante transiciones concurrentes** (`quotes/.../supabase-adapters.ts:27-37`, shortcut documentado)
Upsert de la cotización y luego `insert` de los eventos nuevos (`history.slice(stored.length)`), sin versión. *Escenario reproducido:* dos transiciones desde `sent` (una a `negotiating` y otra a `accepted`) guardadas a la vez dejan el historial `sent → negotiating → accepted` con dos eventos "desde sent" y un estado que depende de quién escribió último; según el orden, también puede perderse un evento. Test `F2-M-3` (`it.fails`).
*Sugerencia:* concurrencia optimista (`update ... where status = :from` y comprobar filas afectadas → `INVALID_TRANSITION`) o una RPC `transition_quote`.

**F2-M-4 · `claimProfile` tiene una condición de carrera** (`profiles/application/use-cases/claim-profile.ts` + `save` = upsert por id)
`findByHandle` y luego `upsert` sin condición. *Escenario reproducido:* dos usuarios verifican el mismo handle libre a la vez, ambos reciben `verified`, y el dueño final es el último en escribir (o se rompe con 500 si el handle no existía: dos ids distintos chocan en el `unique(ig_handle)`). Requiere que ambos hayan puesto su código en la bio, así que la probabilidad es baja, pero la consecuencia es ceder la titularidad. Misma causa: `save` reescribe la fila completa (lost update: un `removed` concurrente con un `updateDeclared` puede revivir la ficha). Test `F2-M-4` (`it.fails`).
*Sugerencia:* `claim_profile(handle, user, role)` como RPC (`update ... where owner_user_id is null` y comprobar), y `save` parcial por columnas.

### Bajo

- **F2-B-1 · Inyección en el filtro de `listByProfile`** (`quotes/.../supabase-adapters.ts:21`): interpola `profileId` en `.or(\`requester_profile_id.eq.${id},...\`)`. *Reproducido a nivel de adaptador:* `listByProfile("<uuid>,status.neq.zzz")` devuelve las cotizaciones de **todos**. **No es explotable por HTTP hoy** (`QuotesQuery.profileId` es `z.uuid()` y el caso de uso exige ser dueño), pero el adaptador no se defiende. Solución: validar uuid en el adaptador o hacer dos consultas con `.eq`. Test `F2-B-1` (`it.fails`).
- **F2-L-1 · `tryRecordAttempt(userId, now)` ignora `now` en el real** (usa el reloj de la BD). Con `composeApp(env, { now })` el reloj inyectado no afecta al límite de intentos en real. El puerto filtra un parámetro que el real no usa. Se refleja en la opción `clockInjectable` de la suite.
- **F2-L-2 · El mock de `ServiceRepository.replace` regenera todos los ids** (`profiles/.../mock-adapters.ts:79-83`), el real los conserva. Viola Liskov: el mock oculta el problema de las cotizaciones. 4 casos de la suite quedan como `it.fails` con `stableIds: false`; al corregir el mock, poner `true`.
- **F2-L-3 · `unwrap` incluye el error de PostgREST como `cause`**: los logs pueden contener detalles de la fila ("Key (ig_handle)=(...) already exists"). El cliente solo recibe `Error interno` (verificado), pero conviene no loguear `details` con datos de personas.
- **F2-L-4 · `compose` permite mezclar adaptadores incoherentes** (p. ej. `ADAPTER_QUOTES=real` con `ADAPTER_PROFILES=mock`): los ids del mock no existen en la BD y todo falla con FK/500. Añadir una validación en `loadEnv`.

### Conformidad (sin hallazgo)

- **service_role solo en el backend:** `SUPABASE_SERVICE_ROLE_KEY` solo se lee en `config/env.ts` y se usa en `compose.ts`; no aparece en `frontend/` ni en `docs`. `.env` está en `.gitignore`. El frontend usa solo la clave anon.
- **Control de acceso:** los adaptadores usan service_role, así que el ACL lo imponen los casos de uso. Se revisó: `quotes` (dueño del perfil, y `actorAllowed` por estado), `notifications` (`found.userId !== userId`), `chat` (participante y dueño del remitente). Las suites de contrato añaden las pruebas de aislamiento por usuario, por match y por perfil en cada adaptador: **ningún adaptador devuelve filas de otro usuario/match/perfil**.
- **Inyección SQL:** todas las consultas usan el cliente PostgREST (parametrizado); la única interpolación es la de F2-B-1. Las RPC reciben parámetros tipados.
- **IdentityProvider real:** rechaza firma alterada, token de usuario borrado y cabeceras mal formadas, y acepta `bearer` en minúsculas. Cualquier fallo es "sin sesión" (no lanza).
- **Privacidad:** `match_candidates` excluye `removed`; los pedidos de exclusión (con correo) y los intentos de verificación solo son legibles con service_role (probado).

## Tests añadidos o modificados

| Archivo | Contenido |
|---|---|
| `db/tests/support/supabase.ts` | Soporte único (db y backend): lectura de credenciales sin imprimirlas, guarda de host local, usuarios/perfiles/matches temporales, barrido de restos (solo > 10 min, para no pisar archivos en paralelo) |
| `db/tests/rls.test.ts` | 146 tests de RLS descritos arriba |
| `backend/tests/contract/auth/claim-store.contract.ts` | Reescrita solo con `tryRecordAttempt` (N-3) |
| `backend/tests/contract/auth/identity-provider.contract.ts` | Fixture asíncrona (JWT real) |
| `backend/tests/contract/{quotes,notifications,chat}/*.contract.ts` y `*.mock.test.ts` | Suites nuevas y su ejecución contra los mocks |
| `backend/tests/contract/profiles/service-repository.contract.ts` | Harness, `findById` e ids estables |
| `backend/tests/contract/profiles/removal-request-store.contract.ts` | Handle propio por test |
| `backend/tests/contract/real/real-adapters.supabase.test.ts` | Las suites de contrato contra los adaptadores reales |
| `backend/tests/contract/real/real-adapters.review.supabase.test.ts` | IdentityProvider real, HTTP sobre adaptadores reales, repositorio de perfiles y los `it.fails` F2-A-1, F2-M-1..4, F2-B-1 |
| `backend/tests/support/app.ts` | Usa `composeApp(env, { now })` y el `bus` devuelto: reloj inyectado (sin congelar `Date`) y captura de eventos (`ProfileVerified`, `ProfileDeclaredDataChanged`); se restauraron las aserciones de eventos de N-1 |

**Convención `it.fails`:** los 10 `it.fails` describen el comportamiento correcto de un hallazgo abierto; fallan cuando se corrige (entonces, quitar `.fails`). Son: F2-L-2 (4 casos del mock), F2-A-1, F2-M-2, F2-M-1, F2-M-3, F2-B-1 y F2-M-4.

## Lista de bugs para el dev (por prioridad)

| # | ID | Dónde | Qué hacer |
|---|---|---|---|
| 1 | F2-A-1 | `profiles/.../supabase-adapters.ts:67`, `shared/supabase/unwrap.ts` | Mapear 23503 a `DomainError CONFLICT` (409) |
| 2 | F2-M-4 | `claim-profile.ts` + `save` | Reclamo condicional en la BD (RPC) y `save` parcial |
| 3 | F2-M-3 | `quotes/.../supabase-adapters.ts:27-37` | Transición con concurrencia optimista o RPC |
| 4 | F2-M-1 | `profiles/.../supabase-adapters.ts:63-80` | RPC transaccional `replace_services` |
| 5 | F2-B-1 | `quotes/.../supabase-adapters.ts:21` | Validar uuid o consultas con `.eq` |
| 6 | F2-L-2 | `profiles/.../mock-adapters.ts:79-83` | El mock conserva ids como el real (luego `stableIds: true`) |
| 7 | F2-L-1, F2-L-3, F2-L-4 | ver arriba | Opcionales |

## Pendiente

- Test end-to-end de Realtime (cliente suscrito que recibe el INSERT de un mensaje y una notificación) cuando exista el flujo en el frontend (F4).
- Revisar los adaptadores reales de `ingestion`, `classification` y `matching`, y añadirles su suite de contrato y su caso de RLS (`ig_snapshots`, `profile_classifications`, `profile_embeddings`, `interactions`, `matches` ya están cubiertas en denegado).
- Confirmar en el despliegue remoto de F3 que `auth.users` y las políticas coinciden con las de local.

---

## Re-verificación F3 (tras F3-FIX-2)

dev-backend aplicó `20261125001400_transactional_rpcs.sql` (`replace_creator_services`, `claim_profile`, `transition_quote`), el mapeo FK/SP409 a `CONFLICT`, el mock con ids estables y `unwrap` sin detalles. Cada hallazgo tenía un `it.fails`; todos pasaron a rojo al corregirse y se retiraron los `.fails`, así que **cada test es ahora una regresión** (`tests/contract/real/real-adapters.review.supabase.test.ts`, `tests/contract/profiles/profiles.mock.test.ts`).

| ID | Estado | Verificación |
|---|---|---|
| R-1 (RLS `messages`) | **Corregido** (ya en F2) | `is_match_participant`; positivo y denegados en `db/tests/rls.test.ts` |
| F2-A-1 (FK → 500) | **Corregido** | `PUT services` que quita un servicio con cotizaciones responde 409 por HTTP |
| F2-M-1 (`replace` no atómico) | **Corregido** | RPC `replace_creator_services`: si falla, el catálogo anterior queda intacto |
| F2-M-2 (`DomainError` por FK) | **Corregido** | el adaptador rechaza con `DomainError CONFLICT` |
| F2-M-3 (transiciones concurrentes) | **Corregido** | `transition_quote` con estado esperado: el historial es una cadena válida |
| F2-M-4 (reclamo concurrente) | **Corregido** | `claim_profile` condicional: exactamente un reclamo gana |
| F2-B-1 (`.or()` en quotes) | **Corregido en quotes** | **Pero el mismo patrón sigue en `matching` (F3-B-1, ver reporte F3)** |
| F2-L-2 (mock regenera ids) | **Corregido** | la suite de ids estables pasa en mock (`stableIds: true`) y en real |
| F2-L-3 (detalles de BD en logs) | **Corregido en `unwrap`** | solo código y mensaje. **Persisten `details` en errores de ingestion y matching (F3-L-3)** |
| F2-L-1 (`tryRecordAttempt` ignora `now`) | Sin cambios | opción `clockInjectable: false` en la suite real; informativo |
| F2-L-4 (adaptadores mezclados) | Sin cambios | `loadEnv` sigue aceptando, p. ej., `ADAPTER_QUOTES=real` con `ADAPTER_PROFILES=mock` |

**RLS de las RPC nuevas:** `db/tests/rls.test.ts` (ahora 148 tests) comprueba que `anon` y `authenticated` **no pueden ejecutar** `replace_creator_services`, `claim_profile` ni `transition_quote` y que, tras el intento, no cambió el catálogo, el dueño del perfil ni el estado de la cotización. Los `revoke`/`grant` de la migración son correctos.

**Reglas nuevas, ya en los tests HTTP:** `PUT services` conserva los ids de las filas idénticas (`profiles.http.test.ts`).
