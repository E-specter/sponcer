---
responsable: leader
estado: aprobado
ultima_actualizacion: 2026-11-25
---

# Flujo de git

## Principio

**Los commits los hace siempre una persona, nunca un agente.** Quien conduce la sesión prueba la implementación, la confirma y queda como responsable en el historial.

| Agentes: permitido (solo lectura) | Agentes: prohibido |
|---|---|
| `git status`, `diff`, `log`, `show`, `branch` (listar), `blame` · `gh pr view`, `gh pr diff`, `gh issue view` | `git add`, `commit`, `push`, `pull`, `fetch`, `merge`, `rebase`, `reset`, `restore`, `checkout`, `switch`, `stash`, `tag`, `cherry-pick`, `revert`, `branch -d/-D/-m/-M`, `rm`, `mv`, `clean`, `worktree`, `init`, `am`, `apply` · `gh` que cree, edite, fusione o comente, y `gh api` |

**Bloqueo técnico:**

- La lista de arriba está como reglas `permissions.deny` para las herramientas `Bash` y `PowerShell`, incluida la variante `git -C <ruta> …`, en [claude-settings.example.json](claude-settings.example.json).
- Cada colaborador la copia a `.claude/settings.json`: `cp docs/06-desarrollo/claude-settings.example.json .claude/settings.json`.
- La plantilla también fija `worktree.bgIsolation: "none"`, para que las sesiones en segundo plano editen el checkout sin crear ramas.
- Verificado el 2026-11-25: `git -C . commit` quedó denegado.

Si una tarea parece requerir una operación prohibida, el agente se detiene y la propone como comando.

### Excepción del sprint intensivo (acordada por el equipo, 2026-11-25)

Durante el sprint de F1 a F3, el leader hace **commits locales** en `develop` en nombre del responsable de cada área (`--author`, según [responsables](../09-equipo/responsables.md)). Eduard habilita `add`, `commit` y `switch` en su `.claude/settings.json` local. Siguen prohibidos `push`, `merge`, `rebase`, `reset` y todo `gh` de escritura: **Eduard publica** con `git push`. La plantilla [claude-settings.example.json](claude-settings.example.json) se mantiene estricta para el resto del equipo.

## Ramas

| Rama | Uso | Reglas |
|---|---|---|
| `main` | Estable y desplegable | Solo PR desde `develop`; CI en verde y 1 aprobación; cada release lleva el tag `vX.Y.Z` |
| `develop` | Integración | Solo PR; CI en verde y 1 aprobación |
| `<tipo>/<area>-<descripcion>` | Una tarea atómica | Sale de `develop` y vuelve por PR |

- **Tipos:** `feature`, `fix`, `docs`, `test`, `chore`, `refactor`. Ejemplo: `feature/matching-filtros-nicho`.
- **Commits:** Conventional Commits, con el módulo como scope, en español y en imperativo. Ejemplo: `feat(matching): agregar filtro por rango de seguidores`.
- **Atomicidad:** un cambio lógico por commit.
- **Merge:** *squash merge* hacia `develop`; *merge commit* de `develop` a `main` para la release.

## PR

Plantilla: `.github/pull_request_template.md`. Revisores automáticos: `.github/CODEOWNERS`. Reglas de GitHub: [proteccion-ramas](proteccion-ramas.md).

## Bloque de cierre (lo entrega el leader, no lo ejecuta)

Lista explícita de archivos, cómo probar, el resultado de audit y los comandos sugeridos (`git switch -c …`, `git add <archivos explícitos>`, `git commit -m …`, `git push -u …`, `gh pr create --base develop …`). Nunca `git add .`. Se avisa de los archivos que **no** deben subirse (`.env`, artefactos generados).
