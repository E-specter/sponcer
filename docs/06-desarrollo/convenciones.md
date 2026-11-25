---
responsable: leader
estado: borrador
ultima_actualizacion: 2026-11-25
---

# Convenciones de código

- **Idioma:**
  - código (identificadores) en inglés;
  - documentación, commits, PR y textos de UI en español.
- **TypeScript:** `strict: true`. No se usa `any` sin un comentario que lo justifique. Se usa `import type` para los tipos.
- **Nombres:**
  - archivos en `kebab-case`;
  - clases y tipos en `PascalCase`;
  - casos de uso como verbo + sustantivo (`request-quote.use-case.ts`).
- **Errores:** `Result<T, DomainError>` en dominio y aplicación ([ADR-005](../02-arquitectura/adr/ADR-005-backend-hexagonal.md)). Solo se lanzan excepciones ante fallos de infraestructura inesperados.
- **Validación:** solo en los bordes, con los esquemas de `@sponcer/contracts`.
- **Formato:** Prettier (por defecto, `printWidth: 100`). ESLint sin advertencias en CI.
- **Comentarios:** solo el *porqué* que el código no muestra.
- **Atajos con límite conocido:** comentario `shortcut: <límite>, <cuándo mejorarlo>`.
- **Git:** [git-flujo](git-flujo.md).
