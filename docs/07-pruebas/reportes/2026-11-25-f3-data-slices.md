---
responsable: agente audit
estado: aprobado
ultima_actualizacion: 2026-11-25
---

# Auditoría F3-A: adaptadores reales de ingestion, classification y matching

**RF/RNF:** RF-01, RF-02, RF-09, RF-10, RNF-04, RNF-05 · **ADR:** ADR-001, ADR-002, ADR-003, ADR-005 · **Responsable humana:** Mariana
**Auditor:** agente audit (independiente de dev-data, dev-backend)

## Resultado inicial: **OBSERVACIONES** (ver "Re-verificación F3-A2" al final: **APROBADO**)

- Los adaptadores Supabase de `InteractionRepository`, `MatchRepository`, `SnapshotRepository`, `IngestionBlocklist`, `ClassificationRepository` y `CandidateSearch` **pasan las mismas suites de contrato que los mocks** (Liskov). Solo un caso falla en el mock (F3-L-1).
- **Seguridad del proveedor: sin SSRF ni fuga del token.** `fetchLiveBio` usa una URL de host fijo; el handle va con `encodeURIComponent` y, además, el caso de uso lo normaliza con `IgHandle` antes de llamar. Probado con 8 handles hostiles.
- **El acceso a datos es correcto:** `interactions_actor_target_key` y el upsert funcionan (incluidas ráfagas), `createIfAbsent` crea un solo match por par bajo concurrencia y `match_candidates` excluye retirados.
- Hay **1 hallazgo medio-alto de privacidad (F3-A-1)** y **1 medio de privacidad (F3-A-2)** que incumplen RNF-05/RF-01, **4 medios** (integridad de la verificación, atomicidad, fallo abierto, timeout) y **5 bajos**. Ninguno bloquea la demo local, pero **F3-A-1 y F3-A-2 deben corregirse antes de ingerir cuentas reales con Apify**.

## Archivos revisados

`backend/src/modules/ingestion/infrastructure/out/{apify,supabase,mock}/`, `.../application/use-cases/` (ingestion), `backend/src/modules/classification/infrastructure/out/{supabase,transformers,profiles,mock}/`, `backend/src/modules/matching/infrastructure/out/{supabase,mock}/`, `.../application/use-cases/{interact,list-matches,get-feed}.ts`, `matching.real.integration.test.ts` y `compose.real.test.ts` (solo para el aislamiento), migraciones `20261125001200` y `20261125001400`.

## Verificación

| Comando | Resultado |
|---|---|
| `cd db && npx vitest run` | **148 tests pasan** (incluye las 3 RPC nuevas) |
| `cd backend && node --env-file=.env ../node_modules/vitest/vitest.mjs run --config tests/vitest.isolation.config.ts` | 40 archivos pasan, **1 falla ajeno a esta tarea** (ver "Aislamiento": filas huérfanas `it_*` del test de matching del dev). 528 tests pasan y 9 son `it.fails` |
| El mismo comando con la config por defecto (en paralelo) | además falla un caso de mis suites reales: el backfill del test del dev toca las filas de las demás (ver "Aislamiento") |
| `npx tsc -p backend/tsconfig.json` y `npx tsc -p db/tsconfig.json` | sin errores |
| `npm run lint:deps -w backend` | **0 violaciones** (165 módulos, 622 dependencias) |
| `eslint` y `prettier --check` sobre `backend/tests` y `db/tests` | limpios |

## Aislamiento de los tests reales (punto 2)

**Causa.** Todos los tests con Supabase comparten una sola BD y varios hacen **barridos globales**: el backfill de `compose.real.test.ts` clasifica **todos** los perfiles y exige `failed === 0`. Con la config por defecto, vitest corre los archivos en paralelo: los perfiles temporales de otros archivos (los míos, `zz.*`, y los del dev, `it_*`, `flow.*`) aparecen o desaparecen mientras el backfill los recorre, y fallan o agotan el tiempo.

**Lo que apliqué en mis tests** (sin tocar la config):
- Datos con prefijo único (`zz.<tag>`, `@audit.test`) y rastreados; cada test crea los suyos.
- El barrido de restos solo borra lo de más de 10 minutos, para que dos archivos en paralelo no se borren entre sí.
- Limpieza por handle de las tablas sin FK a `profiles` (`ig_snapshots`, `ingestion_blocklist`, `profile_removal_requests`).
- Tras todas las corridas no queda ningún resto mío (comprobado).

**Lo que hay que pedir a dev-backend (la config de vitest es suya).** Crear `backend/vitest.config.ts` con dos proyectos: los tests normales en paralelo y los de BD secuenciales con más tiempo. El archivo ya está escrito y probado en `backend/tests/vitest.isolation.config.ts`; basta copiarlo:

```ts
import { defineConfig } from 'vitest/config';

const REAL = ['src/**/*.real*.test.ts', 'tests/**/*.supabase.test.ts'];

export default defineConfig({
  test: {
    projects: [
      { extends: true, test: { name: 'unit', include: ['src/**/*.test.ts', 'tests/**/*.test.ts'], exclude: REAL } },
      {
        extends: true,
        test: { name: 'real-db', include: REAL, fileParallelism: false, testTimeout: 30_000, hookTimeout: 60_000 },
      },
    ],
  },
});
```

Con esa config la suite completa tarda ~16 s (sin ella, secuencial con `--no-file-parallelism`, ~27 s). Los tests de BD siguen saltándose solos sin `SUPABASE_URL`. La carpeta `db/` no necesita cambios (un solo archivo).

**Dos cosas más, en los tests del dev (no los toqué):**
1. **Filas huérfanas.** Quedan en la BD dos perfiles `it_creator_8598671e.demo` y `it_brand_8598671e.demo` de una corrida fallida de `matching.real.integration.test.ts`. Son lo que hace fallar `compose.real.test.ts` ("backfill", `failed` = 2) **incluso en secuencial y solo**. Hay que borrarlos una vez (`delete from public.profiles where ig_handle like 'it\_%'`; el clasificador de permisos me impidió hacerlo) y hacer que ese test limpie `it_%` también al empezar (`beforeAll`), no solo al terminar.
2. **Aserción frágil.** `expect(result.failed).toBe(0)` falla con cualquier perfil real sin snapshot (p. ej. uno recién reclamado antes de ingerirse). Conviene acotarla a los perfiles del seed (por id) en lugar de al total de la tabla.

## Hallazgos

### Medio-alto

**F3-A-1 · La exclusión (Ley 29733) no bloquea el handle ni borra los datos ingeridos** (`ingestion/infrastructure/out/supabase/supabase-repositories.ts:35-47`, `profiles/application/use-cases/request-removal.ts`)
RNF-05 y RF-01: "el handle excluido queda en una lista de bloqueo para la ingesta" y el titular pide "exclusión y borrado". Hoy `IngestionBlocklist` **solo se lee**: ningún slice escribe `ingestion_blocklist`, y retirar la ficha solo pone `profiles.status = 'removed'`. *Escenario reproducido contra la BD:* el dueño pide la exclusión por la API (200, perfil `removed`), pero `ingestion_blocklist` sigue vacía y su fila de `ig_snapshots` (bio, métricas, captions e hashtags de sus posts) sigue allí, junto con su clasificación y su embedding. Una ingesta futura del mismo handle (p. ej. al volver a reclamarse o por una ruta de ingesta bajo demanda) la volvería a guardar. Test `F3-A-1` (`it.fails`).
*Sugerencia:* un evento `ProfileRemoved` (o llamada de puerto) al aplicar una exclusión: ingestion inserta en la lista de bloqueo y borra sus snapshots; classification borra clasificación y embedding.

### Medio

**F3-A-2 · Se ingieren cuentas públicas que no son profesionales** (`ingestion/application/use-cases/ingest-profile.ts:31`)
RF-01: "Solo se ingieren cuentas profesionales y públicas". El caso de uso solo rechaza las privadas; una cuenta personal pública se guarda completa. *Escenario:* `ingestProfile('valeria.fitness.demo')` (fixture con `isBusiness: false`) devuelve `ok` y guarda el snapshot, incumpliendo la minimización de RNF-05. Test `F3-A-2` (`it.fails`). *Sugerencia:* `if (!fetched.value.isBusiness) return err(FORBIDDEN)` junto a la comprobación de privacidad, y no guardar.

**F3-M-2 · La lectura en vivo acepta la respuesta de otra cuenta** (`ingestion/.../apify/apify-source.ts:42-47`, `apify-mapper.ts` usa `a.username`)
ADR-002 prueba el control de la cuenta comprobando el código en la bio de **la cuenta pedida**. `fetchLiveBio('victima.real')` acepta cualquier objeto del proveedor (p. ej. una cuenta renombrada o una coincidencia aproximada) y `confirm-profile-claim` comprueba el código en la bio de **esa otra** cuenta. *Escenario reproducido (fetch simulado):* se pide `victima.real`, el proveedor responde `otra.cuenta` y el adaptador devuelve ok. Test `F3-M-2` (`it.fails`). *Sugerencia:* en `fetchLiveBio` (y `fetchProfile`), rechazar con `NOT_FOUND`/`UPSTREAM_ERROR` si `mapped.handle !== handle`.

**F3-M-4 · Falla abierto si el proveedor omite el flag `private`** (`apify-mapper.ts:83`, `isPrivate: a.private === true`)
Si el actor cambia su esquema y deja de enviar `private`, una cuenta privada pasa por pública y se ingiere o verifica. *Reproducido* (fetch simulado). Test `F3-M-4` (`it.fails`). *Sugerencia:* `isPrivate: a.private !== false` (falla cerrado) y exigir `private` en el esquema del adaptador.

**F3-M-3 · Sin timeout en la lectura en vivo** (`apify-source.ts:34`, `fetch` sin `AbortSignal`; `client.actor().call()` espera a que termine el run)
Un proveedor colgado deja la petición de verificación (RF-02) abierta sin límite (se agotan conexiones). Test `F3-M-3` (`it.fails`). *Sugerencia:* `AbortSignal.timeout(15_000)` en `fetch` y `waitSecs` en `call`.

**F3-M-1 · `ClassificationRepository.save` no es atómico** (`classification/.../supabase-classification-repository.ts:20-29`)
Dos upserts en paralelo sin transacción. *Reproducido:* un embedding con la dimensión equivocada (cambio de modelo) lanza, pero la clasificación **ya quedó guardada** sin embedding: el perfil aparece clasificado pero no entra al feed vectorial. Test `F3-M-1` (`it.fails`). *Sugerencia:* una RPC `save_classification(profile_id, classification, embedding)` o validar la dimensión antes de escribir.

### Bajo

- **F3-B-1 · `listByProfile` de matches interpola el id en `.or()`** (`matching/.../supabase-repositories.ts:79`): es el mismo patrón que se corrigió en quotes. *Reproducido:* `listByProfile("<uuid>,created_at.gt.1970-01-01")` devuelve **todos** los matches. No es explotable por HTTP (el caso de uso exige que el perfil sea del usuario) pero el adaptador no se defiende. Usar dos `.eq` o validar uuid. Test `F3-B-1` (`it.fails`).
- **F3-L-1 · El mock de `SnapshotRepository.latestByHandle` devuelve el último guardado**, no el de `fetchedAt` mayor como el real (`ingestion/.../mock/mock-adapters.ts:89-95`). Un caso de la suite es `it.fails` con `orderByFetchedAt: false`; al corregir el mock poner `true`.
- **F3-L-2 · El feed real oculta los perfiles sin embedding; el mock los incluye.** `match_candidates` hace `join` con `profile_embeddings`, así que un perfil recién verificado no aparece hasta clasificarse. Probablemente aceptable, pero es una diferencia de comportamiento entre mock y real que conviene documentar (la suite de `CandidateSearch` no la fija).
- **F3-L-3 · Detalles internos en errores hacia el cliente:** `apify-source.ts` envía `String(e)` como `details` de `UPSTREAM_ERROR`; el mapper envía los `issues` de zod; `supabase-repositories.ts:105` de matching envía `error.message` de la BD. `sendError` los incluye en la respuesta. Test `F3-L-3` (`it.fails`). Los detalles deberían ir solo al log.
- **F3-L-4 · Retención:** cada ingesta inserta una fila nueva en `ig_snapshots` (sin purga del historial) y el modelo `Xenova/multilingual-e5-small` se descarga en tiempo de ejecución sin fijar revisión (cadena de suministro y reproducibilidad, RNF-06). Fijar la revisión del modelo y conservar solo los últimos snapshots por handle.

### Conformidad (sin hallazgo)

- **APIFY_TOKEN:** solo se lee en `config/env.ts`, se pasa a `createApifySource` y viaja en la cabecera `Authorization` a un host fijo (`apify--instagram-profile-scraper.apify.actor`); nunca en la URL (probado). No está en el frontend ni en los logs revisados.
- **SSRF / inyección en la URL:** 8 handles hostiles (`x&username=admin`, `../../etc/passwd`, `https://evil.example/x`, `a#fragmento`, `%2e%2e%2f`, espacios...) no cambian host, protocolo, ruta ni parámetros; y `ingestProfile`/`fetchLiveBio` los rechazan con `VALIDATION_ERROR` antes de llegar al proveedor (`@evil.example` se normaliza a un handle válido sin la arroba).
- **ACL de matching:** `interact`, `list-matches` y `get-feed` exigen que el perfil actor sea del usuario; no se puede interactuar con uno mismo, con el mismo rol ni con perfiles retirados (sin tarjeta). Las suites de contrato prueban el aislamiento por actor y por perfil en cada adaptador.
- **`interactions`:** una por par (`interactions_actor_target_key`, probado 23505), `kind='quote'` ya no existe (check 23514) y el upsert reemplaza sin duplicar, también con 10 escrituras concurrentes.
- **`matches`:** `createIfAbsent` es atómico: una ráfaga de 10 del mismo par crea exactamente uno y devuelve el mismo id a todos; el unique impide un segundo aunque se inserte a mano.
- **`CandidateSearch` real:** devuelve el viewer y candidatos del rol opuesto sin él mismo, excluye retirados (probado con un perfil `removed` con embedding), rankea por similitud (el embedding idéntico puntúa más que el ortogonal) y degrada sin romper si el viewer no tiene embedding.
- **RLS:** las tablas de estos slices (`ig_snapshots`, `ingestion_blocklist`, `profile_classifications`, `profile_embeddings`, `interactions`, `matches`) ya están cubiertas en denegado por `db/tests/rls.test.ts`.

## Tests añadidos

| Archivo | Contenido |
|---|---|
| `backend/tests/contract/matching/matching-repositories.contract.ts` | `InteractionRepository` (reemplazo por par, dirección, ACL por actor, ráfaga) y `MatchRepository` (atomicidad, existente, ACL) |
| `backend/tests/contract/matching/candidate-search.contract.ts` | `CandidateSearch`: rol opuesto, sin viewer, rankeable, ranking correcto, viewer sin clasificar, retirados |
| `backend/tests/contract/ingestion/ingestion-repositories.contract.ts` | `SnapshotRepository` (orden por `fetchedAt`, historial, aislamiento) e `IngestionBlocklist` |
| `backend/tests/contract/classification/classification-repository.contract.ts` | `ClassificationRepository` (roundtrip con float4, upsert, `getEmbeddings`, ACL) |
| `backend/tests/contract/data-slices.mock.test.ts` | Corre las suites contra los mocks |
| `backend/tests/contract/real/data-slices.supabase.test.ts` | Las mismas suites contra los adaptadores Supabase |
| `backend/tests/contract/real/data-slices.review.supabase.test.ts` | ApifySource con `fetch` simulado (hostiles, token, errores), reglas de privacidad, unique de `interactions` y `matches`, y los `it.fails` F3-A-1, A-2, M-1..M-4, B-1, L-3 |
| `backend/tests/vitest.isolation.config.ts` | Propuesta de config con dos proyectos (unit en paralelo, BD secuencial) |
| `db/tests/rls.test.ts` | +2 casos: las 3 RPC transaccionales no son ejecutables por `anon`/`authenticated` y no cambian nada |
| `backend/tests/contract/real/real-adapters.review.supabase.test.ts`, `profiles.mock.test.ts`, `integration/profiles.http.test.ts` | Quitados los `.fails` de F2; `stableIds: true`; regla nueva de ids estables en HTTP |

**Convención `it.fails`:** los 9 `it.fails` describen el comportamiento correcto de un hallazgo abierto; fallan cuando se corrige (entonces, quitar `.fails`). Son: F3-L-1 (mock), F3-A-1, F3-A-2, F3-M-1, F3-M-2, F3-M-3, F3-M-4, F3-B-1 y F3-L-3.

## Lista de bugs para el dev (por prioridad)

| # | ID | Dónde | Qué hacer |
|---|---|---|---|
| 1 | F3-A-1 | `request-removal.ts`, ingestion/classification | Evento `ProfileRemoved`: bloquear el handle y borrar snapshot, clasificación y embedding |
| 2 | F3-A-2 | `ingest-profile.ts:31` | Rechazar y no guardar cuentas no profesionales |
| 3 | F3-M-2 | `apify-source.ts`, `apify-mapper.ts` | Exigir que el handle devuelto sea el pedido |
| 4 | F3-M-4 | `apify-mapper.ts:83` | Fallar cerrado si falta el flag `private` |
| 5 | F3-M-3 | `apify-source.ts:34` | Timeout con `AbortSignal` y `waitSecs` |
| 6 | F3-M-1 | `supabase-classification-repository.ts:20-29` | RPC atómica `save_classification` o validar dimensión |
| 7 | F3-B-1 | `matching/.../supabase-repositories.ts:79` | Dos `.eq` o validar uuid |
| 8 | F3-L-1, L-3, L-4 | ver arriba | Opcionales |
| — | Infra de tests | `backend/vitest.config.ts` y filas `it_*` | Copiar `tests/vitest.isolation.config.ts`; borrar las filas huérfanas; limpiar `it_%` al empezar y acotar el `failed` del backfill |

## Pendiente

- Probar el flujo completo con Apify real (con presupuesto de llamadas acotado, a mano) cuando se corrijan F3-M-2 y F3-M-4.
- Test end-to-end de Realtime y revisión de la descarga del modelo de embeddings en un entorno sin red.

---

## Re-verificación F3-A2 (tras las correcciones de dev-data y dev-backend)

### Resultado final: **APROBADO**

Los 6 hallazgos de seguridad/privacidad y los 2 de integridad quedan corregidos y con test de regresión. Los 9 `it.fails` pasaron a rojo al corregirse y se retiraron: **no queda ningún `it.fails`**. Quedan 2 observaciones menores (abajo) que no bloquean.

### Verificación (todo en verde)

| Comando | Resultado |
|---|---|
| `cd backend && node --env-file=.env ../node_modules/vitest/vitest.mjs run` (con `backend/vitest.config.ts`) | **42 archivos, 552 tests pasan**, 2 saltados; dos corridas seguidas sin fallos |
| `cd backend && npx vitest run` (sin `.env`: los tests de BD se saltan solos) | 40 archivos pasan y 2 saltados; 542 tests pasan |
| `cd db && npx vitest run` | **148 tests pasan** |
| `npx tsc -p backend/tsconfig.json` y `npx tsc -p db/tsconfig.json` | sin errores |
| `npm run lint:deps -w backend` | **0 violaciones** (166 módulos, 630 dependencias) |
| `eslint` y `prettier --check` sobre `backend/tests` y `db/tests` | limpios |

**Aislamiento:** `backend/vitest.config.ts` (proyectos `unit` en paralelo y `real-db` secuencial, con timeouts mayores) es el que propuse y funciona: ya no hay interferencia entre archivos. Los perfiles huérfanos `it_creator_8598671e.demo` y `it_brand_8598671e.demo` **ya no existen** (comprobado en la BD) y el backfill de `compose.real.test.ts` pasa. Tras las corridas no queda ningún dato mío (`zz.*`, usuarios `@audit.test`, snapshots ni bloqueos de prueba).

### F3-A-1 de punta a punta (`backend/tests/contract/real/profile-removal.e2e.supabase.test.ts`)

Con Supabase local y los adaptadores **reales** de profiles, ingestion y classification (el proveedor de embeddings es el mock, para no descargar el modelo; y con un token de Apify falso: si la re-ingesta no estuviera bloqueada intentaría llamar al proveedor y fallaría con `UPSTREAM_ERROR` en vez de `FORBIDDEN`):

| Caso | Resultado |
|---|---|
| El **dueño verificado** pide la exclusión por la API (200) | el perfil queda `removed`; `ingestion_blocklist` contiene el handle; **`ig_snapshots` (2 versiones), `profile_classifications` y `profile_embeddings` del perfil quedan en 0 filas** (vía el evento `ProfileRemoved`) |
| **Re-ingesta** del mismo handle después | `FORBIDDEN` (bloqueada antes de llamar al proveedor); `getLatestSnapshot` devuelve `null`; no se guarda ningún snapshot nuevo |
| Un **anónimo** pide la exclusión de esa ficha | 200, pero el pedido queda pendiente: perfil `verified`, sin bloqueo y con todos sus datos intactos |
| **Otro usuario autenticado** (no dueño) | igual: no se borra ni se bloquea nada |
| El retiro de un perfil no toca los datos de **otro** perfil | cumple |

Además se añadieron a los contratos los métodos nuevos, que pasan en mock y real: `SnapshotRepository.deleteByHandle` (borra todo el historial del handle y solo ese), `IngestionBlocklist.add` (idempotente) y `ClassificationRepository.deleteByProfile` (borra clasificación y embedding sin tocar a otro perfil).

### Estado de cada hallazgo

| ID | Estado | Verificación |
|---|---|---|
| F3-A-1 (exclusión no bloquea ni borra) | **Corregido** | test de punta a punta de arriba |
| F3-A-2 (se ingieren cuentas no profesionales) | **Corregido** | `ingestProfile` de una cuenta pública no profesional da `FORBIDDEN` |
| F3-M-1 (`save` de classification no atómico) | **Corregido** | un embedding con dimensión errónea ya no deja la clasificación a medias |
| F3-M-2 (acepta otra cuenta) | **Corregido** | `onlyRequested`: una respuesta de `otra.cuenta` para `victima.real` da `UPSTREAM_ERROR` (fetchLiveBio y fetchProfile) |
| F3-M-3 (sin timeout) | **Corregido** | `AbortSignal.timeout(15 s)` en la lectura en vivo, `waitSecs` y `timeoutSecs` en el cliente Apify |
| F3-M-4 (falla abierto sin `private`) | **Corregido** | sin el flag, la cuenta se trata como privada |
| F3-B-1 (`.or()` en matching) | **Corregido** | un valor hostil ya no devuelve matches ajenos |
| F3-L-1 (mock de snapshots) | **Corregido** | la suite de `SnapshotRepository` pasa en mock sin excepción (`latestByHandle` por `fetchedAt`) |
| F3-L-3 (detalles al cliente) | **Corregido** | `apify-source.ts`, `apify-mapper.ts` y la búsqueda de candidatos solo registran los detalles en el log; nuevo test: una respuesta con forma inesperada no expone los `issues` |
| F3-L-4 (modelo sin revisión fija / retención) | **Parcial** | el modelo de embeddings ya usa una revisión fija (`MODEL_REVISION`). **La retención de `ig_snapshots` sigue sin purga del historial** (cada ingesta añade una fila; la caché de 24 h limita el crecimiento a una por handle y día). Aceptable para la demo |
| F3-L-2 (feed real oculta perfiles sin embedding) | Sin cambios | diferencia mock/real documentada, no es un defecto |

### Observaciones nuevas (no bloquean)

- **N-1 · `ig_snapshots` sin política de retención.** Recomendado conservar solo los últimos N snapshots por handle (minimización, RNF-05) antes de ingerir cuentas reales a escala.
- **N-2 · El borrado por `ProfileRemoved` es por eventos del bus en proceso (sin reintento).** Si el proceso cae entre el `UPDATE profiles ... removed` y los suscriptores, el handle queda `removed` pero sin bloquear ni borrar (ADR-005 ya acepta que un suscriptor que falla no se reintenta). El bloqueo se hace antes del borrado, de modo que el peor caso es que queden datos sin borrar pero la ingesta sigue bloqueada. Si se quiere garantía fuerte, hacer el retiro una RPC transaccional (profile + blocklist + borrado) en F4.

### Tests de esta ronda

- `backend/tests/contract/real/profile-removal.e2e.supabase.test.ts` (nuevo, 4 casos).
- `backend/tests/contract/ingestion/ingestion-repositories.contract.ts` y `classification/classification-repository.contract.ts`: `deleteByHandle`, `add` idempotente, `deleteByProfile`; el caso de `fetchedAt` ya no es excepción en el mock.
- `backend/tests/contract/real/data-slices.review.supabase.test.ts`: sin `.fails`, más el caso de `issues` no expuestos.
- `backend/tests/vitest.isolation.config.ts` (la propuesta) se eliminó: la config oficial `backend/vitest.config.ts` ya la incluye.
