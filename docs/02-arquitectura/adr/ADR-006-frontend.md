---
responsable: leader
estado: propuesto
ultima_actualizacion: 2026-11-25
---

# ADR-006 — Arquitectura del frontend (Astro + React) y Realtime

Fuente: documentación oficial de Astro, leída el 2026-11-25. La versión vigente es **Astro v7**. Cada punto cita la página.

## Decisión

| Tema | Decisión | Fuente |
|---|---|---|
| Renderizado | `output: 'server'` con `@astrojs/node` en `mode: 'standalone'`. Las páginas estáticas llevan `export const prerender = true`: landing, `/privacidad`, `/terminos` | [On-demand rendering](https://docs.astro.build/en/guides/on-demand-rendering/) · [Node adapter](https://docs.astro.build/en/guides/integrations-guide/node/) |
| Islas | Las páginas `.astro` se renderizan en el servidor. React (`@astrojs/react`) va solo en componentes interactivos: feed de tarjetas y filtros (`client:load`), formularios del panel (`client:load`), chat (`client:load`), campana de notificaciones (`client:idle`), bloques bajo el pliegue (`client:visible`). Sin directiva no se envía JS | [Directives reference](https://docs.astro.build/en/reference/directives-reference/) · [React](https://docs.astro.build/en/guides/integrations-guide/react/) |
| Estado entre islas | **Nano Stores** (`nanostores` + `@nanostores/react`), p. ej. filtros ↔ feed. No se usan stores en el frontmatter `.astro` | [Sharing state](https://docs.astro.build/en/recipes/sharing-state-islands/) |
| Sesión | `src/middleware.ts` (`defineMiddleware`, `onRequest`) lee la sesión de Supabase desde cookies, la pone en `context.locals` (tipado en `App.Locals`, `src/env.d.ts`) y redirige a `/login` en las rutas protegidas | [Middleware](https://docs.astro.build/en/guides/middleware/) |
| Auth | Enlace mágico de Supabase con flujo **PKCE** y cookies `httpOnly`, `secure`, `sameSite=lax` (la guía oficial solo pone `path`, así que se endurece). El access token (JWT) se envía como `Bearer` a la core API, que lo verifica. No se usa Astro Sessions: las cookies de Supabase bastan | [Supabase guide](https://docs.astro.build/en/guides/backend/supabase/) · [Sessions](https://docs.astro.build/en/guides/sessions/) |
| Variables de entorno | `astro:env` con `envField`: `PUBLIC_API_URL`, `PUBLIC_SUPABASE_URL` y `PUBLIC_SUPABASE_ANON_KEY` (client/public); `PUBLIC_API_MODE` (enum `mock`\|`http`) | [Environment variables](https://docs.astro.build/en/guides/environment-variables/) |
| Llamadas al backend | Cliente tipado propio en `src/lib/api/` con dos implementaciones: `http` (core API) y `mock` (lee `contracts/fixtures`), elegidas por `PUBLIC_API_MODE`. **No se usan Astro Actions** para lógica de negocio porque la lógica vive en la core API (Actions es la recomendación oficial solo para lógica *dentro* de Astro) | [Actions](https://docs.astro.build/en/guides/actions/) |
| Estructura | Solo `src/pages/` es obligatoria. Las demás carpetas son convención, así que se permite `src/features/<slice>/` | [Project structure](https://docs.astro.build/en/basics/project-structure/) |

Estructura resultante: la del §3.3 del prompt, sin cambios: `pages/`, `layouts/`, `features/<slice>/{components,islands,api,types}`, `components/ui/`, `lib/`, `styles/`, `middleware.ts`.

## Decisión sobre Realtime (excepción a "solo core API")

**Se acepta la excepción, limitada a la lectura.** El frontend se suscribe directamente a Supabase Realtime (`postgres_changes` sobre `messages` y `notifications`), protegido por RLS. **Las escrituras siempre pasan por la core API.**

| Pros | Contras |
|---|---|
| Sin servidor WebSocket propio ni estado de conexiones en Express | El frontend depende de `@supabase/supabase-js` |
| Menor latencia y menos código en 1 semana | La seguridad depende de que las políticas RLS sean correctas, así que *audit* debe probarlas explícitamente |
| Reconexión y backoff ya resueltos por el cliente | Hay dos caminos de datos, lo que complica algo la depuración |

Mitigaciones:

- RLS: un usuario solo lee los `messages` de conversaciones donde participa uno de sus perfiles, y solo sus `notifications`.
- La suscripción vive en `features/chat/api/realtime.ts` y `features/notifications/api/realtime.ts`, detrás de una interfaz, con implementación mock.

## Pendiente de verificar en F1

Validar con el MCP de Astro Docs, que quedó instalado para la próxima sesión, y con Context7, que está pendiente de autenticación:

- el paquete `@supabase/ssr` con Astro v7;
- la API exacta de `astro:env` en v7.
