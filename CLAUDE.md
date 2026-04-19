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
npm run tauri:dev    # Abre la app nativa en modo dev (Vite + Tauri)
npm run tauri:build  # Build release: genera MSI + NSIS en src-tauri/target/release/bundle/
npm run cap:sync     # Build web + sync android/ (copia dist + plugins)
npm run cap:run      # cap run android (Capacitor CLI, puede fallar en Windows por gradlew sin .bat)
npm run cap:build    # Build web + sync + gradlew assembleDebug → APK en android/app/build/outputs/apk/debug/
```

> Capacitor en Windows: si `cap:run` falla con `"gradlew" no se reconoce`, correr manualmente `cd android && ./gradlew.bat assembleDebug` + `adb install -r app/build/outputs/apk/debug/app-debug.apk` + `adb shell am start -n com.secondmind.app/.MainActivity`. Requiere `JAVA_HOME` y `ANDROID_HOME` en env (usar el JBR de Android Studio: `/c/Program Files/Android/Android Studio/jbr`).

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

### Setup específico Windows

Patches de entorno para TypeScript LSP, symlinks de `ui-ux-pro-max`, Firebase MCP, Capacitor Android, Cargo: ver `Docs/SETUP-WINDOWS.md`. Son procedimientos one-time, no operativos de sesión.

## Metodología de trabajo — SDD (Spec-Driven Development)

Cada feature del proyecto sigue este ciclo. No improvisar: si algo no cuadra, ajustar el SPEC o consultar antes de saltarse pasos.

1. **SPEC primero.** Sebastián escribe `Spec/features/SPEC-feature-N-<nombre>.md` con objetivo, F1–Fn sub-features (criterio de done + archivos a tocar), orden de implementación, checklist.
2. **Plan mode** (`EnterPlanMode`). Pulir el SPEC antes de codear:
   - Lanzar hasta 3 **Explore agents en paralelo** para mapear patrones existentes en el código relacionado.
   - Si aplica UI/UX, recorrido con **Playwright MCP** en viewports real (375 / 768 / 1280) capturando métricas.
   - Consultar **context7 MCP** si hay libs nuevas o migración de versión.
   - Lanzar un **Plan agent** con el contexto reunido para validar decisiones y detectar gotchas.
   - Escribir el plan refinado en `~/.claude/plans/<nombre>.md` con contexto, pre-requisitos, hallazgos del audit, desvíos sobre el SPEC, patrones a reusar (con paths), orden, archivos, decisiones clave, verificación E2E, criterio de done.
   - `ExitPlanMode` una vez aprobado.
3. **Una rama por feature:** `feat/<nombre-corto>`. `main` está bloqueada por hook PreToolUse (`exit 2` si intentás Edit/Write sobre main). Features chicas: consultar antes de arrancar.
4. **Commits atómicos Conventional Commits en español**, uno por sub-feature (`feat`, `fix`, `refactor`, `docs`, `chore`). `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` al final.
5. **E2E con Playwright MCP + Firebase MCP** si aplica web. Dev server en background con `npm run dev` (puerto 5173 → 5174 si ocupado; matar el previo si bloquea). UID de tests Firebase: `gYPP7NIo5JanxIbPqMe6nC3SQfE3` (proyecto `secondmindv1`). Cubrir golden path + edge cases + regresión. `TaskStop` al dev server al terminar.
6. **Deploy pipeline** al cerrar feature (confirmar scope al final, no paso a paso):
   - CFs si cambian: `npm run deploy:functions`.
   - Hosting: `npm run build && npm run deploy`.
   - Tauri: `npm run tauri:build` (MSI + NSIS) — **opcional** si el cambio es 100% client-side sin tocar `src-tauri/`.
   - Android: `npx cap sync android && cd android && ./gradlew.bat assembleDebug` — **opcional** si no tocaste `android/`.
7. **Merge `--no-ff` a main** con commit de merge descriptivo. Push a origin sin preguntar.
8. **Cerrar la feature:** convertir el SPEC a registro de implementación siguiendo el patrón de `Spec/features/SPEC-feature-{1..N}-*.md`. Aplicar la **regla de escalación** (ver sección "Reglas de documentación" abajo): los gotchas nacen en el SPEC, suben a `ESTADO-ACTUAL.md` solo si aplican a >1 feature, y a `CLAUDE.md` solo si son universales (toda sesión futura). Auditar techos de ambos archivos antes de commitear docs.

### Estrategia de lectura de docs

- **Fuente primaria:** `Spec/ESTADO-ACTUAL.md`. Snapshot consolidado de arquitectura vigente, gotchas activos, patrones, deps clave. Reemplaza la necesidad de leer SPECs individuales.
- **NO leer** SPECs de fases/features anteriores (`Spec/SPEC-fase-*.md`, `Spec/features/SPEC-feature-*.md`) salvo que necesites detalle puntual que `ESTADO-ACTUAL` no cubre. Ahorra mucho token.
- `Docs/00–04-*.md` son principios teóricos y schemas — leer on-demand si la tarea lo requiere.
- `CLAUDE.md` ya está auto-cargado.

### Reglas de documentación

Tres archivos, tres propósitos, un flujo unidireccional. Existen para evitar que el contexto auto-cargado crezca indefinidamente.

- **`CLAUDE.md` — briefing de sesión** (~200 líneas orientativo). Contiene: stack, comandos, convenciones activas, gotchas **universales** (aplican a toda sesión futura, no a features específicas), punteros on-demand. **Nunca:** historial de features, gotchas de una sola feature, prosa por fase.
- **`Spec/ESTADO-ACTUAL.md` — estado consolidado** (~300 líneas orientativo). Contiene: cada feature en 1-2 líneas + pointer a SPEC, gotchas por dominio (Tauri, Editor, Data, etc.), decisiones arquitectónicas vigentes. **Nunca:** narrativa de debugging, gotchas obsoletos, duplicación con SPEC.
- **`Spec/features/SPEC-feature-*.md` — canon histórico**. Sin techo. Los gotchas nacen acá.

**Flujo unidireccional:** gotcha en SPEC → si aplica a **>1 feature**, sube a ESTADO-ACTUAL → si es **universal** (toda sesión, no depende de dominio), sube a CLAUDE.md. **Nunca se duplica** entre archivos. Si ya está en un nivel, no repetir en otro.

**Techos orientativos, no estrictos.** El contenido manda: 160 líneas todas universales está OK; 140 líneas con 10 single-feature está mal. Medir por "¿aplica a toda sesión?" no por wc -l.

### Handoff entre ventanas

Cuando la conversación se alarga y conviene abrir una sesión limpia, usar `/context-handoff` (skill user-level global). Genera un snapshot del delta — estado del repo, qué se acaba de hacer, qué sigue, pointers a docs no auto-cargados — listo para pegar como primer mensaje de la nueva ventana.

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
- Tool use con schema enforcement: ambas CFs usan `tools` + `tool_choice: { type: 'tool' }` para forzar JSON válido. Schemas compartidos en `src/functions/src/lib/schemas.ts`
- Cloud Functions desplegadas: `processInboxItem` (`onDocumentCreated` inbox) + `autoTagNote` (`onDocumentWritten` notes) + `generateEmbedding` (`onDocumentWritten` notes → OpenAI embedding)

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

## Gotchas universales

Aplican a cualquier sesión sin importar la feature. Gotchas de dominio específico → `Spec/ESTADO-ACTUAL.md`.

- **Tailwind v4 CSS-first.** No existe `tailwind.config.ts`. Agregar tokens o custom utilities directamente en `src/index.css` bajo `@theme inline { ... }`. Los docs de Tailwind v3 no aplican para la API de configuración.
- **ESLint flat config.** El proyecto usa `eslint.config.js` (formato flat de ESLint 9), no `.eslintrc.cjs`. Plugins/reglas en sintaxis flat (`defineConfig([...])`, no `module.exports = { extends: [...] }`). `src/components/ui/` está excluido del linting (archivos auto-generados por shadcn).
- **shadcn/ui en `components/ui/`: NO editar estos archivos.** Si necesitás customizar, creá un wrapper en la carpeta feature correspondiente.
- **TipTap: marks viven en text nodes, no en containers.** Cualquier traversal que inspeccione `node.marks` debe recurrir hasta `node.type === 'text'` — containers como paragraph/heading/listItem nunca tienen marks directamente. Walk recursivo sobre `node.content` con early return en text nodes. Patrón consolidado en `extractLinks` y `computeDistillLevel`.
- **Loading states: skeleton siempre, spinner nunca.** Los skeletons mantienen el layout; el spinner produce layout shift.
- **Optimistic updates: `setPartialRow` (TinyBase) sync ANTES de `setDoc` async.** Invertir causa races en clicks rápidos porque click N+1 lee `existingRow` stale. Aplica a cualquier feature con UI reactivo a datos persistidos.
- **Vite `resolve.dedupe` obligatorio para Firebase Y React** (`firebase`, `@firebase/app`, `@firebase/component`, `@firebase/auth`, `@firebase/firestore`, `react`, `react-dom`). Sin esto, Vite optimizer picks up paquetes desde `extension/node_modules/` (Chrome Extension tiene su propio lockfile) y duplica registros → Firebase `Component auth has not been registered yet`, React `Invalid hook call`. **Reincidente tras CUALQUIER `npm install`** que mueva el lockfile raíz — síntomas aparecen al reiniciar el dev server, no en build producción.
- **`grid` en Tailwind sin `grid-cols-1` explícito deja children crecer.** Un `<div class="grid gap-4 lg:grid-cols-2">` con hijos de content largo estira la implicit column auto hasta miles de px en mobile. Siempre empezar con `grid-cols-1`: `grid grid-cols-1 gap-4 lg:grid-cols-2`.
- **`min-w-0 flex-1 truncate` obligatorio** en `<span>` dentro de `<a class="flex">` para que `truncate` funcione. Solo `truncate` sin `min-w-0` deja el child expandirse a content-size.

## Estado de features

Lista de fases completadas + features, gotchas por dominio, decisiones arquitectónicas vigentes y dependencias con historia → `Spec/ESTADO-ACTUAL.md`. Para detalle de una feature específica, seguir el pointer desde ahí a `Spec/features/SPEC-feature-N-*.md`.

When compacting, preserve: current phase, modified files list, pending tasks, and any architectural decisions made during the conversation.
