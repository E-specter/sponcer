## Qué cambia

<!-- Resumen en 1–3 líneas. Un cambio lógico por PR. -->

## RF relacionado

<!-- p. ej. RF-10 · enlace a docs/01-requerimientos/RF-10.md -->

## Cómo probar

1.
2.

**Resultado esperado:**

## Checklist de audit

- [ ] CI en verde (lint, typecheck, test, lint:deps)
- [ ] Cumple el contrato (`contracts/`); los adaptadores mock y real pasan la suite del puerto
- [ ] RLS activado y probado en las tablas nuevas o modificadas
- [ ] Sin secretos ni `.env` en el diff
- [ ] Reporte de audit: `docs/07-pruebas/reportes/…`

## Docs actualizadas

- [ ] Doc del módulo (`docs/04-modulos/…`)
- [ ] Contratos / ADR (si aplica)
- [ ] `docs/10-seguimiento/changelog.md`
