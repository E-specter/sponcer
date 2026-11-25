---
responsable: Eduard
estado: borrador
ultima_actualizacion: 2026-11-25
---

# Rollback

1. Detener los servicios (`Ctrl+C` en backend y frontend).
2. Hacer checkout del tag estable anterior: `git checkout vX.Y.Z`. Lo ejecuta una persona.
3. BD:
   - si la versión introdujo migraciones, ejecutar `npm run db:reset`. **Esto borra los datos locales.** Antes, respaldar con `npx supabase db dump --data-only > backup.sql`;
   - para conservar datos, restaurar el respaldo después del reset.
4. `npm ci && npm run build && npm run start`, y luego el smoke test de la [ficha](ficha-despliegue.md).
