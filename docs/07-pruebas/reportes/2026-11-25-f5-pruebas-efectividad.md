# Reporte de Pruebas de Efectividad — Fase 5

- **Responsable:** Mariana Pachas
- **Fecha:** 2026-11-25
- **Fase:** 5 — Pruebas de efectividad del sistema (Sponcer)

## 1. Objetivo
Validar la efectividad funcional y operativa de los flujos principales de **Sponcer**: autenticación y validación de cuentas (Influencers y Marcas), extracción de datos públicos (*scrapper*), modelo de descubrimiento y emparejamiento (*matchmaking*), filtros de búsqueda y gestión de cotizaciones/estados en el panel.

## 2. Matriz de Pruebas de Efectividad

| ID | Módulo / Flujo | Caso de prueba | Resultado esperado | Estado |
| :--- | :--- | :--- | :--- | :--- |
| PE-01 | Auth y Validación | Registro de influencer y empresa verificando titularidad de cuenta | Solo permite completar el registro tras validar la cuenta | Aprobado |
| PE-02 | Scrapper de datos | Extracción de datos públicos hacia la ficha de perfil del influencer | Los datos públicos se estructuran y muestran correctamente en la tarjeta | Aprobado |
| PE-03 | Modelo de Matchmaking | Emparejamiento entre marca e influencers según nicho (*fitness*, *geek*, repostería, etc.) | El modelo ordena y sugiere perfiles compatibles según afinidad | Aprobado |
| PE-04 | Módulo de Filtros | Filtrado de perfiles por categoría/nicho y búsqueda | Las tarjetas de perfil se actualizan de forma asíncrona sin errores | Aprobado |
| PE-05 | Panel y Cotizaciones | Consulta de *matches* y actualización de estados de cotización/presupuesto | El panel refleja el seguimiento y cambio de estado de cada servicio | Aprobado |
| PE-06 | Conexiones Asíncronas | Respuesta de *endpoints* entre Frontend, Backend (Express) y Supabase | Tiempos de respuesta estables y manejo controlado de errores | Aprobado |

## 3. Conclusiones de Efectividad
- Los flujos principales de registro, perfilado mediante *scrapper* y emparejamiento responden de forma consistente ante distintos nichos de contenido.
- La comunicación asíncrona entre el frontend, el backend y la base de datos mantiene la integridad de los estados de seguimiento y cotización.
