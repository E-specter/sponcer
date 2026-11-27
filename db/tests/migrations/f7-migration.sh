#!/usr/bin/env bash
# Reproduce la migración F7 (20261127000100) sobre datos con el esquema ANTERIOR, en una BD temporal `mig_audit`
# dentro del contenedor de Supabase local (no toca la BD de trabajo). Uso: bash db/tests/migrations/f7-migration.sh
# Caso 1: cada marca con a lo sumo una cotización abierta por creador  -> la migración debe pasar y crear "General".
# Caso 2: una marca con DOS cotizaciones abiertas al mismo creador (servicios distintos; el esquema anterior lo permitía)
#         -> hoy FALLA al crear quotes_open_per_creator_campaign_idx (hallazgo F7-A1). Al corregirlo, el caso 2 debe pasar.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
# docker cp (binario de Windows) no entiende rutas /c/...: se convierten con cygpath cuando existe.
win() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else echo "$1"; fi; }
MIGRATION="$HERE/../../supabase/migrations/20261127000100_f7_accounts_campaigns_visibility.sql"
C="${DB_CONTAINER:-supabase_db_sponcer}"
export MSYS_NO_PATHCONV=1
psql_db() { docker exec "$C" psql -U postgres -d mig_audit -v ON_ERROR_STOP=1 -q "$@"; }
reset() {
  docker exec "$C" psql -U postgres -q -c "drop database if exists mig_audit" -c "create database mig_audit" >/dev/null 2>&1
  docker exec "$C" sh -c "pg_dump -U postgres -d postgres --schema-only --no-owner --no-privileges | psql -U postgres -d mig_audit -q" >/dev/null 2>&1
  # Deshace F7 sobre la copia del esquema y siembra datos anteriores a F7.
  docker cp "$(win "$HERE/f7-legacy-data.sql")" "$C:/tmp/f7-legacy-data.sql"
  psql_db -f /tmp/f7-legacy-data.sql >/dev/null
}
run_migration() {
  docker cp "$(win "$MIGRATION")" "$C:/tmp/f7.sql"
  psql_db -1 -f /tmp/f7.sql 2>&1 | tail -3
}
echo "== Caso 1: sin duplicados abiertos"; reset; run_migration
psql_db -t -c "select count(*) || ' campañas General con ' || (select count(*) from quotes where campaign_id is not null) || ' cotizaciones' from campaigns where name='General'"
echo "== Caso 2: dos cotizaciones abiertas de una marca al mismo creador"; reset
psql_db -c "insert into quotes (service_id, creator_profile_id, requester_profile_id, status, message) values ('00000000-0000-4000-8000-0000000000a2','00000000-0000-4000-8000-0000000000c1','00000000-0000-4000-8000-0000000000b1','negotiating','b1-c1 b')"
run_migration
docker exec "$C" psql -U postgres -q -c "drop database if exists mig_audit" >/dev/null 2>&1
