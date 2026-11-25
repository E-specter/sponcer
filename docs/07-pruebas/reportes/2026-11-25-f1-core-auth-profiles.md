---
responsable: agente audit
estado: aprobado
ultima_actualizacion: 2026-11-25
---

# Auditoría F1-A1: núcleo de la core API, `auth` y `profiles` (modo mock)

**Responsable humana:** Mariana · **Auditor:** agente audit (independiente de dev-backend)
**RF:** RF-02, RF-03 (parcial: solo mock), RF-04, RF-05, RF-06, RF-07 · **RNF:** RNF-03, RNF-04, RNF-05 · **ADR:** ADR-002, ADR-005

## Resultado inicial: **OBSERVACIONES** (ver "Re-verificación F1-A2" al final: **APROBADO** para auth/profiles)

La arquitectura y el contrato están bien. No hay violaciones de dependencia y todos los endpoints de `auth` y `profiles` cumplen el esquema `response` del registro `api`. Se encontraron 1 hallazgo alto (A-1), 6 medios (A-2, M-1 a M-5) y 5 bajos. Ninguno bloquea F1 con adaptadores mock, pero **A-1 y A-2 deben resolverse antes de exponer la API fuera de local**.

## Archivos revisados

`backend/src/{app.ts, main.ts, config/env.ts}`, `backend/src/shared/**`, `backend/src/modules/auth/**`, `backend/src/modules/profiles/**`, `contracts/src/{api.ts, schemas/{auth,profiles,common,limits}.ts}`, `contracts/fixtures/`. No se revisaron los slices `ingestion`, `classification`, `matching`, `quotes`, `notifications` y `chat` (otros agentes los están escribiendo).

## Verificación

| Comando | Resultado |
|---|---|
| `npm run lint:deps -w backend` | 0 errores, 1 aviso (`domain-sin-node-core`, ver B-1). 143 módulos, 525 dependencias |
| `cd backend && npx vitest run` | 22 archivos, 296 tests pasan, 7 `it.fails` (hallazgos documentados) |
| `npx tsc -p backend/tsconfig.json` | sin errores |
| `eslint` y `prettier --check` sobre lo añadido | limpios |

La config por defecto de vitest ya incluye `backend/tests/**` (no hace falta `vitest.config`). `tsconfig.json` ya incluye `tests`.

## Reglas de dependencia (`backend/.dependency-cruiser.cjs`)

Las cinco reglas de ADR-005 (`domain-puro`, `application-sin-infra`, `slices-por-index`, `shared-sin-negocio`, `sin-ciclos`). Más tres reglas añadidas:

- `domain-puro-npm`: el dominio solo importa `@sponcer/contracts` y `zod`. Es la parte "ningún paquete npm" de `domain-puro`.
- `domain-sin-node-core` (**warn**): avisa del uso de `node:*` en el dominio. El ADR solo veta paquetes npm, así que no bloquea.
- `sin-imports-irresolubles`: un import que no resuelve esconde violaciones.

Opciones: `tsPreCompilationDeps: true` (cuenta los `import type`, que es como `auth` se acopla a `profiles`), tsconfig del backend, resolución por `exports` del workspace y exclusión de `*.test.ts`.

**Prueba de que las reglas muerden:** `backend/tests/architecture/dependency-rules.test.ts` crea un árbol `src/` falso con cada violación y comprueba que cada regla la detecta (incluido el ciclo por `import type` y el import roto). Sin esto, un regex que no case dejaría `lint:deps` en verde sin proteger nada.

## Hallazgos

### Alto

**A-1 · Cualquier anónimo puede retirar al instante la ficha de un tercero** (`profiles/application/use-cases/request-removal.ts:16-18`, ruta pública en `contracts/src/api.ts` `requestRemoval`, `auth: false`)
`requestRemoval` marca `status: 'removed'` en cuanto llega la petición, sin comprobar que quien pide es el titular (ni confirmar por correo). *Escenario:* `POST /api/v1/profiles/sofi.moda.demo/removal-requests {"email":"cualquiera@atacante.pe"}` sin token responde 200; el perfil verificado de otro usuario desaparece de `/me`, de `GET /profiles/:handle`, de los candidatos de matching, y como `claimProfile` rechaza los removidos (`claim-profile.ts:16`) su dueño no puede recuperarlo. Con un script se vacía la plataforma. Además, no hay rate limit en este endpoint público (ver M-5).
*Sugerencia:* registrar el pedido como pendiente y ejecutar la exclusión tras confirmar por correo al titular (enlace con token), o exigir sesión del dueño cuando el perfil ya está verificado. Cubierto por la caracterización `[A-1 RIESGO]` en `tests/integration/profiles.http.test.ts` (cuando se corrija, ese test falla: sustituirlo por el flujo nuevo).

### Medio

**A-2 · El modo mock es un bypass total de autenticación y nada impide usarlo en producción** (`config/env.ts` sin guarda; `auth/auth.module.ts:39`; `auth/infrastructure/out/mock/mock-adapters.ts:11-17`)
`Authorization: Bearer mock:<uuid>` autentica como ese usuario, y los uuid de `contracts/fixtures/users.json` son públicos en el repo. `ADAPTER_AUTH` vale `mock` por defecto; con `NODE_ENV=production` y sin variables, `loadEnv` arranca igual. *Escenario:* un despliegue olvida `ADAPTER_AUTH=real` y cualquiera edita los perfiles demo. (Hoy `real` lanza "no implementado", así que el riesgo se activa cuando exista.)
*Sugerencia:* en `EnvSchema.superRefine`, rechazar `NODE_ENV=production` con cualquier `ADAPTER_*` en `mock` (o al menos `ADAPTER_AUTH`). Test: `A-2` (`it.fails`) en `tests/integration/app.http.test.ts`.
Nota relacionada: `register-endpoint.ts:94` solo valida la respuesta fuera de producción y envía el objeto sin parsear; si un handler colara un campo interno, en producción llegaría al cliente. Conviene enviar `check.data` (el parseo) siempre.

**M-1 · El límite de 5 verificaciones/hora no es atómico** (`auth/application/use-cases/confirm-profile-claim.ts:30-34`)
`countAttemptsSince` y `recordAttempt` son dos pasos separados. *Escenario:* 20 `verify` concurrentes del mismo usuario leen todos "0 intentos", pasan y hacen 20 lecturas en vivo, cada una con coste real en Apify (RF-02, ADR-002). Reproducido a nivel de caso de uso (`tests/integration/auth.concurrency.test.ts`, `it.fails`). Por HTTP con el mock no se ve porque las peticiones se serializan, pero con un adaptador Supabase con latencia sí ocurrirá.
*Sugerencia:* `ClaimStore.tryRecordAttempt(userId, at, max)` atómico (un único `INSERT ... WHERE count < max` o función SQL), que devuelva si se permitió.

**M-2 · `already_owned` se devuelve cuando el rol no coincide con la ficha libre** (`profiles/application/use-cases/claim-profile.ts:15-17` y `auth/application/use-cases/confirm-profile-claim.ts:46`)
`claimProfile` responde `CONFLICT` también cuando el perfil existe sin dueño pero con otro rol (o está removido), y el caso de uso lo traduce siempre a `already_owned`. *Escenario:* alguien reclama como `brand` el handle de una ficha libre de creador; la UI le dice que "ya tiene dueño" y le ofrece la disputa manual, falso. Test `M-2` (`it.fails`).
*Sugerencia:* distinguir los casos (p. ej. `details.reason` en el `DomainError`, o validar el rol al iniciar el reclamo).

**M-3 · El `:handle` de las rutas no se normaliza como el `IgHandle` del body** (`profiles/infrastructure/in/http/profiles.routes.ts:20-21` y `:29-30`)
`startClaim` normaliza (`@Sofi` → `sofi`) pero `GET /profiles/SOFI.MODA.DEMO` da 404 y `POST /profiles/SOFI.MODA.DEMO/removal-requests` responde 200 **sin excluir nada** (el titular cree que su pedido se atendió: incumplimiento ARCO silencioso, RNF-05). Tests `M-3` (`it.fails`, dos).
*Sugerencia:* parsear `params.handle` con `IgHandle` en las rutas (o un esquema de `params` en el registro `api`).

**M-4 · Errores del cliente con `status` propio de Express responden 500** (`app.ts:20-27`)
`onError` solo reconoce `entity.parse.failed`. *Escenario:* un cuerpo de más de 100 kB (`entity.too.large`, 413) o un parámetro con percent-encoding inválido (`/profiles/%E0%A4%A`, `URIError` 400) devuelven `INTERNAL_ERROR` 500 y contaminan los logs/alertas de errores. Tests `M-4` (`it.fails`, dos).
*Sugerencia:* en `onError`, si `e.status`/`e.statusCode` es 4xx, mapearlo a `VALIDATION_ERROR` (o 413) en vez de 500.

**M-5 · Sin rate limit HTTP en los endpoints públicos o caros** (`app.ts`; `express-rate-limit` está en `package.json` pero no se usa en `src/`)
RNF-04 pide rate limit en verificación e ingesta: la verificación tiene límite por usuario en el caso de uso (OK, salvo M-1). Pero `POST /profiles/:handle/removal-requests` (público), `POST /claims` (sin tope de reclamos abiertos por usuario) y los demás no tienen límite por IP/usuario. En el mock la memoria crece sin cota (`claims`, `removalLog`).
*Sugerencia:* `express-rate-limit` global y uno más estricto para `removal-requests` y `claims`.

### Bajo

- **B-1 · El dominio usa `node:crypto`** (`auth/domain/claim.ts:1`). Permitido por la letra del ADR-005 (solo veta paquetes npm), pero rompe la idea de "TS puro". La regla `domain-sin-node-core` lo avisa como warn. Opción: inyectar `hash` como dependencia o aceptar la excepción en el ADR.
- **B-2 · `main.ts` no es montable en tests** (`main.ts:34`, `app.listen` al importarse). El cableado `env → bus → profiles → auth → createApp` está duplicado en `app.test.ts` y en `tests/support/app.ts`. Si `main.ts` cambia (nuevo router, nuevo orden), los tests siguen en verde con un cableado distinto. Propuesta: extraer `composeApp(env)` a un módulo y que `main.ts` solo llame a `.listen`. No se tocó producción.
- **B-3 · `startClaim` no avisa si el handle ya tiene dueño** (`start-profile-claim.ts`). El usuario descubre `already_owned` solo al verificar, gastando un intento (y una lectura en vivo). Opcional: comprobar `profiles` antes de emitir el código.
- **B-4 · Sin cabeceras de seguridad** (`app.ts`): `X-Powered-By: Express` expuesto y sin `helmet`. Es una API JSON, impacto bajo.
- **B-5 · En el mock, dos reclamos del mismo handle se pisan** (`auth.module.ts:34-45`, `pendingCodes` por handle): el segundo código reemplaza al primero y el primer usuario recibe `code_not_found`. Es solo del mock (el real compara el código contra la bio real), pero hay que saberlo al probar E2E con dos usuarios sobre el mismo handle. Además `IdentityProvider` mock exige `Bearer` con B mayúscula (el esquema HTTP es insensible a mayúsculas); el adaptador real debería aceptarlo.

### Notas de conformidad (sin hallazgo)

- Los controladores solo traducen HTTP ↔ caso de uso; la propiedad se verifica en el caso de uso (`loadOwnedProfile`), no en la ruta.
- Asignación masiva: `ownerUserId`, `status`, `isOwner` enviados en el body de `PATCH declared` se ignoran (zod los descarta). Probado.
- Un reclamo ajeno devuelve 404 (no 403): no revela que existe. El código solo se guarda hasheado (SHA-256) y se invalida tras verificarse.
- Fichas previas visibles solo con sesión (RNF-05): `GET /profiles/:handle` exige token. Respuesta de `requestRemoval` idéntica exista o no el handle.
- Sin secretos en `backend/src` ni en `frontend/`: `process.env` solo se lee en `config/env.ts` y en `register-endpoint.ts:94` (`NODE_ENV`).
- RLS: no aplica a esta tarea (slices en modo mock, sin tablas). Queda pendiente para F2/F3 con el adaptador Supabase.

## Cobertura de requisitos

| RF/RNF | Verificado con |
|---|---|
| RF-02 (código, 30 min, 5/h, lectura en vivo) | `auth.http.test.ts` (todos los estados de `verifyClaim` salvo `not_eligible/private`, que el mock no puede producir por HTTP: los fixtures no tienen cuentas privadas; lo cubre `claim-flow.test.ts` del dev), `auth.concurrency.test.ts` |
| RF-04 multiperfil | `/me` con dos roles, `claimProfile` sin duplicar ficha |
| RF-05 validación idéntica | 400 por cada regla de `Declared` (nichos, límites, presupuesto, enum) |
| RF-06 ficha | `GET /profiles/:handle` propio, ajeno, sin dueño, removido, hostil |
| RF-07 servicios | `PUT services`: límites, precios, solo creador, solo dueño |
| RNF-04 validación en bordes | cada endpoint con cuerpo inválido; rate limit solo en verificación (M-1, M-5) |
| RNF-05 privacidad | 401 sin sesión en fichas, exclusión no revela existencia, ficha excluida invisible e irreclamable (con A-1 como riesgo) |

## Tests añadidos (`backend/tests/`)

| Archivo | Contenido |
|---|---|
| `architecture/dependency-rules.test.ts` | Demuestra que cada regla de dependency-cruiser detecta su violación (9 tests) |
| `contract/auth/{claim-store,identity-provider,live-bio-reader}.contract.ts` | Suites reutilizables `describe<Port>Contract(factory)` de los puertos out de auth |
| `contract/auth/auth.mock.test.ts` | Corre las suites contra los adaptadores mock y añade 2 casos de ADR-002 propios del mock |
| `contract/profiles/{profile-repository,service-repository,readers,removal-request-store}.contract.ts` | Suites de `ProfileReader`+`ProfileWriter`, `ServiceRepository`, `SnapshotReader`, `ClassificationReader`, `RemovalRequestStore` |
| `contract/profiles/profiles.mock.test.ts` | Corre las suites contra el mock |
| `integration/auth.http.test.ts` | `/me`, `POST /claims`, `POST /claims/:id/verify` (verified, code_not_found, expired y su límite, not_eligible, already_owned, 404 ajeno, 429, límite por usuario, liberación pasada la hora) |
| `integration/auth.concurrency.test.ts` | Ráfaga concurrente contra el límite de intentos (M-1) |
| `integration/profiles.http.test.ts` | `GET`, `PATCH declared`, `PUT services`, `POST removal-requests`: 401/403/404/400, esquema de respuesta sin campos de más, no asignación masiva, no revela existencia |
| `integration/app.http.test.ts` | health, 401 transversal en cada endpoint protegido, 404, JSON inválido, CORS, validación de `config/env`, A-2 y M-4 |
| `support/app.ts` | `buildTestApp()` (cableado como `main.ts` sin `listen`, reloj controlable, captura de eventos), `expectMatchesContract`, `expectError` |

**Cómo se usan en F2/F3:** el adaptador real de cada puerto se enchufa en `*.mock.test.ts` (o en un `*.supabase.test.ts` gemelo) pasando su `factory` a la misma función `describe<Port>Contract`. Las suites de `profiles` asumen un almacén sembrado con `contracts/fixtures` (el mismo seed de la BD local); las de `auth` parten de un almacén vacío.

**Convención `it.fails`:** los 7 `it.fails` describen el comportamiento correcto de un hallazgo abierto. Pasan en verde mientras el bug exista y **fallan cuando se corrige** (vitest avisa "Expect test to fail"): en ese momento el dev quita el `.fails`. Son: A-2, M-1, M-2, M-3 (x2), M-4 (x2).

## Lista de bugs para el dev (por prioridad)

| Prioridad | ID | Dónde | Qué hacer |
|---|---|---|---|
| 1 | A-1 | `request-removal.ts:16-18` | Exclusión solo tras confirmar titularidad (correo con token o sesión del dueño) |
| 2 | A-2 | `config/env.ts` | Rechazar `mock` con `NODE_ENV=production`; enviar siempre la respuesta parseada en `register-endpoint.ts:94-104` |
| 3 | M-1 | `confirm-profile-claim.ts:30-34`, `claim-store.ts` | Contador de intentos atómico (`tryRecordAttempt`) |
| 4 | M-3 | `profiles.routes.ts:20-21, 29-30` | Normalizar `:handle` con `IgHandle` |
| 5 | M-4 | `app.ts:20-27` | Mapear `err.status` 4xx del cliente (413, URIError) a 4xx |
| 6 | M-5 | `app.ts` | `express-rate-limit` global y estricto en `removal-requests` y `claims` |
| 7 | M-2 | `claim-profile.ts:15-17`, `confirm-profile-claim.ts:46` | Distinguir "ya tiene dueño" de "rol distinto / removido" |
| 8 | B-2 | `main.ts` | Extraer `composeApp(env)` para que los tests monten el mismo cableado |
| 9 | B-1, B-3, B-4, B-5 | ver arriba | Opcionales |

## Pendiente para la siguiente revisión

- Re-ejecutar esta suite cuando entren los adaptadores reales (F2/F3) y añadir los tests de RLS de `profiles`, `profile_claims`, `creator_services` y `profile_removal_requests` en `db/tests/`.
- Revisar `ingestion`, `classification`, `matching`, `quotes`, `notifications` y `chat` cuando sus agentes terminen.
- Un `vitest` ejecutado mientras otros agentes escribían a la vez falló una vez por un test en curso de otro slice; en limpio pasa. Si reaparece en CI, es de ese slice y no de esta suite.

---

## Re-verificación F1-A2 (tras las correcciones de dev-backend)

**Resultado: APROBADO** para el alcance auth/profiles/núcleo. Quedan dos observaciones menores y un bloqueo ajeno a esta tarea en `lint:deps`/`tsc` (ver "Estado del CI").

### Estado de cada hallazgo

| ID | Estado | Cómo se verificó |
|---|---|---|
| A-1 | **Corregido** | `requestRemoval` recibe `viewerUserId`: solo el dueño verificado autenticado retira la ficha; anónimo, autenticado ajeno o dueño de otro perfil dejan un pedido `pending` y la ficha sigue visible. Respuesta idéntica `{ok:true}` en los tres casos y con handle inexistente. Tests `A-1` x3 en `profiles.http.test.ts`. El test de caracterización `[A-1 RIESGO]` se reescribió con la regla nueva |
| A-2 | **Corregido** | `loadEnv({NODE_ENV:'production'})` rechaza cualquier `ADAPTER_*=mock`; con todos reales y credenciales es válido. Tests en `app.http.test.ts`. `register-endpoint.ts` ya valida siempre la respuesta y en producción envía lo parseado (revisado en el código; sin test, requiere `NODE_ENV=production` en la app) |
| M-1 | **Corregido** | `ClaimStore.tryRecordAttempt` atómico, usado antes de la lectura en vivo. Ráfaga de 20 concurrentes: exactamente 5 pasan, a nivel de caso de uso, de puerto (suite de contrato nueva) y de HTTP |
| M-2 | **Corregido** | Ficha libre con otro rol: `verified` con el rol del usuario y `declared: null`. Ficha retirada: `not_eligible/removed` (el esquema `VerifyClaimResult` ya lo incluye). Tests en `auth.http.test.ts` y `profiles.http.test.ts` |
| M-3 | **Corregido** | `:handle` parseado con `IgHandle`: mayúsculas y `%40` funcionan en GET y removal; formato inválido da 400 |
| M-4 | **Corregido** | Cuerpo >100 kB y percent-encoding inválido ya no dan 500 (4xx `VALIDATION_ERROR`) |
| M-5 | **Corregido** | 429 `RATE_LIMITED` con `ErrorBody`: 31.er `POST /claims` o `verify` en un minuto desde una IP, y 21.er `removal-requests` en una hora. Nota: el límite es por IP; tras un proxy hace falta `trust proxy` (el dev lo dejó anotado como `shortcut`) |
| B-1 | **Atendido** | Ver `lint:deps`: ya no hay aviso `domain-sin-node-core` en auth (el hash salió del dominio a `application/code-hash`) |
| B-4 | **Corregido** | `X-Powered-By` ausente (test `B-4`). `helmet` no se añadió: no es necesario en una API JSON |
| B-5 | **Corregido** | Mock acepta `bearer` en minúsculas; añadido como caso de la suite de contrato de `IdentityProvider` para que el adaptador real también lo cumpla |
| B-2 | **Corregido** | `tests/support/app.ts` usa `composeApp(env)` (mismo cableado que `main.ts`) y espera el backfill de clasificación |
| B-3 | Sin cambios | `startClaim` sigue sin avisar si el handle ya tiene dueño. Opcional |

### Observaciones nuevas (no bloquean)

- **N-1 · `composeApp` no expone el bus.** Los tests HTTP ya no pueden comprobar que se publican `ProfileVerified` y `ProfileDeclaredDataChanged`; quedan cubiertos solo por los unitarios del dev (`claim-flow.test.ts`, `update-declared.test.ts`). Propuesta: devolver `bus` en `composeApp`.
- **N-2 · `composeApp` no recibe reloj.** Los tests congelan solo `Date` (`vi.useFakeTimers({ toFake: ['Date'] })`) para probar expiración (30 min) y ventana de 1 h. Funciona, pero un `now?` opcional en `composeApp` sería más limpio.
- **N-3 · `ClaimStore` conserva `recordAttempt` y `countAttemptsSince`** además de `tryRecordAttempt`. Con el nuevo flujo ya no los usa el caso de uso; dejarlos en el puerto obliga al adaptador real a implementarlos. Si no hay otro consumidor, eliminarlos (y sus tests de contrato).

### Estado del CI (a las 02:54)

| Comando | Resultado |
|---|---|
| `cd backend && npx vitest run` | **28 archivos, 338 tests, todos pasan** (ya no queda ningún `it.fails`) |
| `eslint` y `prettier --check` sobre `backend/tests` | limpios |
| `npm run lint:deps -w backend` | **1 error, ajeno a esta tarea**: `src/modules/auth/infrastructure/out/supabase/mappers.ts:2` importa `../../../../domain/claim`, que no resuelve (el camino correcto sube un nivel menos: `../../../domain/claim`). Archivo nuevo de otro agente (adaptador Supabase de F2, creado a las 02:53). Lo detecta la regla `sin-imports-irresolubles` |
| `npx tsc -p backend/tsconfig.json` | El mismo archivo: TS2307 en `mappers.ts(2,34)`. Sin otros errores |

Con ese import corregido, `lint:deps` y `tsc` deberían quedar en verde (con el único problema abierto de que el adaptador Supabase aún no tiene su suite de contrato enchufada: cuando exista, añadirlo en `tests/contract/auth/` junto a `auth.mock.test.ts`).

### Tests modificados o añadidos en esta ronda

- `tests/support/app.ts`: `buildTestApp()` ahora es `async` y usa `composeApp(env)`; `TestApp` exportado; reloj de `Date` controlable.
- `tests/integration/auth.http.test.ts`: la sección de hallazgos se reemplazó por "re-verificación" (M-2 rol distinto, M-2 retirada, M-5 por IP en claims y verify, M-1 429 a nivel HTTP con ráfaga).
- `tests/integration/profiles.http.test.ts`: `M-3` en GET y removal, regla nueva de A-1 (3 casos), retiro por el dueño con reclamo posterior bloqueado, límite de 20 pedidos/hora.
- `tests/integration/app.http.test.ts`: `M-4` x2, `A-2` x2, `B-4`; sin `it.fails`.
- `tests/integration/auth.concurrency.test.ts`: M-1 sin `.fails`.
- `tests/contract/auth/claim-store.contract.ts`: 4 casos de `tryRecordAttempt` (límite, ráfaga concurrente, por usuario, ventana).
- `tests/contract/auth/identity-provider.contract.ts`: esquema `bearer` en minúsculas.
- `tests/contract/profiles/removal-request-store.contract.ts`: conserva `status` (`pending` / `applied`).
