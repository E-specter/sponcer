---
responsable: Esteban (valida) · leader (extracción)
estado: aprobado
ultima_actualizacion: 2026-11-25
---

# Design tokens

Extraídos de Figma › Dirección visual (`7:7035` color, `7:7087` tipografía y proporción, `7:7156` controles). Figma no tiene variables publicadas, así que los valores vienen de los estilos de cada nodo. Implementación: `frontend/src/styles/tokens.css` (custom properties).

## Color

| Token | Valor | Uso |
|---|---|---|
| `--color-tinta` | `#17171B` | Texto principal; fondos editoriales (portada, panel de perfil) |
| `--color-tinta-elevada` | `#242329` | Superficie sobre tinta (etiqueta TikTok) |
| `--color-papel` | `#F6F5F2` | Lienzo principal (fondo de la app) |
| `--color-blanco` | `#FFFFFF` | Superficies (tarjetas, cabecera, campos) |
| `--color-violeta` | `#7028C9` | **Única acción**: botón primario, foco, selección, enlaces |
| `--color-violeta-hover` | `#5A1CA7` | Hover del primario (más contraste) |
| `--color-seleccion` | `#F0E7FB` | Fondo de chip activo, aviso informativo, etiqueta violeta |
| `--color-magenta` | `#D32F88` | Firma (solo dentro del gradiente) |
| `--color-albaricoque` | `#F5A064` | Firma (solo dentro del gradiente) |
| `--color-cian` | `#69E0E8` | Acento **solo sobre tinta** |
| `--color-rosa` | `#F58BB6` | Acento **solo sobre tinta** |
| `--color-texto-secundario` | `#62616B` | Metadatos, notas, placeholders |
| `--color-texto-sobre-tinta` | `#BEBAC8` | Texto secundario sobre tinta |
| `--color-borde` | `#DCD9E1` | Bordes de tarjetas, campos y chips inactivos |
| `--color-neutro-suave` | `#ECEAF0` | Etiqueta neutra, botón deshabilitado, esqueleto, aviso de privacidad |
| `--color-exito` / `--color-exito-fondo` | `#28634B` / `#E8F2EB` | Estados positivos (verificado, aceptada) |
| `--color-error` / `--color-error-fondo` | `#A53746` / `#FAEBED` | Errores, estados negativos (rechazada, vencido) |
| `--gradiente-firma` | `linear-gradient(90deg, #F5A064 0%, #D32F88 46%, #7028C9 100%)` | Sello del logo, líneas de firma, anillos de portada |

## Tipografía

- **Familia:** `Inter`, autoalojada con `@fontsource-variable/inter` (sin peticiones a terceros).
- **Pesos:** 400 para lectura, 500 para etiquetas y 600 para jerarquía.

| Token | Tamaño / interlineado / tracking | Uso |
|---|---|---|
| `--text-display` | 88 px (76 px en Dirección visual) / 1.12 / −0.04em, 600 | Titular de portada (fluido con `clamp`) |
| `--text-titular` (3u) | 48 px / 1.12 / −0.04em, 600 | Titular de página ("Tu próximo punto en común.") |
| `--text-titulo` (2u) | 32 px / 1.12 / −0.04em, 600 | Títulos de sección |
| `--text-subtitulo` | 20–21 px / 1.12 / −0.04em (−0.03em en nombre), 600 | Título de tarjeta, nombre de perfil |
| `--text-cuerpo` (1u) | 16 px / 1.45 / 0, 400 | Texto base |
| `--text-control` | 14 px / 1.45, 600 en botones | Botones, campos, bio en tarjeta |
| `--text-chip` | 13 px | Chips y controles de selección |
| `--text-nota` (0.75u) | 12 px / 1.45 | Notas, metadatos, línea de afinidad |
| `--text-micro` | 11 px / 1.45 | Procedencia, ayudas de campo, etiquetas de estado (600) |
| `--text-eyebrow` | 12 px, 600, MAYÚSCULAS, tracking 0.12em | Antetítulos editoriales |
| Logo | 30 px (26 px en móvil), 400, tracking −0.05em | "Sponcer" junto al sello |

## Espaciado (u = 16 px)

| Token | Valor | Uso |
|---|---|---|
| `--space-0-5` | 8 px | Separación mínima, gap de chips |
| `--space-1` | 16 px | Padding interno |
| `--space-1-5` | 24 px | Padding de tarjeta de catálogo, gap entre tarjetas |
| `--space-2` | 32 px | Grupos |
| `--space-3` | 48 px | Secciones |
| `--space-4` | 64 px | Secciones grandes, márgenes de portada |

Tarjeta de persona: padding de 20 px y gap interno de 14 px. Ancho de lectura `max-inline-size: 70ch`.

## Radios

| Token | Valor | Uso |
|---|---|---|
| `--radius-check` | 5 px | Checkbox |
| `--radius-tag` | 6 px | Etiqueta de estado o procedencia |
| `--radius-control` | 10 px | Botón, campo, aviso, retrato rectangular, sello del logo |
| `--radius-focus` | 14 px | Anillo de foco exterior |
| `--radius-card` | 16 px | Tarjetas y paneles |
| `--radius-hero-card` | 18 px | Tarjetas inclinadas de portada |
| `--radius-pill` | 100 px | Chips, avatares circulares, píldora "Colaboración alineada" |

## Tamaños y estados

| Elemento | Medida |
|---|---|
| Control | `min-height: 44px` (objetivo táctil 2.75u) |
| Campo | 46 px (52 px para la búsqueda grande de Descubrir) |
| Chip | 32 px |
| Checkbox y radio | 20 px |
| Avatar | 32 / 48 / 64 px (siempre junto al nombre) |
| Retrato en tarjeta compacta | 76 × 86 px |
| Imagen en tarjeta de rejilla | 172 px de alto |
| Foco | `outline: 2px solid var(--color-violeta); outline-offset: 3px;` |
| Borde de campo con foco | 2 px violeta |
| Borde de campo con error | 1 px `--color-error` + mensaje de 11 px en `--color-error` |
| Deshabilitado | fondo y borde `--color-neutro-suave`, texto `--color-texto-secundario` |
