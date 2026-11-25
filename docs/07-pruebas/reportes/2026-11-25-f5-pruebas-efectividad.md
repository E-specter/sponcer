# Reporte de Pruebas de Efectividad — Fase 5

- **Responsable:** Mariana Pachas
- **Fecha:** 2026-11-25
- **Tarea y RF:** Fase 5 — Pruebas de efectividad del sistema (RF: Auth, Perfil de usuario/empresa, Scrapper, Modelo de descubrimiento y emparejamiento, Panel de perfil, Consulta de *matches* y Cotización de servicios por estados)
- **Resultado:** `aprobado`

## 1. Archivos revisados
- `docs/07-pruebas/estrategia.md`
- `docs/07-pruebas/casos-e2e.md`
- `docs/07-pruebas/reportes/2026-11-25-f5-features.md`
- Módulos de `backend/`, `frontend/`, `contracts/` y `db/` asociados a autenticación, *scrapper*, *matchmaking* y panel de seguimiento.

## 2. Matriz de Pruebas de Efectividad (Tests añadidos)

| ID | Módulo / RF | Caso de prueba | Resultado esperado | Estado |
| :--- | :--- | :--- | :--- | :--- |
| PE-01 | Auth y Validación | Registro de influencer y empresa verificando titularidad de cuenta | Solo permite completar el registro tras validar la cuenta | Aprobado |
| PE-02 | Scrapper de datos | Extracción de datos públicos hacia la ficha de perfil del influencer | Los datos públicos se estructuran y muestran correctamente en la tarjeta | Aprobado |
| PE-03 | Modelo de Matchmaking | Emparejamiento entre marca e influencers según nicho (*fitness*, *geek*, repostería, política) | El modelo ordena y sugiere perfiles compatibles según afinidad | Aprobado |
| PE-04 | Módulo de Filtros | Filtrado de perfiles por categoría/nicho y búsqueda | Las tarjetas de perfil se actualizan de forma asíncrona sin errores | Aprobado |
| PE-05 | Panel y Cotizaciones | Consulta de perfiles de *matches* y actualización de estados de cotización/presupuesto | El panel refleja el seguimiento y cambio de estado de cada servicio | Aprobado |
| PE-06 | RNF / Conexiones Asíncronas | Respuesta de *endpoints* entre Frontend, Backend (Express + TypeScript) y Supabase | Tiempos de respuesta estables y notificaciones/estados consistentes | Aprobado |

## 3. Hallazgos ordenados por severidad
- **Crítica:** Ninguno.
- **Alta:** Ninguno.
- **Media:** Validar que los tiempos de respuesta del *scrapper* público mantengan indicadores visuales claros de carga asíncrona en el frontend cuando haya alta demanda.
- **Baja:** Mantener estandarizados los nombres de nichos en las fichas de perfil para maximizar la precisión del filtro.
