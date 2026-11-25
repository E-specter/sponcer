---
responsable: leader
estado: propuesto
ultima_actualizacion: 2026-11-25
---

# ADR-003 — Enfoque de clasificación y matching

## Contexto

- No hay datos históricos para entrenar (arranque en frío).
- El presupuesto es 0, así que no se pueden usar APIs pagas de embeddings o LLM, y el plazo es de 1 semana.
- El matching debe ser explicable en la tarjeta ("por qué te lo recomendamos") y filtrable.

## Decisión

### Embeddings (compartidos por los dos slices)

- Modelo local **`Xenova/multilingual-e5-small`** (384 dimensiones, multilingüe con español) ejecutado en Node con `@huggingface/transformers` (transformers.js). No hay servicio Python ni costo.
- Se guarda en pgvector `vector(384)` (tabla `profile_embeddings`).
- Va detrás del puerto `EmbeddingProvider`:
  - adaptador `mock`: vector determinista a partir de un hash del texto, para los tests;
  - adaptador real: `transformers-js`.
- Si Leyla prefiere Python, entra como un adaptador HTTP más (regla 5 del ADR-005), sin cambiar los casos de uso.
- **A validar en F1 por Leyla:** el tiempo de carga del modelo y la calidad sobre 20 perfiles semilla.

### Clasificación (slice `classification`, Pipeline)

1. **Extracción:** snapshot de IG + datos declarados.
2. **Features:**
   - tier de seguidores (nano < 10k, micro 10k–100k, mid 100k–500k, macro 500k–1M, mega > 1M);
   - engagement = promedio de (likes + comentarios) / seguidores sobre los últimos ≤ 12 posts;
   - frecuencia de publicación;
   - hashtags.
3. **Clasificación de nicho** (Strategy, en orden de prioridad):
   1. nichos **declarados** por el usuario;
   2. **reglas**: `businessCategoryName` → nicho, y diccionario de hashtags y palabras clave → nicho;
   3. **embedding**: similitud del texto (bio + captions) con la descripción de cada nicho del catálogo.

   El resultado es el nicho principal + hasta 2 secundarios, cada uno con su confianza y su fuente.
4. **Persistencia** en `profile_classifications` y `profile_embeddings`, y se emite `ProfileClassified`.

El catálogo de nichos y sectores (enum v1) vive en `contracts/` y su propuesta está en [clasificacion](../../04-modulos/clasificacion.md). Lo valida Leyla.

### Matching (slice `matching`)

- **Candidatos:**
  - filtros duros como **Specifications** combinables, que se traducen a `WHERE`: nicho, tier, engagement mínimo, rango de precio contra presupuesto, y excluir descartados;
  - luego, los top-K por similitud coseno en pgvector.
- **Puntaje** (Strategy `WeightedScore`, pesos en configuración):
  `score = 0.50·cos(embeddings) + 0.25·solapamiento_nichos (Jaccard) + 0.15·ajuste_presupuesto + 0.10·engagement_normalizado`
- **Explicación:** la tarjeta muestra los 2 componentes que más aportan.
- **Regla de match:**
  - ver fichas y **solicitar cotización** es unidireccional;
  - el **match** se crea con **interés mutuo** (`ExpressInterest` de ambos lados) y emite `MatchCreated`, que habilita el chat.
- **Aprendizaje posterior:** todas las interacciones (interés / descartar / cotizar) se guardan en `interactions`. Ajustar pesos o entrenar un modelo con ellas queda **fuera del MVP**.

## Consecuencias

- (+) Costo 0, explicable y testeable por partes (cada Specification y cada Strategy por separado).
- (+) Cambiar a un modelo entrenado es añadir otra Strategy.
- (−) La calidad de nicho depende del texto disponible. Los datos declarados compensan.
- (−) La primera carga del modelo tarda (descarga de unos ~100 MB). Se precarga al arrancar el backend.
