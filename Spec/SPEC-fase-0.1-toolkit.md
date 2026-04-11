# SPEC — SecondMind · Fase 0.1: Toolkit de Desarrollo

> Alcance: Claude Code configurado con MCPs, plugins, skills, hooks y VS Code optimizado para el stack del proyecto
> Dependencias: Fase 0 completada (proyecto compilando, Git inicializado)
> Estimado: 1-2 horas
> Stack relevante: Claude Code + VS Code + Firebase CLI + GitHub

---

## Objetivo

Al terminar esta fase, Claude Code tiene acceso directo a Firebase, GitHub, y documentación actualizada de todas las librerías del proyecto. Los archivos se auto-formatean y lintean en cada edición. VS Code muestra errores de TypeScript inline y autocompleta clases de Tailwind. El CLAUDE.md se actualiza para referenciar las nuevas herramientas. Todo listo para codear sin fricción.

---

## Features

### F1: MCP Servers — Firebase + GitHub + Context7

**Qué:** Instalar los 3 MCP servers críticos que Claude Code necesita para interactuar con el stack del proyecto.

**Criterio de done:**

- [ ] Firebase MCP instalado y conectado al proyecto `secondmind-app`
- [ ] Desde Claude Code, se puede hacer una query a Firestore (ej: listar colecciones)
- [ ] GitHub MCP instalado y autenticado con PAT
- [ ] Desde Claude Code, se pueden listar issues/PRs del repo `sebasgc0399/SecondMind`
- [ ] Context7 MCP instalado y funcionando
- [ ] Al escribir "use context7" en un prompt, Claude obtiene docs actualizadas

**Archivos a crear/modificar:**

- `.mcp.json` (raíz del proyecto) — Configuración de los 3 MCPs

**Notas de implementación:**

Firebase MCP — instalar como plugin oficial:

```bash
/plugin install firebase@claude-plugins-official
```

Si Claude Code cuelga al iniciar, agregar variable de entorno `METADATA_SERVER_DETECTION: "none"` en la config del MCP (bug conocido en entornos sin GCP).

GitHub MCP — instalar vía HTTP remoto:

```bash
claude mcp add --transport http github \
  https://api.githubcopilot.com/mcp/ \
  --header "Authorization: Bearer YOUR_GITHUB_PAT"
```

Crear un PAT en GitHub con permisos: `repo`, `read:org`, `read:user`. Guardar el token de forma segura — no commitear.

Context7 MCP:

```bash
claude mcp add context7 -- npx -y @upstash/context7-mcp@latest
```

Verificar con: pedirle a Claude "use context7 para buscar la API de TinyBase createStore".

---

### F2: MCP Servers — Bajo demanda (Playwright + Brave Search)

**Qué:** Instalar los 2 MCPs secundarios que se activan solo cuando se necesitan.

**Criterio de done:**

- [ ] Playwright MCP instalado
- [ ] Brave Search MCP instalado con API key configurada
- [ ] Ambos funcionan cuando se invocan (verificar con un test simple)

**Archivos a modificar:**

- `.mcp.json` — Agregar Playwright y Brave Search

**Notas de implementación:**

Playwright MCP:

```bash
claude mcp add playwright -- npx @playwright/mcp@latest
```

Brave Search MCP (requiere API key gratuita de https://brave.com/search/api/):

```bash
claude mcp add brave-search -e BRAVE_API_KEY=tu_key -- npx -y @brave/brave-search-mcp-server
```

Estos MCPs consumen tokens extra (~8K y ~5K respectivamente). Si el contexto se siente lento, desactivarlos cuando no se usen.

---

### F3: Plugin TypeScript LSP

**Qué:** Instalar el plugin que da a Claude Code feedback en tiempo real de errores de tipo TypeScript.

**Criterio de done:**

- [ ] Plugin typescript-lsp instalado y activo
- [ ] Al editar un archivo .ts/.tsx con error de tipo, Claude lo detecta y corrige en el mismo turno
- [ ] `typescript-language-server` instalado globalmente como prerequisito

**Notas de implementación:**

```bash
# Prerequisito global
npm install -g typescript-language-server

# Instalar plugin
/plugin install typescript-lsp@claude-plugins-official
```

Este plugin es el de mayor impacto para TypeScript strict. Convierte a Claude en un dev que realmente verifica tipos después de cada edición.

---

### F4: Skills — Frontend Design + Tailwind v4 + React Patterns

**Qué:** Instalar skills que mejoran la calidad del output visual y de código de Claude.

**Criterio de done:**

- [ ] Skill `frontend-design` activo (se auto-activa al pedir interfaces)
- [ ] Skill `tailwind-v4-shadcn` instalado desde marketplace `secondsky/claude-skills`
- [ ] Skill `react-patterns` instalado desde marketplace `jezweb/claude-skills`
- [ ] Al pedir un componente React con Tailwind, Claude genera código con mejor calidad visual que antes

**Notas de implementación:**

```bash
# frontend-design viene preinstalado en Claude Code reciente
# Verificar con: /plugin list

# Agregar marketplaces comunitarios
/plugin marketplace add secondsky/claude-skills
/plugin marketplace add jezweb/claude-skills

# Instalar skills
/plugin install tailwind-v4-shadcn@claude-skills
/plugin install react-patterns@claude-skills
```

El skill `frontend-design` evita la estética genérica "AI slop". El skill `tailwind-v4-shadcn` cubre el patrón `@theme` inline y CSS variables de shadcn/ui — directamente alineado con nuestro stack.

---

### F5: Hooks — Auto-format + Lint + Protección de main

**Qué:** Configurar hooks de Claude Code que automatizan formatting y protegen la rama main.

**Criterio de done:**

- [ ] Cada archivo que Claude edita se auto-formatea con Prettier
- [ ] Cada archivo que Claude edita pasa ESLint --fix automáticamente
- [ ] Si Claude intenta editar en la rama `main`, el hook lo bloquea
- [ ] Los hooks funcionan silenciosamente sin intervención del usuario

**Archivos a crear:**

- `.claude/settings.json` — Configuración de hooks

**Notas de implementación:**

Crear `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "npx prettier --write \"$CLAUDE_TOOL_INPUT_FILE_PATH\""
          },
          {
            "type": "command",
            "command": "npx eslint --fix \"$CLAUDE_TOOL_INPUT_FILE_PATH\" 2>/dev/null || true"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "[ \"$(git branch --show-current)\" != \"main\" ] || exit 2"
          }
        ]
      }
    ]
  }
}
```

El `2>/dev/null || true` en ESLint evita que errores de lint bloqueen la edición — solo aplica auto-fixes silenciosamente. El hook de PreToolUse sale con código 2 si estamos en main, lo que cancela la operación.

IMPORTANT: Prettier y ESLint deben estar instalados en el proyecto (ya lo están si Fase 0 está completa).

---

### F6: VS Code — Extensiones y Settings

**Qué:** Instalar las extensiones de VS Code esenciales para el stack y configurar settings.json optimizado.

**Criterio de done:**

- [ ] Tailwind CSS IntelliSense funciona: autocomplete de clases, hover preview, lint de clases inválidas
- [ ] ESLint + Prettier: Format on Save funciona, clases Tailwind se ordenan automáticamente
- [ ] Error Lens + Pretty TS Errors: errores de TypeScript visibles inline junto al código
- [ ] Claude Code extension: sidebar funcional con diffs inline
- [ ] GitLens: blame inline visible en archivos
- [ ] Firebase rules syntax highlighting en `firestore.rules`

**Extensiones a instalar (8 imprescindibles):**

```
bradlc.vscode-tailwindcss          # Tailwind CSS IntelliSense
dbaeumer.vscode-eslint              # ESLint
esbenp.prettier-vscode              # Prettier
usernamehw.errorlens                # Error Lens
yoavbls.pretty-ts-errors            # Pretty TypeScript Errors
anthropic.claude-code               # Claude Code
eamodio.gitlens                     # GitLens
vitest.explorer                     # Vitest Explorer
```

**Extensiones recomendadas (5 adicionales):**

```
GitHub.vscode-pull-request-github   # GitHub PRs
formulahendry.auto-rename-tag       # Auto Rename Tag (JSX)
christian-kohler.path-intellisense  # Path autocomplete
Gruntfuggly.todo-tree               # TODO tracker
toba.vsfire                         # Firebase rules syntax
```

**Archivos a crear/modificar:**

- `.vscode/settings.json` — Settings del proyecto
- `.vscode/extensions.json` — Extensiones recomendadas (para que VS Code sugiera instalarlas)

**Notas de implementación:**

Crear `.vscode/settings.json`:

```json
{
  "tailwindCSS.classFunctions": ["cva", "cn"],
  "files.associations": { "*.css": "tailwindcss" },
  "editor.quickSuggestions": { "strings": "on" },
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "eslint.validate": ["javascript", "javascriptreact", "typescript", "typescriptreact"],
  "typescript.tsdk": "node_modules/typescript/lib"
}
```

Crear `.vscode/extensions.json`:

```json
{
  "recommendations": [
    "bradlc.vscode-tailwindcss",
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "usernamehw.errorlens",
    "yoavbls.pretty-ts-errors",
    "anthropic.claude-code",
    "eamodio.gitlens",
    "vitest.explorer",
    "toba.vsfire"
  ]
}
```

NO instalar: Live Server (Vite ya tiene HMR), Bracket Pair Colorizer (nativo en VS Code), ES7 Snippets (Claude Code genera componentes más rápido), GitHub Copilot (valor marginal si ya pagas Claude Code).

---

### F7: Actualizar CLAUDE.md

**Qué:** Actualizar el CLAUDE.md del proyecto para referenciar las herramientas instaladas y agregar instrucciones de uso.

**Criterio de done:**

- [ ] CLAUDE.md incluye referencia a Context7 ("usar `use context7` para docs actualizadas")
- [ ] CLAUDE.md incluye referencia al Firebase MCP para operaciones de Firestore
- [ ] CLAUDE.md menciona que los hooks auto-formatean cada archivo editado
- [ ] CLAUDE.md indica que ediciones en `main` están bloqueadas por hook

**Archivos a modificar:**

- `CLAUDE.md` — Agregar sección de herramientas disponibles

**Notas de implementación:**

Agregar después de la sección "Comandos" en CLAUDE.md:

```markdown
## Herramientas disponibles

- **Firebase MCP:** Acceso directo a Firestore, Auth, Functions, Hosting desde Claude Code
- **GitHub MCP:** Gestión de PRs, issues, code search del repo
- **Context7:** Usar `use context7` en prompts para obtener docs actualizadas de React, TinyBase, TipTap, Firebase, Tailwind, shadcn/ui
- **Playwright:** Disponible para testing visual bajo demanda
- **Brave Search:** Disponible para búsqueda web bajo demanda

## Automatización (hooks)

- Cada archivo editado se auto-formatea con Prettier y pasa ESLint --fix
- Ediciones en rama `main` están bloqueadas — crear branch primero
- NO necesitas correr prettier/eslint manualmente después de editar
```

---

## Orden de implementación

1. **F1: MCPs críticos** → Base para que Claude Code acceda a Firebase y docs
2. **F2: MCPs bajo demanda** → Complementarios, se pueden posponer si hay prisa
3. **F3: TypeScript LSP** → Feedback de tipos en tiempo real
4. **F4: Skills** → Mejora calidad de output visual y de código
5. **F5: Hooks** → Automatización de formatting y protección de main
6. **F6: VS Code** → Experiencia de desarrollo optimizada
7. **F7: CLAUDE.md** → Documentar todo lo instalado

F1-F5 son Claude Code. F6 es VS Code. F7 es documentación. Se pueden hacer en paralelo las de Claude Code y VS Code.

---

## Estructura de archivos nuevos

```
SecondMind/
├── .mcp.json                     # Configuración de MCP servers
├── .claude/
│   └── settings.json             # Hooks de Claude Code
├── .vscode/
│   ├── settings.json             # Settings del proyecto
│   └── extensions.json           # Extensiones recomendadas
└── CLAUDE.md                     # Actualizado con herramientas
```

---

## Checklist de completado

Al terminar, TODAS estas condiciones deben ser verdaderas:

- [ ] `claude mcp list` muestra Firebase, GitHub, Context7, Playwright, Brave Search
- [ ] Desde Claude Code, una query a Firestore funciona (Firebase MCP)
- [ ] "use context7" en un prompt retorna docs actualizadas (Context7 MCP)
- [ ] `/plugin list` muestra typescript-lsp, frontend-design, tailwind-v4-shadcn
- [ ] Al editar un archivo, Prettier + ESLint corren automáticamente (hooks)
- [ ] Intentar editar en `main` es bloqueado por el hook
- [ ] Tailwind IntelliSense autocompleta clases en VS Code
- [ ] Errores de TypeScript se muestran inline (Error Lens + Pretty TS Errors)
- [ ] CLAUDE.md documenta todas las herramientas disponibles

---

## Siguiente fase

Volver a **Fase 0** si no está completada, o continuar con **Fase 1 (MVP):** Quick Capture + Editor TipTap con WikiLinks + Lista de notas + Backlinks + Inbox + Dashboard mínimo. El toolkit configurado aquí hace que la implementación de Fase 1 sea significativamente más rápida y con mejor calidad de output.
