#!/usr/bin/env bash
# Reproduce la migración F7 (20261127000100) sobre datos con el esquema ANTERIOR, en una BD temporal `mig_audit`
# dentro del contenedor de Supabase local (no toca la BD de trabajo). Uso: bash db/tests/migrations/f7-migration.sh
# Caso 1: cada marca con a lo sumo una cotización abierta por creador  -> la migración debe pasar y crear "General".
# Caso 2: una marca con DOS cotizaciones abiertas al mismo creador (servicios distintos; el esquema anterior lo permitía)
#         -> antes FALLABA (F7-A1); ahora la migración cancela las duplicadas (queda la más reciente) con un evento.
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
echo "== Caso 2: tres cotizaciones abiertas de una marca al mismo creador (la más reciente sigue abierta)"; reset
SVC2=00000000-0000-4000-8000-0000000000a2; C1=00000000-0000-4000-8000-0000000000c1; B1=00000000-0000-4000-8000-0000000000b1
psql_db -c "update quotes set created_at = now() - interval '2 days' where message = 'b1-c1 a'"
psql_db -c "insert into quotes (service_id, creator_profile_id, requester_profile_id, status, message, created_at) values ('$SVC2','$C1','$B1','negotiating','b1-c1 newest', now()), ('$SVC2','$C1','$B1','draft','b1-c1 mid', now() - interval '1 day')"
run_migration
echo "-- cotizaciones (mensaje | estado):"
psql_db -t -A -F ' | ' -c "select message, status from quotes order by message"
echo "-- eventos de cancelación (mensaje | de | a | nota):"
psql_db -t -A -F ' | ' -c "select q.message, e.from_status, e.to_status, e.note from quote_events e join quotes q on q.id = e.quote_id where e.note like 'cancelada al migrar%' order by q.message"
OPEN=$(psql_db -t -A -c "select string_agg(message, ',' order by message) from quotes where status in ('draft','sent','negotiating','accepted') and requester_profile_id = '$B1'")
CANCELLED=$(psql_db -t -A -c "select string_agg(message, ',' order by message) from quotes where status = 'cancelled'")
EVENTS=$(psql_db -t -A -c "select count(*) from quote_events where note like 'cancelada al migrar%'")
OLD=$(psql_db -t -A -c "select status from quotes where message = 'b1-c1 old'")
docker exec "$C" psql -U postgres -q -c "drop database if exists mig_audit" >/dev/null 2>&1
if [ "$OPEN" = 'b1-c1 newest' ] && [ "$CANCELLED" = 'b1-c1 a,b1-c1 mid' ] && [ "$EVENTS" = 2 ] && [ "$OLD" = rejected ]; then
  echo 'OK: queda la más reciente abierta, las demás canceladas con su evento'
else
  echo "FALLO: abiertas=$OPEN canceladas=$CANCELLED eventos=$EVENTS vieja=$OLD"; exit 1
fi
