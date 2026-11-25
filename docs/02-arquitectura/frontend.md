---
responsable: leader
estado: borrador
ultima_actualizacion: 2026-11-25
---

# Frontend (normativo)

Las decisiones y sus fuentes oficiales están en [ADR-006](adr/ADR-006-frontend.md).

```
frontend/src/
├── pages/          Rutas (routing por archivos). Estáticas: index, privacidad, terminos
├── layouts/        Plantillas de página
├── features/<slice>/
│   ├── components/ Componentes .astro de la feature
│   ├── islands/    Componentes React hidratados (client:*)
│   ├── api/        Llamadas al cliente de API (y realtime en chat/notificaciones)
│   └── types/      Solo tipos locales de vista; los de dominio vienen de @sponcer/contracts
├── components/ui/  UI reutilizable (según 03-diseno)
├── lib/api/        Cliente tipado: http | mock (PUBLIC_API_MODE)
├── styles/         Design tokens
└── middleware.ts   Sesión Supabase → locals; protege rutas
```

## Rutas (propuesta para F1)

| Ruta | Render | Protegida | RF |
|---|---|---|---|
| `/` | estática | no | — |
| `/login`, `/auth/callback` | servidor | no | RF-03 |
| `/descubrir` | servidor + isla feed/filtros | sí | RF-10 |
| `/perfil/[handle]` | servidor | sí | RF-01, RF-06 |
| `/panel` (perfiles, verificación, datos declarados, servicios/necesidades) | servidor + islas | sí | RF-02, RF-04, RF-05, RF-07, RF-08, RF-11 |
| `/panel/matches`, `/panel/cotizaciones` | servidor + islas | sí | RF-11 |
| `/mensajes/[matchId]` | servidor + isla chat | sí | RF-13 |
| `/privacidad`, `/terminos` | estática | no | Ley 29733 |

## Reglas

- Una feature solo importa de `components/ui`, `lib` y `@sponcer/contracts`, nunca de otra feature.
- Formularios: el mismo esquema zod que usa el backend.
- Accesibilidad: WCAG 2.1 AA (lo revisa audit).
