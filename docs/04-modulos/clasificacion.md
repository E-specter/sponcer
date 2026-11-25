---
responsable: Leyla (propuesto)
estado: borrador
ultima_actualizacion: 2026-11-25
---

# Módulo clasificacion (slice `classification`)

**Código:** `backend/src/modules/classification/` · **Requerimientos:** [RF-09](../01-requerimientos/RF-09.md)

## Responsabilidad

Pipeline extracción → features → clasificación → persistencia. Produce nichos con confianza, tier, engagement y embedding del perfil.

## Puertos (propuesta inicial, se fija en F1)

| Tipo | Puertos |
|---|---|
| Entrada (casos de uso) | `ClassifyProfile` |
| Salida | `EmbeddingProvider` (adaptadores: `mock`, `transformers-js`), `ClassificationRepository`, `ProfileReader` (vía puerto in de `profiles`) |

**Tablas propias:** `profile_classifications`, `profile_embeddings`  
**Eventos:** emite `ProfileClassified`; consume `ProfileIngested`, `ProfileDeclaredDataChanged`  
**Patrones:** Strategy + Pipeline ([ADR-003](../02-arquitectura/adr/ADR-003-clasificacion-matching.md))

Adaptadores `mock` y real intercambiables por `ADAPTER_CLASSIFICATION` (ver [backend-hexagonal](../02-arquitectura/backend-hexagonal.md)).
Contratos: [API](../05-contratos/api.md) · [esquema de BD](../05-contratos/esquema-bd.md) · [eventos](../05-contratos/eventos-realtime.md).

## Catálogos v1 (propuesta; los valida Leyla, DP-04)

**Nichos** (los usan los creadores y los "nichos objetivo" de las marcas): `moda`, `belleza`, `fitness`, `deportes`, `gastronomia`, `viajes`, `tecnologia`, `gaming`, `musica`, `entretenimiento`, `educacion`, `finanzas`, `salud-bienestar`, `familia-maternidad`, `mascotas`, `arte-diseno`, `emprendimiento`, `hogar-deco`, `automotriz`, `lifestyle`.

**Sectores de marca:** `moda-retail`, `belleza-cuidado-personal`, `alimentos-bebidas`, `restaurantes`, `tecnologia`, `salud`, `educacion`, `finanzas-seguros`, `turismo-hoteleria`, `entretenimiento-medios`, `deporte`, `hogar`, `automotriz`, `servicios`, `otro`.

**Tiers:** nano (< 10k) · micro (10k–100k) · mid (100k–500k) · macro (500k–1M) · mega (> 1M).

Se implementan como enums zod en `contracts/src/schemas/catalogs.ts` (F1).
