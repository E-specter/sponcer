---
responsable: Eduard
estado: pendiente
ultima_actualizacion: 2026-11-25
---

# Reglas de protección de ramas (las configura Eduard en GitHub)

> **Requisito previo:** en GitHub Free, la protección de ramas solo funciona en repos **públicos**. Si `E-specter/sponcer` es privado, hace falta GitHub Pro, que se puede obtener gratis con el GitHub Student Developer Pack. No pude comprobar la visibilidad porque `gh` no está autenticado en esta PC.

Configurar en *Settings → Rules → Rulesets* (o *Branches → Branch protection rules*):

## `main`

- [ ] Require a pull request before merging, con **1 aprobación**.
- [ ] Dismiss stale approvals when new commits are pushed.
- [ ] Require status checks to pass: `lint`, `typecheck`, `test`, `lint:deps` (existen desde F1).
- [ ] Require branches to be up to date before merging.
- [ ] Block force pushes y restrict deletions.
- [ ] Restringir los PR entrantes a la rama origen `develop`. GitHub no lo trae nativo: se hace con un check de CI que falle si `github.head_ref != 'develop'`, y se añade en F1.
- [ ] Tags `v*`: ruleset de tags que restrinja su creación a Eduard.

## `develop`

- [ ] Require a pull request before merging, con **1 aprobación**.
- [ ] Dismiss stale approvals.
- [ ] Require status checks: `lint`, `typecheck`, `test`, `lint:deps`.
- [ ] Block force pushes y restrict deletions.

## No activar

- **"Require review from Code Owners"**: Eduard es dueño de varias áreas y no puede aprobar sus propios PR, así que se bloquearía. CODEOWNERS se usa solo para asignar revisores automáticamente.

## General

- *Settings → General → Pull Requests*: permitir solo **squash merge** y **merge commit**, y activar "Automatically delete head branches".
- Rama por defecto: `develop`, para que los PR apunten ahí por defecto.
