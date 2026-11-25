---
responsable: Esteban (valida) · leader (extracción)
estado: aprobado
ultima_actualizacion: 2026-11-25
---

# Componentes de UI

Ubicación: `frontend/src/components/ui/`. Valores: [tokens](tokens.md). Capturas: [referencias/](referencias/).

| Componente | Variantes y estados | Referencia Figma |
|---|---|---|
| `Logo` | Sello de 32 px (26 px en móvil), radio 10, `--gradiente-firma` + `assets/vinculo.svg` en blanco, y la palabra "Sponcer". Variante sobre tinta (texto blanco) y sobre claro (texto tinta) | `7:7020` |
| `Button` | **primario** (violeta, texto blanco, 600 14 px); **secundario** (blanco, borde, texto violeta); **texto** (sin fondo ni borde, texto violeta); **deshabilitado**. Hover del primario `#5A1CA7`. Foco con anillo exterior. Ancho completo opcional | `7:7157`, `7:7249` |
| `Field` | Etiqueta persistente (12 px, 600) arriba, campo de 46 px, ayuda (11 px, secundario), error (borde y texto en `--color-error`) | `7:7183` |
| `SearchField` | Icono `search` de 18 px a la izquierda; en Descubrir, 52 px de alto con la etiqueta "Buscar" a la derecha | `7:7187`, Demo `7:7406` |
| `Tabs` | Activa: texto violeta 600 y subrayado violeta de 2 px. Inactiva: texto secundario. Borde inferior `--color-borde` | `7:7202` |
| `Chip` (filtro / nicho) | **activo**: fondo `--color-seleccion`, borde violeta, icono check, texto violeta 600. **inactivo**: blanco con borde `--color-borde` y texto tinta 400. 32 px, pill | `7:7206` |
| `Checkbox` / `Radio` | 20 px. Marcado: fondo violeta con check blanco (radio 5) o radio violeta con punto. Sin marcar: blanco con borde | `7:7216`–`7:7226` |
| `Tag` (estado / procedencia) | `neutral` (neutro-suave / secundario), `accion` (selección / violeta), `exito`, `error`, `tinta` (tinta-elevada / cian). 11 px 600, padding 5×8, radio 6 | `7:7261`, `7:7268` |
| `ProfileCard` | Tarjeta blanca con borde y radio 16; borde violeta si está destacada. Dos layouts, por el ancho del contenedor (container query): **compacto** (retrato de 76×86 a la izquierda) y **rejilla** (imagen de 172 px arriba). Contenido, en este orden: nombre (21 px, 600) · ubicación o rol (12 px) · `Tag` de procedencia · bio (14 px) · línea de procedencia (11 px, "Bio compartida · Instagram · @handle") · chips de nichos · fila secundaria de métricas (tier · seguidores · engagement, 12 px) · **motivo del match** (12 px violeta) · acciones (primario de ancho flexible "Me interesa" + texto "Ver perfil" + texto secundario "Descartar") | `7:7231`, Demo `7:7428` |
| `Avatar` | Retrato o **iniciales** sobre tinta, en círculo de 32/48/64 px; 40 px en la cabecera | `7:7254`, Demo `7:7367` |
| `Notice` | **privacidad**: fondo neutro-suave, icono `shield-check`, título 14 px 600 + texto 12 px. **info**: fondo selección, icono `info`. Radio 10, padding 16 | `7:7281`, `7:7149`, Demo `7:7515` |
| `Skeleton` | Bloques `--color-neutro-suave` (avatar de 48, línea de 12 px a 160 px de ancho, línea de 10 px al 100 %); conserva el espacio y respeta `prefers-reduced-motion` | `7:7312` |
| `EmptyState` | Mensaje de 14 px + botón secundario con la salida ("Limpiar filtros") + nota de 12 px | `7:7318` |
| `ErrorState` | Mensaje de 14 px en `--color-error` + botón secundario "Reintentar" + nota de que la selección se conserva | `7:7324` |
| `ContextPanel` (tinta) | Tarjeta tinta de radio 16: perfil activo (avatar de 46 px + nombre), eyebrow "EN SPONCER" (declarado) y "DESDE INSTAGRAM" (ingerido), texto en blanco y `--color-texto-sobre-tinta`, enlace cian "Ver perfil de origen" con `external-link` | Demo `7:7519` |
| `AppHeader` | 88 px (68 px en móvil), blanco, borde inferior; logo + `Tag`; pestañas centradas; cuenta (nombre 14 px 600 + perfil activo 12 px + `Avatar` de iniciales) | Demo `7:7348`, `7:7579` |
| `SideNav` | 176 px, eyebrow "TU ESPACIO", destinos de 44 px con icono de 18 px; activo con fondo `--color-seleccion`, texto violeta y radio 10 | Demo `7:7370` |
| `BottomNav` (móvil) | 4 destinos con icono de 20 px + etiqueta de 12 px; activo en violeta | Demo `7:7750` |
| `HeroComposition` (portada) | Dos tarjetas blancas de radio 18, padding 10 e inclinadas −5°/+5°, con imagen de radio 10 + nombre (24 px, 600) + rol (13 px) + procedencia (11 px); anillos `campo-afinidad.svg` y `campo-contexto.svg`; píldora violeta de 23 px 600 | `7:7766` |
| `Steps` (portada) | 3 pasos numerados (número en secundario + título de 2u), descripción y una mini vista de ejemplo | Pitch 02 `7:7813` |

## Iconos

- Son del conjunto **Lucide**: `search`, `check`, `shield-check`, `compass`, `bookmark`, `link`, `users`, `user-plus`, `sliders-horizontal`, `info`, `external-link`, `arrow-up-right`.
- Se usa `lucide-react` (licencia ISC) en las islas. En las páginas `.astro` se usan los SVG de [assets/](assets/) o los mismos de Lucide.
- Grosor 2, `aria-hidden="true"` cuando acompañan a un texto.
