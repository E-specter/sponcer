---
responsable: leader
estado: borrador
ultima_actualizacion: 2026-11-25
---

# Herramientas de IA: skills, MCP y agentes

## Agentes

Las definiciones están en `.claude/agents/` (versionado, excepción en `.gitignore`). Resumen y propiedad de carpetas: [09-equipo/responsables](../09-equipo/responsables.md).

## Skills (origen verificado el 2026-11-25)

| Skill | Origen | Uso en Sponcer |
|---|---|---|
| superpowers | Marketplace oficial `anthropics/claude-plugins-official` | Procesos: TDD, debugging, planes |
| find-skills | Skill sincronizada (no figura como plugin; origen sin verificar) | Buscar skills; solo se instalan las de fuentes confiables |
| claude-mem | Terceros, GitHub `thedotmack/claude-mem` | Memoria entre sesiones y tablero personal |
| frontend-design | Marketplace oficial `anthropics/claude-plugins-official` | Brief de diseño y UI |
| code-simplifier | Marketplace oficial `anthropics/claude-plugins-official` | Simplificación tras implementar |
| modern-web-guidance | Skill sincronizada (se atribuye a Chrome; origen sin verificar) | Buenas prácticas web actuales |
| **ponytail** | Terceros, GitHub `DietrichGebert/ponytail` v5.3.2 | Cambios mínimos; confirmado por Eduard |

**No se usan en Sponcer:** `coordinador-multiagente` y `actualizar-requerimientos-rf`, porque imponen otra estructura de `docs/` y pertenecen a otro proyecto.

## MCP

| Servidor | Estado | Nota |
|---|---|---|
| Supabase (oficial) | disponible | Conector de claude.ai |
| Figma (oficial, Dev Mode) | disponible | No hay archivo de Figma aún |
| Astro Docs (oficial) | **instalado** (`claude mcp add --transport http -s local astro-docs https://mcp.docs.astro.build/mcp`) | Activo desde la próxima sesión |
| Playwright (Microsoft) | disponible | E2E |
| Context7 | pendiente de autenticación (OAuth) | Docs de React y librerías |
| GitHub | falla al conectar (cabecera de autorización) | Reautenticar; mientras tanto se usa `gh` de solo lectura |

`.mcp.json` no se versiona. Cada colaborador añade los servidores con `claude mcp add … -s local`.
