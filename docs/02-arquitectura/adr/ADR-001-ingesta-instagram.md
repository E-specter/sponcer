---
responsable: leader
estado: aprobado
ultima_actualizacion: 2026-11-25
---

# ADR-001 — Ingesta de datos de Instagram

## Contexto

- RF-01 y RF-02 necesitan datos públicos de perfiles de Instagram: bio, seguidores y posts recientes con sus interacciones.
- El equipo **no puede crear una app de Meta**: no hay Página de Facebook ni cuenta IG Business propia, y no hay tiempo para la revisión de Meta.
- El plazo es de 1 semana y el presupuesto es de ~0 USD.
- El scraping no autorizado infringe los términos de Meta, con riesgo de bloqueo y riesgo legal.

## Opciones evaluadas

| Opción | Costo | Viabilidad en 1 semana | Riesgo |
|---|---|---|---|
| (a) Instagram Graph API, *Business Discovery* | Gratis | **No**: exige app de Meta, Página FB, cuenta IG Business propia y revisión de la app | Bajo (oficial) |
| (b) Scraper open source (p. ej. Instaloader, Python) | Gratis | Media: Instagram limita mucho el acceso anónimo; suele requerir sesión iniciada, con bloqueos frecuentes | **Alto**: bloqueo de la cuenta usada, mantenimiento |
| (c) Apify, actor oficial `apify/instagram-profile-scraper` | Plan Free: **USD 5/mes de crédito sin tarjeta**; **USD 2,60 por 1.000 perfiles** → ~1.900 perfiles/mes | **Alta**: API HTTP + cliente Node (`apify-client`), sin infraestructura propia | Medio: el riesgo de ToS lo absorbe en parte el proveedor; los datos siguen siendo de terceros |

Datos de Apify verificados el 2026-11-25 en [la ficha del actor](https://apify.com/apify/instagram-profile-scraper) y en [los precios](https://apify.com/pricing).

## Decisión

1. **Puerto `InstagramSource`** en el slice `ingestion`, con dos adaptadores intercambiables por `ADAPTER_INGESTION=mock|apify`:
   - `mock`: lee perfiles semilla de `contracts/fixtures/`. Es el adaptador por defecto: con él trabaja todo el equipo y corren los tests.
   - `apify`:
     - **por lotes**: `client.actor('apify/instagram-profile-scraper').call({ usernames })`;
     - **un perfil en vivo** (verificación, ADR-002): endpoint GET del *Server Actor* `https://apify--instagram-profile-scraper.apify.actor/?username=<handle>`, que no escribe dataset y se cobra como 1 perfil.
2. **Capa anticorrupción:** el JSON de Apify se traduce a `IgProfileSnapshot`, definido en `contracts/`. El dominio nunca ve nombres de campos de Apify.
3. **Snapshots con caché:** cada respuesta se guarda en `ig_snapshots`. Se reingiere como máximo 1 vez cada 24 h por perfil, salvo la lectura en vivo de la verificación. Así se cuidan los USD 5/mes.
4. **Alcance:** solo **cuentas públicas y profesionales**. Apify expone `isBusinessAccount` y `businessCategoryName`, pero **ningún campo distingue a las cuentas Creator**. Regla:
   - se acepta si `isBusinessAccount === true` o `businessCategoryName` no está vacío;
   - si no, el usuario lo declara al reclamar la cuenta y queda marcada `tipo_cuenta_declarado`.

   Se rechazan los perfiles `private === true`.
5. **Presupuesto de demo:** semilla curada de ≤ 300 perfiles (~USD 0,80) más las verificaciones. El token `APIFY_TOKEN` vive solo en `.env` del backend.

## Consecuencias

- (+) No depende de Meta ni de infraestructura propia, y el costo es 0 dentro del crédito gratuito.
- (+) El día que haya app de Meta, Graph API entra como un tercer adaptador (`graph`) sin tocar los casos de uso.
- (−) Solo trae los últimos ~12 posts, así que el engagement se calcula sobre esa muestra.
- (−) Sigue siendo extracción de datos de terceros. Se mitiga con los avisos de privacidad, la exclusión a pedido y la minimización de datos (ver [no-funcionales](../../01-requerimientos/no-funcionales.md)).
- **Riesgo pendiente:** si el crédito se agota antes de la demo, se queda en `mock` y snapshots ya guardados. El adaptador Instaloader queda **descartado** para el MVP.
