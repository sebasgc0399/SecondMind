# SPEC — SecondMind · Fase 0.1: Toolkit de Desarrollo (Completada)

> Registro del toolkit configurado para Claude Code + VS Code.
> Completada: Abril 2026

---

## Objetivo

Claude Code con acceso directo a Firebase, docs actualizadas de librerías, auto-format en cada edición, protección de rama `main`, LSP de TypeScript y skills de calidad de código. VS Code con extensiones del stack preconfiguradas.

---

## Features implementadas

### F1-F2: MCP Servers

- **Firebase MCP** conectado al proyecto `secondmindv1`. Expone Firestore, Auth, security rules, storage. Configurado en `.mcp.json` invocando `node node_modules/firebase-tools/lib/bin/firebase.js experimental:mcp` (usa el CLI local, no `npx`).
- **Context7 MCP** para docs actualizadas de React, TinyBase, TipTap, Firebase, Tailwind, shadcn/ui.
- **Playwright MCP** para testing visual y navegación bajo demanda.
- **Brave Search MCP** para búsqueda web con `BRAVE_API_KEY` en variable de sistema.

### F3: TypeScript LSP

Plugin `typescript-lsp@claude-plugins-official` instalado con `typescript-language-server` global. Habilitado via `enabledPlugins` en `~/.claude/settings.json`. Requirió patch manual del `marketplace.json` global para funcionar en Windows (ver sección "Decisiones técnicas").

### F4: Skills

Instalados desde marketplaces comunitarios agregados en `~/.claude/settings.json` bajo `extraKnownMarketplaces`:

- `frontend-design@claude-plugins-official` — calidad visual, evita "AI slop"
- `tailwind-v4-shadcn@claude-skills` — patrones `@theme inline` y CSS variables
- `react-composition-patterns@claude-skills` — compound components, lift state, evitar boolean props
- `react-best-practices@claude-skills` — rerender/memo/bundle optimization

### F5: Hooks

`.claude/settings.json` del proyecto con:

- **PostToolUse** (Write/Edit/MultiEdit): `prettier --write` + `eslint --fix` sobre el archivo editado
- **PreToolUse** (Edit/Write): bloquea operaciones si la rama actual es `main`

### F6: VS Code

`.vscode/extensions.json` con 9 extensiones recomendadas: Tailwind IntelliSense, ESLint, Prettier, Error Lens, Pretty TS Errors, Claude Code, GitLens, Vitest Explorer, Firebase rules. `.vscode/settings.json` local (gitignored) con formatOnSave, eslint validate, tsdk local.

### F7: CLAUDE.md

Nueva sección "Toolkit Claude Code (Fase 0.1)" entre "Comandos" y "Estructura del proyecto". Documenta MCPs activos, skills, hooks y el procedimiento del patch LSP Windows. Gotcha del LSP agregado a la lista general.

---

## Decisiones técnicas que cambiaron vs lo planeado

| Planeado                                     | Implementado                                           | Razón                                                                                                                                                                                                                                            |
| -------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GitHub MCP con PAT                           | Omitido                                                | Decisión del usuario: se configurará después si hace falta. No bloqueante para Fase 1                                                                                                                                                            |
| Firebase MCP via `npx firebase-tools@latest` | `node` directo al CLI local                            | `npx` con `@latest` fallaba con "Invalid Version" en este entorno. Se usa el binario local ya instalado como devDependency                                                                                                                       |
| Skill `react-patterns@claude-skills`         | `react-composition-patterns` + `react-best-practices`  | `react-patterns` no existe en el marketplace `jezweb/claude-skills`. Se optó por dos skills de `secondsky/claude-skills`: composition-patterns (arquitectura) + best-practices (performance). Relevantes ~100% y ~65% para SecondMind (Vite)     |
| TypeScript LSP funciona out-of-the-box       | Requiere patch manual en Windows                       | Bug del plugin: `child_process.spawn()` sin `shell: true` no resuelve wrappers `.cmd` de npm global. Se parchea `marketplace.json` global cambiando `command: "typescript-language-server"` por `command: "node"` con ruta absoluta al `cli.mjs` |
| `.vscode/settings.json` versionado           | Gitignored, solo `.vscode/extensions.json` se commitea | El `.gitignore` del proyecto excluye `.vscode/*` excepto `extensions.json`. Convención estándar: settings pueden tener overrides personales                                                                                                      |

---

## Archivos creados

**Raíz del proyecto:**

- `.mcp.json` — 4 MCP servers (firebase, context7, playwright, brave-search)
- `.claude/settings.json` — permisos + enabledPlugins + hooks
- `.vscode/extensions.json` — 9 extensiones recomendadas
- `.vscode/settings.json` — local, gitignored (Tailwind IntelliSense, formatOnSave, ESLint validate, tsdk local)

**Actualizados:**

- `CLAUDE.md` — nueva sección "Toolkit Claude Code" + gotcha LSP Windows

**Config global del usuario (fuera del repo):**

- `~/.claude/settings.json` — `enabledPlugins` con typescript-lsp y los 3 skills instalados, `extraKnownMarketplaces` con `secondsky/claude-skills` y `jezweb/claude-skills`
- `~/.claude/plugins/marketplaces/claude-plugins-official/.claude-plugin/marketplace.json` — patcheado para el LSP Windows

---

## Checklist de completado

- [x] Firebase MCP lista colecciones de Firestore (`secondmindv1`)
- [x] Context7 MCP disponible para docs de librerías
- [x] Playwright y Brave Search MCP conectados
- [x] `typescript-lsp` plugin activo con LSP funcional (tras patch Windows)
- [x] 4 skills instalados y habilitados (frontend-design, tailwind-v4-shadcn, react-composition-patterns, react-best-practices)
- [x] Hook PostToolUse corre Prettier + ESLint automáticamente tras Write/Edit
- [x] Hook PreToolUse bloquea ediciones en rama `main`
- [x] `.vscode/extensions.json` commiteado, settings locales gitignored
- [x] CLAUDE.md documenta todo el toolkit + caveat Windows
- [x] Commits limpios con Conventional Commits en español

---

## Gotchas conocidos para re-setup en otro PC

1. **Firebase MCP requiere `firebase login`** previo via `firebase-tools` CLI
2. **Brave Search** necesita `BRAVE_API_KEY` como variable de sistema Windows (no en `.env.local`)
3. **TypeScript LSP Windows** requiere: `npm install -g typescript-language-server`, agregar `C:\Users\<user>\AppData\Roaming\npm` al PATH del sistema, parchear `marketplace.json` y habilitar el plugin en `~/.claude/settings.json`. Ver CLAUDE.md sección "Toolkit Claude Code → TypeScript LSP" para procedimiento completo
4. **Marketplaces comunitarios** (`secondsky/claude-skills`, `jezweb/claude-skills`) se agregan via `extraKnownMarketplaces` en `~/.claude/settings.json`, los skills se instalan luego desde el UI de plugins de la extensión VS Code

---
