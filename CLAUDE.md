# SecondMind

Sistema de productividad y conocimiento personal construido desde código. Combina ejecución (tareas, proyectos, hábitos) con conocimiento vivo (notas atómicas Zettelkasten, links bidireccionales, grafo, AI copilot).

**Producción:** https://secondmind.web.app

## Stack

- **UI:** React 19 + TypeScript strict + Vite + Tailwind CSS + shadcn/ui
- **Editor:** TipTap (ProseMirror) con extensiones custom (wikilinks, slash commands, tags)
- **State:** TinyBase (13KB, store reactivo con persister Firestore)
- **Search:** Orama (FTS client-side, TypeScript-native)
- **Graph:** Reagraph (MVP) → Sigma.js + Graphology (v2)
- **Backend:** Firebase (Firestore + Cloud Functions v2 + Auth + Storage)
- **AI:** Claude Haiku (inbox processing + auto-tagging notas) + OpenAI embeddings (v1.1)
- **Deploy:** Firebase Hosting

## Comandos

```bash
npm run dev          # Servidor de desarrollo (Vite)
npm run build        # Build producción (tsc + vite build)
npm run lint         # ESLint sobre src/
npm run preview      # Preview del build local
npm run deploy       # Deploy a Firebase Hosting
npm run deploy:functions  # Deploy solo Cloud Functions
npm run logs:functions    # Logs de Cloud Functions
```

## Toolkit Claude Code (Fase 0.1)

### MCPs disponibles

- **Firebase** — Acceso directo a Firestore, Auth, security rules del proyecto `secondmindv1`. Usar para inspeccionar colecciones, validar rules, consultar docs. Configurado en `.mcp.json` con `node` directo al CLI local (no `npx`).
- **Context7** — Docs actualizadas de React, TinyBase, TipTap, Firebase, Tailwind, shadcn/ui. Invocar con `use context7` en el prompt cuando se necesite verificar API/sintaxis de alguna librería del stack.
- **Playwright** — Testing visual y navegación automatizada, bajo demanda.
- **Brave Search** — Búsqueda web, bajo demanda (requiere `BRAVE_API_KEY` como variable de sistema).

### Skills activos

- `frontend-design` — calidad visual, evita estética genérica "AI slop"
- `tailwind-v4-shadcn` — patrones `@theme inline` y CSS variables
- `react-composition-patterns` — compound components, lift state, evitar boolean props
- `react-best-practices` — rerender/memo/bundle optimization (reglas SSR-específicas no aplican a Vite)
- `ui-ux-pro-max` — bases de datos buscables de 50+ estilos, 161 paletas, 57 combinaciones tipográficas, 161 tipos de producto, 99 guidelines UX, 25 tipos de gráfico. Se activa automáticamente en tareas UI/UX. Requiere Python 3 para los scripts internos (search.py usa BM25 + regex)

### Automatización (hooks)

Configurados en `.claude/settings.json`. Se ejecutan automáticamente sin intervención:

- **PostToolUse** (tras Write/Edit/MultiEdit): Prettier + ESLint --fix sobre el archivo editado. NO correr manualmente.
- **PreToolUse** (antes de Edit/Write): si la rama actual es `main`, la operación se bloquea con `exit 2`. Crear branch `feat/[x]` antes de codear.

### TypeScript LSP (plugin Anthropic)

El plugin `typescript-lsp@claude-plugins-official` funciona en Windows SOLO con un patch manual al `marketplace.json` global. Requisitos para que funcione al clonar el repo en otro PC:

1. Instalar global: `npm install -g typescript-language-server`
2. Agregar `C:\Users\<user>\AppData\Roaming\npm` al **PATH del sistema**
3. Parchear `~/.claude/plugins/marketplaces/claude-plugins-official/.claude-plugin/marketplace.json`, buscar la entrada `typescript-lsp` y cambiar:
   ```json
   "command": "node",
   "args": ["<ruta absoluta a typescript-language-server/lib/cli.mjs>", "--stdio"]
   ```
4. Habilitar en `~/.claude/settings.json`: `"typescript-lsp@claude-plugins-official": true`

Si Claude Code actualiza el marketplace, este patch puede perderse y hay que reaplicarlo.

## Estructura del proyecto

```
src/
├── app/             # Rutas y layouts (React Router)
├── components/      # Componentes agrupados por FEATURE, no por tipo
│   ├── ui/          # shadcn/ui — NO editar manualmente
│   ├── editor/      # TipTap: editor + extensions/ + menus/
│   ├── graph/       # Visualización del knowledge graph
│   ├── capture/     # Quick Capture modal, Inbox Processor
│   ├── dashboard/   # Cards del dashboard
│   └── layout/      # Sidebar, CommandPalette, Breadcrumbs
├── stores/          # TinyBase stores (1 archivo por entidad)
├── hooks/           # Custom hooks (1 archivo por hook)
├── lib/             # Configs (firebase.ts, tinybase.ts, orama.ts) + utils
├── types/           # Interfaces TypeScript (1 archivo por entidad)
└── functions/       # Cloud Functions v2 (deploy separado)
```

## Documentación del proyecto

Antes de implementar features, leer **on-demand** (con Read) los docs relevantes — NO están auto-importados al contexto:

- `Docs/00-fundamentos-segundo-cerebro.md` — Principios teóricos: CODE (Tiago Forte), notas atómicas Zettelkasten, flujo captura→proceso→uso, 10 principios de diseño
- `Docs/01-arquitectura-hibrida-progresiva.md` — Stack completo, modelo de datos Firestore (schemas de notes, links, tasks, projects, inbox, embeddings), flujos clave, fases de desarrollo, decisiones de diseño
- `Docs/02-flujos-ux-y-pantallas.md` — 14 pantallas con wireframes, 5 flujos de usuario, componentes globales, shortcuts, breakpoints responsive
- `Docs/03-convenciones-y-patrones.md` — Naming, estructura de componentes, patrones TinyBase, TypeScript, Tailwind, errores, Git, Cloud Functions, Firestore
- `Spec/SPEC-fase-0.1-toolkit.md` — SPEC de toolkit de desarrollo (MCPs, plugins, hooks, VS Code)
- `design-system/secondmind/MASTER.md` → Tokens de diseño, paleta, tipografía, component patterns, anti-patterns (consultar al implementar UI)

IMPORTANT: Siempre consultar el doc de arquitectura (01) para schemas de datos y el doc de convenciones (03) para patrones de código antes de escribir código nuevo. Lee solo los que apliquen a la tarea — evita cargar los 4 si no los necesitas.

## Reglas críticas

### Componentes

- Export default siempre: `export default function NoteCard() {}`
- Props como interface: `interface NoteCardProps { noteId: string; }`
- Lógica en hooks, no en componentes. Si tiene >10 líneas de lógica → extraer a hook
- Un componente por archivo. El archivo se llama como el componente

### TinyBase (state management)

- **v8 — sin persister-firestore nativo**: `tinybase/persisters/persister-firestore` fue removido en v8. Se usa `createCustomPersister` de `tinybase/persisters` con `getDocs`/`setDoc`/`onSnapshot`. Implementación en `src/lib/tinybase.ts`
- TinyBase es la fuente de verdad del UI. Nunca leer de Firestore directo en componentes
- Usar hooks reactivos: `useCell('notes', noteId, 'title')` — NO getters directos
- Los hooks reactivos requieren `<Provider store={notesStore}>` en el árbol (está en `src/main.tsx`)
- Stores separados por dominio: notesStore, tasksStore, linksStore, inboxStore
- Content largo de notas (TipTap JSON) va directo a Firestore, NO en TinyBase

### TypeScript

- `interface` para shapes de objetos, `type` para unions y aliases
- Nunca `any`. Usar `unknown` + type guard
- Tipos de dominio en `types/[entidad].ts`, props en el mismo archivo del componente

### Tailwind

- **Tailwind v4 CSS-first**: no existe `tailwind.config.ts`. La configuración (tokens, variables CSS, custom variants) está en `src/index.css` con `@theme inline { ... }`
- Mobile-first siempre: estilos base son mobile, breakpoints agregan
- Usar variables semánticas de shadcn/ui: `text-foreground`, `bg-background`, `border-border`
- NO usar `@apply`. Si se repite un patrón → extraer a componente

### Imports

- Absolutos con `@/` alias: `import NoteCard from '@/components/editor/NoteCard'`
- Sin barrel exports (index.ts). Import directo al archivo
- Orden: React → Libs externas → Componentes → Hooks → Libs/utils → Types

### Naming

- Hooks: `use[Entidad][Acción]` → `useNoteSearch`, `useBacklinks`, `useQuickCapture`
- Handlers: `handle[Acción]` → `handleSave`, `handleCapture`
- Booleanos: `is/has/can/should` → `isArchived`, `hasBacklinks`
- Entidades: nunca abreviar. `project` NO `proj`, `objective` NO `obj`

### Firestore

- Paths: `users/{userId}/[collection]/{docId}`
- IDs auto-generados por Firestore (excepto embeddings que usa noteId)
- Timestamps: siempre `serverTimestamp()` para createdAt/updatedAt
- Security rules: solo el dueño lee/escribe sus datos

### Cloud Functions v2

- Un archivo = un trigger = una responsabilidad
- Siempre loggear con contexto: `{ userId, entityId }`
- Timeout y retry configurados explícitamente, nunca defaults
- Secret management: `defineSecret('ANTHROPIC_API_KEY')` + declarar en `secrets: [...]` del trigger. El valor se accede con `secret.value()` dentro del handler, no en top-level
- `stripJsonFence` helper compartido en `src/functions/src/lib/parseJson.ts` para parsear JSON de Claude que puede venir wrapped en markdown fences
- Cloud Functions desplegadas: `processInboxItem` (`onDocumentCreated` inbox) + `autoTagNote` (`onDocumentWritten` notes)

### Git

- Conventional Commits en español: `feat(editor): agregar extensión wikilinks`
- Commits atómicos: si necesita "y", son dos commits
- Ramas: `feat/[feature]`, `fix/[bug]`

## Entidades del dominio

| Entidad    | Singular  | Plural     | ID          | Firestore Path                       |
| ---------- | --------- | ---------- | ----------- | ------------------------------------ |
| Nota       | note      | notes      | noteId      | users/{uid}/notes/{noteId}           |
| Link       | noteLink  | noteLinks  | linkId      | users/{uid}/links/{linkId}           |
| Tarea      | task      | tasks      | taskId      | users/{uid}/tasks/{taskId}           |
| Proyecto   | project   | projects   | projectId   | users/{uid}/projects/{projectId}     |
| Objetivo   | objective | objectives | objectiveId | users/{uid}/objectives/{objectiveId} |
| Área       | area      | areas      | areaId      | users/{uid}/areas/{areaId}           |
| Inbox item | inboxItem | inboxItems | itemId      | users/{uid}/inbox/{itemId}           |
| Tag        | tag       | tags       | tagId       | users/{uid}/tags/{tagId}             |
| Hábito     | habit     | habits     | habitId     | users/{uid}/habits/{habitId}         |
| Embedding  | embedding | embeddings | noteId      | users/{uid}/embeddings/{noteId}      |

## Gotchas

- **Tailwind v4 CSS-first**: No existe `tailwind.config.ts`. Agregar tokens o custom utilities directamente en `src/index.css` bajo `@theme inline { ... }`. Los docs de Tailwind v3 no aplican para la API de configuración.
- **ESLint flat config**: El proyecto usa `eslint.config.js` (formato flat de ESLint 9), no `.eslintrc.cjs`. Al agregar plugins o reglas, usar la sintaxis de flat config (`defineConfig([...])`, no `module.exports = { extends: [...] }`). `src/components/ui/` está excluido del linting (archivos auto-generados por shadcn).
- **shadcn/ui en `components/ui/`**: NO editar estos archivos. Si necesitas customizar, crea un wrapper en la carpeta feature correspondiente.
- **TipTap WikiLinks son Nodes, no Marks.** Tienen attrs `{ noteId, noteTitle }` y se renderizan inline. Ver extensión en `components/editor/extensions/wikilink.ts`.
- **extractLinks() se ejecuta en cada save** del editor. Parsea el doc TipTap JSON y sincroniza la colección `links/` con los wikilinks encontrados.
- **El Quick Capture modal NO tiene selector de tipo, tags, ni proyecto.** Todo va al Inbox sin clasificar. La clasificación es post-captura (AI o manual).
- **Auto-save del editor: debounce de 2 segundos.** La constante es `AUTOSAVE_DEBOUNCE_MS = 2000`.
- **Loading states: skeleton siempre, spinner nunca.** Los skeletons mantienen el layout.
- **Optimistic updates** para acciones inmediatas (toggle checkbox, favorito, archivar). TinyBase actualiza local → persister sincroniza a Firestore async.
- **TypeScript LSP plugin requiere patch en Windows:** El plugin `typescript-lsp@claude-plugins-official` no funciona out-of-the-box en Windows por un bug de `spawn()` con wrappers `.cmd`. Ver sección "Toolkit Claude Code → TypeScript LSP" arriba. Si el LSP devuelve `ENOENT: uv_spawn 'typescript-language-server'`, el patch del marketplace.json fue revertido por una actualización.
- **ui-ux-pro-max symlinks rotos en Windows:** El skill instala symlinks en `~/.claude/plugins/cache/ui-ux-pro-max-skill/.../skills/ui-ux-pro-max/scripts` y `/data` que apuntan a `src/ui-ux-pro-max/`. En Windows sin Developer Mode (o `git config core.symlinks false`), git clona los symlinks como archivos de texto con el path, rompiendo la ejecución. Los scripts reales viven en `src/ui-ux-pro-max/scripts/search.py`. Fix permanente: activar Developer Mode de Windows + `git config --global core.symlinks true` + reinstalar el plugin.
- **Claude Haiku devuelve `null` en campos individuales del JSON** para inputs basura (especialmente `suggestedArea`). Validar cada campo con fallback en las Cloud Functions — no hacer throw en validación de campos opcionales. El fallback para área es `'conocimiento'`.
- **`isInitializing` de hooks (200ms) no es suficiente para snapshots de datos en full reload.** Los persisters pueden tardar más en hidratar el store. Para decisiones de "¿hay datos o no?" (ej: batch del InboxProcessor, redirect por existencia de row), usar un grace dedicado más largo (1500ms) o observar `items.length > 0` como signal real. Mismo patrón que `redirectGraceExpired` de ProjectDetailPage de Fase 2.
- **`onDocumentCreated` no cubre notas creadas vacías desde el editor.** Las notas desde `/notes` se crean con `contentPlain: ''` y el texto llega en el auto-save (2s después). `autoTagNote` usa `onDocumentWritten` con guard `aiProcessed` para procesar en el primer write con contenido sin re-procesar en updates subsiguientes.
- **Notas del inbox processor necesitan `aiProcessed: true` al crear** si vienen con tags aceptados del AI. Sin esto, `autoTagNote` sobrescribiría los tags que el usuario aceptó de la sugerencia del inbox. `convertToNote` en `useInbox.ts` setea `aiProcessed: !!(overrides?.tags?.length > 0)`.

## Fases de desarrollo

- **Fase 0 (Setup) ✅:** Vite + React 19 + TS + Tailwind + Firebase + TinyBase + estructura base
- **Fase 0.1 (Toolkit) ✅:** MCPs + plugins + hooks + VS Code configurados. Ver `Spec/SPEC-fase-0.1-toolkit.md`
- **Fase 1 (MVP) ✅:** Quick Capture + TipTap editor con WikiLinks + Lista de notas + Backlinks + Inbox + Dashboard minimo
- **Fase 2 (Ejecucion) ✅:** Tareas + Proyectos + Objetivos + Habit Tracker. Ver `Spec/SPEC-fase-2-ejecucion.md`
- **Fase 3 (AI) ✅:** Claude Haiku inbox processing (CF processInboxItem) + schema aiResult flat + InboxItem card con sugerencias + InboxProcessor one-by-one + Command Palette (Ctrl+K) con Orama FTS global + auto-tagging notas (CF autoTagNote). Ver `Spec/SPEC-fase-3-ai-pipeline.md`
- **Fase 4 (Grafo + Resurfacing):** Knowledge graph + Embeddings + FSRS resurfacing + Daily Digest
- **Fase 5 (Multi-plataforma):** PWA + Tauri (desktop) + Capacitor (mobile) + Chrome extension

When compacting, preserve: current phase, modified files list, pending tasks, and any architectural decisions made during the conversation.
