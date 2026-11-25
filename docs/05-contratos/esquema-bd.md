---
responsable: leader
estado: borrador
ultima_actualizacion: 2026-11-25
---

# Esquema de BD (propuesta para F1)

- **Fuente de verdad:** `db/supabase/migrations/*.sql` (Supabase CLI).
- **Nombres de migración:** `<timestamp>_<slice>_<descripcion>.sql`. Todas las escribe `dev-backend` (Mariana); el resto de slices pide los cambios ([09-equipo](../09-equipo/responsables.md)).
- **RLS:** activado en todas las tablas. Las tablas sin políticas para `anon` ni `authenticated` solo son accesibles desde el backend con el rol de servicio.

| Tabla | Slice dueño | Columnas clave | Lectura directa desde el frontend (RLS) |
|---|---|---|---|
| `profiles` | profiles | id, ig_handle (único), role (`creator`\|`brand`), owner_user_id (nullable), declared (jsonb validado con `Declared`; en marcas incluye presupuesto, nichos objetivo y objetivos), status (`unclaimed`\|`verified`\|`removed`) | no |
| `creator_services` | profiles | profile_id, type, format, price_pen, description | no |
| `profile_removal_requests` | profiles | ig_handle, email, reason, created_at | no |
| `profile_claims` | auth | user_id, ig_handle, code_hash, expires_at, attempts | no |
| `ig_snapshots` | ingestion | ig_handle, fetched_at, payload (jsonb `IgProfileSnapshot`), source | no |
| `ingestion_blocklist` | ingestion | ig_handle, reason, created_at | no |
| `profile_classifications` | classification | profile_id, niches (jsonb con confianza y fuente), tier, engagement_rate, version | no |
| `profile_embeddings` | classification | profile_id, embedding `vector(384)`, model | no |
| `interactions` | matching | actor_profile_id, target_profile_id, kind (`interest`\|`dismiss`), created_at, updated_at · **unique(actor_profile_id, target_profile_id)**: la última decisión del actor reemplaza a la anterior (upsert) | no |
| `matches` | matching | creator_profile_id, brand_profile_id, created_at | no |
| `quotes` / `quote_events` | quotes | service_id, requester_profile_id, status, amount_pen / transición, actor, at | no |
| `notifications` | notifications | user_id, kind, payload, read_at | **sí**: `user_id = auth.uid()` |
| `messages` | chat | match_id, sender_profile_id, body, created_at | **sí**: solo si el usuario es dueño de uno de los perfiles del match |

Extensiones: `vector` (pgvector), con un índice HNSW sobre `profile_embeddings.embedding` (coseno).

## Funciones RPC (contrato entre `db` y los adaptadores reales)

| Función | Firma | Uso |
|---|---|---|
| `match_candidates` | `(p_embedding extensions.vector(384), p_role text, p_exclude uuid[], p_limit int) returns table(profile_id uuid, similarity double precision)` | `matching` → `CandidateSearch` real. `similarity = 1 - (embedding <=> p_embedding)`, solo perfiles con `role = p_role`, `status <> 'removed'` y `id <> all(p_exclude)`, ordenado por distancia, `limit p_limit`. `security invoker`; la llama el backend con service_role |
| `record_claim_attempt` | `(p_user_id uuid, p_window_minutes int, p_max int) returns boolean` | `auth` → `ClaimStore.tryRecordAttempt` real, atómico: inserta el intento solo si hay cupo en la ventana y devuelve si quedó dentro del límite |
| `replace_creator_services` | `(p_profile_id uuid, p_services jsonb) returns jsonb` | `profiles` → `ServiceRepository.replace`, atómico. `p_services` = array de `{type, format, pricePen, description}`. Conserva el id de las filas idénticas, reutiliza las sobrantes por orden, inserta las que falten y borra el resto; devuelve el catálogo final `[{id, type, format, pricePen, description}]` en orden. Si una fila a borrar tiene cotizaciones falla con SQLSTATE `23503` y no cambia nada |
| `claim_profile` | `(p_handle text, p_user_id uuid, p_role text) returns jsonb` | `profiles` → `claimProfile`, condicional y atómico. Inserta la ficha o actualiza solo si `owner_user_id is null or = p_user_id` y `status <> 'removed'` (si cambia el rol, `declared` se pone a null). Devuelve `{status: 'claimed'\|'owned'\|'removed', profile_id?}` |
| `transition_quote` | `(p_quote_id uuid, p_expected_status text, p_to text, p_actor uuid, p_amount int, p_note text, p_at timestamptz default now()) returns void` | `quotes` → `QuoteRepository.save` (transiciones), concurrencia optimista: actualiza estado e importe y añade el evento (con `at = p_at`) solo si el estado actual es `p_expected_status`; si no, SQLSTATE `SP409` (conflicto) |

Todas son `security invoker`, `search_path=''` y con `execute` solo para `service_role`.

## Storage

| Bucket | Acceso | Límites | Uso |
|---|---|---|---|
| `profile-images` | **público de lectura** por URL (`<SUPABASE_URL>/storage/v1/object/public/profile-images/<ruta>`); sin políticas de escritura para `anon`/`authenticated`: solo el backend sube y borra con `service_role` | 2 MB por objeto; `image/jpeg`, `image/png`, `image/webp` | Foto de perfil de las fichas (`ProfileCard.profilePicUrl`, tipo `ImageUrl`): la ingesta real copia la foto de Instagram aquí (ruta sugerida `<handle>.webp`) y se borra al retirar la ficha |
