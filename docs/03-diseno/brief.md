---
responsable: Esteban (valida) · leader (extracción)
estado: aprobado
ultima_actualizacion: 2026-11-25
---

# Brief de diseño

**Fuente:** Figma `Sponcer` (archivo `F1mqjeQdZaly5bc20gNJng`), extraído con el MCP de Figma el 2026-11-25.

| Página de Figma | Peso | Qué aporta |
|---|---|---|
| **Dirección visual** | principal | Sistema: color, tipografía, proporción, controles, tarjeta de persona, estados |
| **Presentación Pitch** | principal | Tono, portada (Pitch 01), recorrido en 3 pasos (Pitch 02), cierre (Pitch 03) |
| Demo (no definitiva) | complementaria | Disposición de la app en escritorio y móvil. Solo detalles; no es un diseño cerrado |

Capturas de referencia: [referencias/](referencias/). Assets descargados: [assets/](assets/). Valores exactos: [tokens](tokens.md). Inventario: [componentes](componentes.md).

## Concepto

> **"Menos ruido. Más afinidad."** Minimalismo social editorial.

Principios de marca:

1. **Personas antes que métricas.** La ficha empieza por quién es la persona o la marca: nombre, nicho, bio. Las cifras (seguidores, engagement, tier) existen (RF-06), pero van en una fila secundaria, nunca como protagonista.
2. **Contexto antes que volumen.** Cada dato muestra su **procedencia**: si viene de Instagram (ingerido) o si se declaró en Sponcer. "La fuente acompaña al dato." Esto se alinea con RF-06 (ingerido de solo lectura frente a declarado editable) y con RNF-05.
3. **El control siempre en tus manos.** Aparecen consentimiento, privacidad y vinculación explícitos. Los avisos de privacidad tienen un componente propio.

## Color con intención

- **Proporción:** base neutra ≫ acción > firma.
- **Neutros dominantes** (papel, blanco, tinta) y **una sola acción: violeta**.
- **Firma de marca:** el gradiente albaricoque → magenta → violeta va solo en el sello del logo, en líneas de firma y en acentos de portada. Nunca en botones ni en texto.
- **Cian y rosa:** solo como acentos **sobre tinta**, por ejemplo en la etiqueta "TikTok · exploración".

## Tipografía

- **Inter** con tres pesos: 400 para lectura, 500 para etiquetas y 600 para jerarquía.
- **Escala en `u`**, donde `u` = 16 px, el texto base.
- **Interlineado:** lectura ≈ 1.45, títulos ≈ 1.12.
- **Tracking:** 0 en la interfaz. Solo en titulares grandes se aplica un ajuste óptico negativo de hasta −4 %.

## Proporción y disposición

- **Espaciado en múltiplos de `u`:** interno 1–1.5u, grupos 2u, secciones 3–4u.
- **Ancho de lectura:** 45–70 caracteres.
- **El contenido define el ancho, no el dispositivo:** las tarjetas tienen un ancho mínimo útil y se apilan cuando no caben (3 → 2 → 1 columnas). Los márgenes son fluidos.

## Accesibilidad (vinculante)

- **Contraste:** el texto normal debe tener al menos 4.5:1.
- **Foco visible:** anillo exterior de 2 px violeta con separación de 3 px. El hover no sustituye al foco.
- **Objetivos táctiles:** al menos 44 px (2.75u).
- **Estados:** siempre con texto, **nunca solo con color**. Por ejemplo, un chip activo lleva un check además del color.

## Voz

- Verbos concretos, con una acción principal por grupo: "Me interesa", "Ver perfil", "Solicitar cotización".
- **Estados vacíos:** dan una salida clara ("Limpiar filtros"), sin rellenar con resultados que no coinciden.
- **Errores:** dicen qué pasó y qué conserva el usuario ("Tu selección sigue guardada"), con "Reintentar".
- **Carga:** esqueletos que reservan el espacio, sin saltos ni movimiento innecesario.

## Mapeo del lenguaje de la Demo a las pantallas de Sponcer

| En Figma (Demo / Pitch) | En Sponcer |
|---|---|
| "Conectar" | **"Me interesa"**: crea el match por interés mutuo (RF-10) |
| "Ver perfil" | "Ver perfil" → `/perfil/[handle]` |
| Pestañas "Descubrir / Mis conexiones / Solicitudes" | **Descubrir · Matches · Cotizaciones · Mensajes** |
| Navegación contextual "Tu espacio" | Panel: **Para ti (feed) · Matches · Cotizaciones · Mis perfiles · Privacidad** |
| Tarjeta de persona | `ProfileCard` de creador o de marca |
| "Intereses declarados en Sponcer" | **Nichos** declarados o clasificados (chips), con su procedencia |
| "Compartís fotografía y diseño · Sponcer" (línea violeta) | **Motivo del match**: los `reasons` del feed ("Nichos en común: moda, belleza") |
| "Bio compartida · Instagram · @handle" | Línea de procedencia del dato ingerido |
| "Tus fuentes, tu control" | Panel de verificación: reclamo por código en bio (RF-02) y aviso de privacidad |
| "Solicitud de conexión" (Aceptar / Ahora no) | Interés recibido o cotización recibida, con acciones de la máquina de estados |
| Pitch 02: Definir → Encontrar afinidad → Decidir colaborar | Sección "Cómo funciona" de la portada (`/`) |

## Pantallas

1. **Portada `/`** (estática, en tinta, a partir de Pitch 01):
   - antetítulo "EMPAREJAMIENTO PARA COLABORACIONES";
   - titular display "Influencers y marcas, juntos de forma natural.";
   - subtítulo en `texto-sobre-tinta`;
   - línea de firma + "Influencers primero. Marcas alineadas.";
   - composición de dos tarjetas inclinadas ±5° (creador ficticio y marca ficticia, con las imágenes de `assets/demo-*.png`) sobre los anillos (`campo-*.svg`), con la píldora violeta "Colaboración alineada" y la nota "Perfiles ficticios · Caso de demostración";
   - debajo, "Cómo funciona" en 3 pasos (Pitch 02) y el principio de confianza (escudo + texto);
   - CTA primario "Entrar".
2. **App en escritorio** (a partir de la Demo):
   - cabecera de 88 px en blanco con borde inferior: logo + etiqueta de estado, pestañas centrales y cuenta (nombre + perfil activo + avatar de iniciales en tinta);
   - tres columnas sobre papel: navegación contextual de 176 px / contenido de hasta 836 px / panel contextual de 300 px;
   - el panel contextual muestra el perfil activo en una tarjeta **tinta** con "En Sponcer" (declarado) y "Desde Instagram" (ingerido), luego "Tus fuentes, tu control" y las novedades (notificaciones).
3. **App en móvil:** cabecera de 68 px y **barra inferior** con 4 destinos con icono y etiqueta: Descubrir, Matches, Cotizaciones, Panel. El contenido va en una columna con márgenes de 20 px.
4. **Descubrir:**
   - antetítulo + titular "Tu próximo punto en común." + descripción;
   - búsqueda con icono y chips de filtro (nicho, tier) + botón "Filtros";
   - línea de criterio ("Afinidades con tus nichos declarados · Orden: compatibilidad");
   - rejilla de tarjetas de 2 columnas que pasa a 1;
   - aviso de transparencia al final.
5. **Perfil, Panel, Matches, Cotizaciones, Mensajes:** usan los mismos componentes (tarjetas blancas de radio 16, etiquetas de estado, campos, avisos).

## Fuera de alcance del restyle

- Contenido de la Demo que no existe en el producto, como TikTok vinculado o "Guardados". Se puede mostrar TikTok como "En exploración" solo con una etiqueta informativa.
- Modo oscuro: Figma no lo define. El MVP es **solo claro**, con las secciones editoriales en tinta.
