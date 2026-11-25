---
responsable: Eduard
estado: verificado parcialmente (dump probado; restore descrito, no ejecutado sobre la BD compartida)
ultima_actualizacion: 2026-11-25
---

# Rollback

1. **Respaldar datos antes de tocar nada** (probado, ~4 s, incluye `auth` y `public`). El `-f` es relativo a `db/`:
   ```
   npx supabase db dump --data-only --workdir db -f backup-AAAAMMDD.sql
   ```
   Queda en `db/backup-AAAAMMDD.sql` (no versionar: contiene datos de usuarios).
2. Detener backend y frontend (`Ctrl+C`, o por PID si corren en segundo plano).
3. Volver al tag estable anterior: `git checkout vX.Y.Z`. Lo ejecuta una persona.
4. BD:
   - si la versión nueva no añadió migraciones, no se toca la BD;
   - si las añadió: `npm run db:reset` (**borra los datos locales**; el seed los repuebla con datos de ejemplo). Para conservar los datos, restaurar el respaldo después del reset:
     ```
     docker exec -i supabase_db_sponcer psql -U postgres -d postgres -v ON_ERROR_STOP=1 < db/backup-AAAAMMDD.sql
     ```
     (contenedor `supabase_db_<project_id>`; si el seed ya insertó filas con las mismas claves, el restore fallará: vaciar primero con `TRUNCATE ... CASCADE` o restaurar sobre un reset sin seed). El restore no se ejecutó en el ensayo.
5. `npm ci && npm run build && npm run start` y repetir el smoke test de la [ficha](ficha-despliegue.md).
