# Verificación visual (Playwright, modo mock)

Regla del equipo: toda implementación con UI termina con esta verificación para afinar el diseño contra Figma.
Captura las pantallas clave en **modo mock** (sin backend ni Supabase: fixtures de `contracts/fixtures` y sesión demo) a 1440×900 y 414×896, página completa. **No compara píxeles**: las referencias de Figma no son pantallas exactas; se comparan a ojo.

## Uso

```bash
cd frontend
npm run e2e:visual                      # todas las pantallas (22 capturas)
npm run e2e:visual -- --grep descubrir  # solo las que coincidan (por nombre de pantalla o ancho: "@414")
```

- Config: `playwright.visual.config.ts`. Levanta `astro dev` en el puerto **4521** con `PUBLIC_API_MODE=mock PUBLIC_AUTH_MODE=mock` (reutiliza el servidor si ya corre; `VISUAL_BASE_URL` apunta a otro).
- Salida: `frontend/test-results/visual/<pantalla>-<ancho>.png` (carpeta ignorada por git).
- El test **falla solo** si la página emite errores de consola, excepciones o respuestas HTTP >= 400 (la captura se guarda igual, para verla). Un fallo de hidratación cuenta como error.
- Las pantallas con perfil activo (`as` en `capture.spec.ts`) fijan `localStorage['sponcer.activeProfileId']` al perfil del usuario demo: creador `sofi.moda.demo`, marca `andina.snacks.demo`.
- Para una pantalla nueva: añadirla a `SCREENS` en `capture.spec.ts` y a la tabla de abajo.

## Pantalla -> referencia a comparar (`docs/03-diseno/referencias/`)

| Pantalla (nombre de captura)                                                                        | Referencia                                                                                                                                  |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `portada` (`/`)                                                                                     | `01-portada.png` (identidad, titular y firma), `07-pitch-01-propuesta.png` (propuesta y recorrido en 3 pasos)                               |
| `login` (`/login`)                                                                                  | `04-controles.png` (campos y botones), `02-color.png`                                                                                       |
| `descubrir-creador`, `descubrir-marca` (`/descubrir`)                                               | `08-demo-descubrir-escritorio.png` (disposición, tarjetas, panel de contexto), `05-persona-fuentes-consentimiento.png` (tarjeta de persona) |
| `perfil-creador`, `perfil-marca` (`/perfil/<handle>`)                                               | `05-persona-fuentes-consentimiento.png` (persona, fuentes, procedencia), `06-estados.png`                                                   |
| `panel` (`/panel`)                                                                                  | `04-controles.png` (formularios), `05-persona-fuentes-consentimiento.png` (vinculación y consentimiento)                                    |
| `matches` (`/panel/matches`), `cotizaciones` (`/panel/cotizaciones`), `mensajes` (`/mensajes/<id>`) | `08-demo-descubrir-escritorio.png` (navegación y paneles), `06-estados.png` (vacíos, estados), `04-controles.png`                           |
| `privacidad` (`/privacidad`)                                                                        | `03-tipografia-espaciado.png` (lectura 45-70 caracteres), `05-persona-fuentes-consentimiento.png`                                           |
| Todas                                                                                               | `02-color.png` (proporción neutros/violeta), `03-tipografia-espaciado.png` (escala `u`), `04-controles.png` (foco, 44 px)                   |

Referencias solo de escritorio: para 414 px se evalúa el brief (`docs/03-diseno/brief.md`): tarjetas apiladas, objetivos táctiles >= 44 px, sin scroll horizontal.
