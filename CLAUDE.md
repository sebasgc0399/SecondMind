# SecondMind

Sistema de productividad y conocimiento personal construido desde código. Combina ejecución (tareas, proyectos, hábitos) con conocimiento vivo (notas atómicas Zettelkasten, links bidireccionales, grafo, AI copilot).

**Producción:** https://secondmind.web.app

## Stack

- **UI:** React 19 + TypeScript strict + Vite + Tailwind CSS + shadcn/ui
- **Editor:** TipTap (ProseMirror) con extensiones custom (wikilinks, slash commands, tags)
- **State:** TinyBase (13KB, store reactivo con persister Firestore)
- **Search:** Orama (FTS client-side, TypeScript-native)
- **Graph:** Reagraph 4.x (MVP) — Sigma.js + Graphology en roadmap v2
- **Backend:** Firebase (Firestore + Cloud Functions v2 + Auth)
- **AI:** Claude Haiku para generación (inbox processing + auto-tagging) con la **API key del usuario (BYOK)** — sin key, la IA de generación queda deshabilitada; embeddings con OpenAI `text-embedding-3-small` (key del proyecto)
- **Deploy:** Firebase Hosting

## Comandos

```bash
npm run dev          # Servidor de desarrollo (Vite)
npm run build        # Build producción (tsc + vite build)
npm run lint         # ESLint (eslint .)
npm test             # Vitest (unit tests — repos, tinybase, etc.)
npm run test:rules   # Vitest sobre security rules (emulador Firestore, requiere JDK)
npm run preview      # Preview del build local
npm run deploy       # Deploy a Firebase Hosting
npm run deploy:rules      # Deploy solo Firestore security rules
npm run deploy:functions  # Deploy solo Cloud Functions
npm run logs:functions    # Logs de Cloud Functions
npm run tauri:dev    # Abre la app nativa en modo dev (Vite + Tauri)
npm run tauri:build  # Build release: genera MSI + NSIS en src-tauri/target/release/bundle/
npm run cap:sync     # Build web + sync android/ (copia dist + plugins)
npm run cap:run      # cap run android (Capacitor CLI, puede fallar en Windows por gradlew sin .bat)
npm run cap:build    # Build web + sync + gradlew assembleDebug → APK en android/app/build/outputs/apk/debug/
```

> Capacitor en Windows: `cap run android` falla; usar `./gradlew.bat assembleDebug` directo (ya integrado en `npm run cap:build`). Tras la build: `adb install -r app/build/outputs/apk/debug/app-debug.apk` + `adb shell am start -n com.secondmind.app/.MainActivity`. Requiere `JAVA_HOME` y `ANDROID_HOME` en env (usar el JBR de Android Studio: `/c/Program Files/Android/Android Studio/jbr`).

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
- `subagent-orchestration` (user-level, global) — guía la decisión de cuándo delegar a subagentes y cómo. Ver "Delegación a subagentes" abajo para criterios de activación.
- `gotchas-search` (user-level, CLI on-demand) — búsqueda BM25 sobre el corpus de gotchas técnicos en `Spec/gotchas/<dominio>.md`. Invocación: `python ~/.claude/skills/gotchas-search/search.py <query>`. Auto-reindex al editar gotchas vía PostToolUse hook (matcher separado en `.claude/settings.json`).

### Delegación a subagentes

La skill `subagent-orchestration` gobierna estas decisiones en detalle. Activar delegación cuando:

- **Paso 2 SDD** (Plan mode): Explore paralelos + Plan agent antes de codear.
- **Feature multi-archivo** que requiere mapear patrones existentes (>3 búsquedas).
- **Auditorías** de branch/PR/release ready-to-ship.
- **Root cause** de bugs en código no familiar o sin stack trace claro.
- **Preguntas amplias** sobre cómo funciona un subsistema del repo.
- **Investigaciones independientes** paralelizables — un solo mensaje con múltiples `Agent` calls.
- **Codebase desconocido** aunque la tarea parezca pequeña (repo ajeno, onboarding).

NO delegar para: edits puntuales con target conocido (incluso en archivos grandes si el scope está acotado), preguntas directas, fixes con stack trace claro a un archivo, comandos git/deploy únicos, tareas de 1-2 pasos.

Principio rector: **la síntesis no se delega**. El subagente recolecta; la decisión y el entendimiento son tuyos.

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
   - **Para bugs:** investigar y articular el root cause antes de codear cualquier fix. Nunca parchear síntomas.
3. **Una rama por feature:** `feat/<nombre-corto>`. `main` está bloqueada por hook PreToolUse (`exit 2` si intentás Edit/Write sobre main). Features chicas: consultar antes de arrancar.
4. **Commits atómicos Conventional Commits en español**, uno por sub-feature (`feat`, `fix`, `refactor`, `docs`, `chore`). `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` al final.
5. **E2E con Playwright MCP + Firebase MCP** si aplica web. Dev server en background con `npm run dev` (puerto 5173 → 5174 si ocupado; matar el previo si bloquea). UID de Sebastián para QA/E2E (proyecto `secondmindv1`): `gYPP7NIo5JanxIbPqMe6nC3SQfE3` — **es su cuenta personal real (la única que existe, con sus notas de producción), NO una cuenta de prueba descartable**. Usar para verificar, pero NUNCA borrar ni resetear sus datos. Cubrir golden path + edge cases + regresión. `TaskStop` al dev server al terminar.
6. **Deploy pipeline** al cerrar feature (confirmar scope al final, no paso a paso):
   - CFs si cambian: `npm run deploy:functions`.
   - Hosting: `npm run build && npm run deploy`.
   - Tauri: `npm run tauri:build` (MSI + NSIS) — **opcional** si el cambio es 100% client-side sin tocar `src-tauri/`.
   - Android: `npx cap sync android && cd android && ./gradlew.bat assembleDebug` — **opcional** si no tocaste `android/`.
7. **Merge `--no-ff` a main** con commit de merge descriptivo. Push a origin sin preguntar.
8. **Cerrar la feature:** convertir el SPEC a registro de implementación siguiendo el patrón de `Spec/features/SPEC-feature-{1..N}-*.md`. Aplicar la regla de escalación de gotchas (ver "Docs: jerarquía y reglas" abajo). Auditar techos antes de commitear docs.

### Docs: jerarquía y reglas

Siete niveles de docs, cada uno con propósito único. **Fuente primaria para estado de features = `Spec/ESTADO-ACTUAL.md`** — siempre arrancar ahí, nunca duplicar su contenido en CLAUDE.md.

| Archivo                              | Contenido                                                                                                       | Cuándo leer                                                  |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `CLAUDE.md` (este)                   | Stack, comandos, convenciones, gotchas **universales** (~200 líneas orient.)                                    | Auto-cargado                                                 |
| `Spec/ESTADO-ACTUAL.md`              | Features (1-2 líneas + pointer SPEC), índice de gotchas (canon en `gotchas/<dominio>.md`), decisiones, deps     | **Fuente primaria** para estado actual. On-demand            |
| `Spec/features/SPEC-feature-*.md`    | Canon histórico por feature. Los gotchas nacen acá                                                              | Solo si ESTADO-ACTUAL no cubre el detalle                    |
| `Spec/gotchas/<dominio>.md`          | Canon de gotchas técnicos por dominio (15 archivos post-F37). Skill `gotchas-search` busca BM25 sobre el corpus | Cuando un anchor del índice apunta acá, o invocando la skill |
| `Spec/SPEC-fase-*.md`                | Canon histórico por fase                                                                                        | Solo si ESTADO-ACTUAL no cubre el detalle                    |
| `Spec/drafts/DRAFT-*.md`             | Discovery/brief pre-SPEC temporal. Se elimina al convertirse en SPEC formal                                     | Solo al convertir un DRAFT a SPEC. No es canon               |
| `Docs/SETUP-WINDOWS.md`              | Patches one-time de entorno (TS LSP, symlinks, Cargo)                                                           | Solo onboarding/troubleshooting setup                        |
| `design-system/secondmind/MASTER.md` | Tokens de diseño, paleta, tipografía, anti-patterns                                                             | Al implementar UI                                            |

Docs teóricos en `Docs/00-04-*.md` — leer **solo el que aplique** a la tarea, nunca los 5 a la vez. **Antes de escribir código nuevo, siempre consultar `01` (schemas Firestore) y `03` (convenciones de código)**:

| Archivo                                      | Contenido                                                                                 |
| -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `Docs/00-fundamentos-segundo-cerebro.md`     | CODE (Tiago Forte), Zettelkasten, captura→proceso→uso, principios de diseño               |
| `Docs/01-arquitectura-hibrida-progresiva.md` | Schemas Firestore (notes/links/tasks/projects/inbox/embeddings), flujos clave, decisiones |
| `Docs/02-flujos-ux-y-pantallas.md`           | 14 pantallas con wireframes, 5 flujos de usuario, shortcuts, breakpoints                  |
| `Docs/03-convenciones-y-patrones.md`         | Naming, patrones TinyBase, TypeScript, Tailwind, errores, Git, Cloud Functions            |
| `Docs/04-clean-architecture-frontend.md`     | Clean Architecture en 4 capas, factory repos F10, excepciones (auth, lectura MVP)         |

**Escalación de gotchas al cerrar feature** (step 8 del SDD): nacen en SPEC → suben a `Spec/gotchas/<dominio>.md` (canon; indexado en ESTADO-ACTUAL) si aplican a >1 feature → suben a CLAUDE.md si aplican a toda sesión sin importar dominio. **Nunca duplicar entre niveles** — al subir un gotcha, eliminarlo del nivel anterior. Techos (200 / 300 líneas) son orientativos: el criterio es "¿aplica a este nivel?", no `wc -l`.

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
│   ├── tasks/       # Task cards, inline create
│   ├── projects/    # Project cards, create modal, note link
│   ├── objectives/  # Objective cards, create modal
│   ├── habits/      # Habit grid, habit row
│   ├── settings/    # Settings panels (incl. ApiKeysSection BYOK)
│   ├── onboarding/  # WelcomeModal + OnboardingChecklist (F49)
│   ├── auth/        # LoginCard, SignInForm, SignUpForm, capacity gate (F47)
│   └── layout/      # Sidebar, TopBar, CommandPalette, Breadcrumbs
├── stores/          # TinyBase stores (1 archivo por entidad)
├── hooks/           # Custom hooks (1 archivo por hook)
├── infra/           # Capa 3 (F10): repos/ (factory createFirestoreRepo) + syncLinksFromEditor.ts
├── lib/             # Configs (firebase.ts, tinybase.ts, orama.ts) + utils
├── types/           # Interfaces TypeScript (1 archivo por entidad)
└── functions/       # Cloud Functions v2 (deploy separado)
```

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
- NO usar `@apply` en componentes. Excepción: `src/index.css` `@layer base` para resets globales (patrón shadcn). Si se repite un patrón en componentes → extraer a componente

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

- Paths: `users/{userId}/[collection]/{docId}`. Colecciones **top-level** (fuera de `users/`): `config/app` (capacity gate, read público), `userSecrets/` + `allowlist/` (deny-all client-side), y metadata legible en `users/{uid}/settings/aiKeys` (F47/F48/F50)
- IDs auto-generados por Firestore (excepto embeddings que usa noteId)
- Timestamps: `serverTimestamp()` en escrituras desde Cloud Functions; `Date.now()` numérico para optimistic writes desde el cliente vía repos TinyBase
- Security rules: **beta cerrada** — el catch-all `users/**` exige en AND owner + (`google` ‖ `email_verified`) + `exists(allowlist/{token.email})`; `config/app` read público, `userSecrets/`/`allowlist/` deny-all. Detalle en [Docs/01 § Modelo de seguridad](Docs/01-arquitectura-hibrida-progresiva.md) + `Spec/gotchas/cloud-functions-guards.md` (no duplicar acá)

### Cloud Functions v2

- Un archivo = un trigger = una responsabilidad
- Siempre loggear con contexto: `{ userId, entityId }`
- Timeout y retry configurados explícitamente, nunca defaults
- Secret management (BYOK, post-F48): el secret del proyecto es `defineSecret('BYOK_MASTER_KEY')` (master key para descifrar) + `OPENAI_API_KEY` (embeddings); `secret.value()` dentro del handler, nunca top-level. La key del LLM es **del usuario**: se obtiene en runtime con `getUserAnthropicKey(userId, masterKey.value())`, no con `defineSecret`. `ANTHROPIC_API_KEY` ya no se usa
- Logs sin datos crudos: pasar los errores por `sanitizeError()` antes de `logger.error` (nunca el error crudo — puede filtrar contenido del usuario o la key)
- `maxInstances` explícito en callables para acotar costo ante abuso (ej. `embedQuery`/`checkMyAccess` 5, `saveApiKey` 3)
- Tool use con schema enforcement: las 2 CFs de generación (`processInboxItem`, `autoTagNote`) usan `tools` + `tool_choice: { type: 'tool' }` para forzar JSON válido. Schemas compartidos en `src/functions/src/lib/schemas.ts`
- Cloud Functions desplegadas (11 = 9 v2 + 2 v1 auth triggers): `processInboxItem`, `autoTagNote`, `onNoteDeleted` (cleanup cascada), `autoPurgeTrash` (scheduled), `generateEmbedding`, `embedQuery` (callable, con allowlist + rate-limit per-uid post-SPEC-51), `saveApiKey`/`deleteApiKey` (callables BYOK), `checkMyAccess` (callable autenticado, gate de allowlist post-auth — reemplazó al público `checkAllowlist` en SPEC-51), `onUserCreated`/`onUserDeleted` (triggers v1, counter del capacity gate). Detalle de triggers + timeouts en `Spec/ESTADO-ACTUAL.md` § "Cloud Functions"

### Git

- Conventional Commits en español: `feat(editor): agregar extensión wikilinks`
- Commits atómicos: si necesita "y", son dos commits
- Ramas: `feat/[feature]`, `fix/[bug]`

## Entidades del dominio

| Entidad    | Singular  | Plural     | ID                   | Firestore Path                           |
| ---------- | --------- | ---------- | -------------------- | ---------------------------------------- |
| Nota       | note      | notes      | noteId               | users/{uid}/notes/{noteId}               |
| Link       | noteLink  | noteLinks  | sourceId\_\_targetId | users/{uid}/links/{sourceId\_\_targetId} |
| Tarea      | task      | tasks      | taskId               | users/{uid}/tasks/{taskId}               |
| Proyecto   | project   | projects   | projectId            | users/{uid}/projects/{projectId}         |
| Objetivo   | objective | objectives | objectiveId          | users/{uid}/objectives/{objectiveId}     |
| Área       | area      | areas      | areaId               | users/{uid}/areas/{areaId}               |
| Inbox item | inboxItem | inboxItems | itemId               | users/{uid}/inbox/{itemId}               |
| Tag        | tag       | tags       | tagId                | users/{uid}/tags/{tagId}                 |
| Hábito     | habit     | habits     | YYYY-MM-DD           | users/{uid}/habits/{YYYY-MM-DD}          |
| Embedding  | embedding | embeddings | noteId               | users/{uid}/embeddings/{noteId}          |

## Gotchas universales

Aplican a cualquier sesión sin importar la feature. Gotchas de dominio específico → índice en `Spec/ESTADO-ACTUAL.md` § "Gotchas por dominio (índice)", canon en `Spec/gotchas/<dominio>.md` (post-F37). Para búsqueda BM25 on-demand, skill `gotchas-search`.

- **Tailwind v4 CSS-first.** No existe `tailwind.config.ts`. Agregar tokens o custom utilities directamente en `src/index.css` bajo `@theme inline { ... }`. Los docs de Tailwind v3 no aplican para la API de configuración.
- **ESLint flat config.** El proyecto usa `eslint.config.js` (formato flat de ESLint 9), no `.eslintrc.cjs`. Plugins/reglas en sintaxis flat (`defineConfig([...])`, no `module.exports = { extends: [...] }`). `src/components/ui/` está excluido del linting (archivos auto-generados por shadcn).
- **shadcn/ui en `components/ui/`: NO editar estos archivos.** Si necesitás customizar, creá un wrapper en la carpeta feature correspondiente.
- **Loading states: skeleton siempre, spinner nunca.** Los skeletons mantienen el layout; el spinner produce layout shift.
- **Optimistic updates: `setPartialRow` (TinyBase) sync ANTES de `setDoc` async.** Invertir causa races en clicks rápidos porque click N+1 lee `existingRow` stale. Aplica a cualquier feature con UI reactivo a datos persistidos. **Desde F10 (`feat/repos-layer-pilot`), el patrón vive centralizado en el factory `createFirestoreRepo` de [src/infra/repos/baseRepo.ts](src/infra/repos/baseRepo.ts).** Los nuevos writes deben usar un repo (`tasksRepo`, `notesRepo`, etc.) en lugar de llamar `setDoc`/`setPartialRow` directo desde un hook. Migración hook-a-repo completa: `useTasks`, `useProjects`, `useObjectives`, `useHabits`, `useNoteSave`, `useInbox` consumen sus repos correspondientes; el último bypass directo (`slashMenuItems.updateNoteType`) se cerró post-QA Inbox+Notas usando `notesRepo.updateMeta`. Excepciones documentadas en [Docs/04-clean-architecture-frontend.md](Docs/04-clean-architecture-frontend.md#excepciones-reconocidas): `useAuth` (auth global transversal) y `useNote` (lectura MVP one-shot).
- **Vite `resolve.dedupe` obligatorio para Firebase Y React** (`firebase`, `@firebase/app`, `@firebase/component`, `@firebase/auth`, `@firebase/firestore`, `react`, `react-dom`). Sin esto, Vite optimizer picks up paquetes desde `extension/node_modules/` (Chrome Extension tiene su propio lockfile) y duplica registros → Firebase `Component auth has not been registered yet`, React `Invalid hook call`. **Reincidente tras CUALQUIER `npm install`** que mueva el lockfile raíz — síntomas aparecen al reiniciar el dev server, no en build producción.
- **`min-w-0 flex-1 truncate` obligatorio** en `<span>` dentro de `<a class="flex">` para que `truncate` funcione. Solo `truncate` sin `min-w-0` deja el child expandirse a content-size.
- **`$USERPROFILE` no expande en cmd.exe** — usa `%USERPROFILE%` (cmd) o `$USERPROFILE` (git bash/PowerShell). Si una herramienta acepta un path literal como argumento (ej. `tauri signer generate -w "$USERPROFILE/..."`), la variable no expandida crea un dir literal `$USERPROFILE/` en el cwd. Ser consciente del shell target cuando se dan comandos con env vars en Windows.
- **`useLayoutEffect` (no `useEffect`) cuando el setState ES la fuente que activa una clase `animate-in` pre-paint.** Cualquier componente que monta tras un cambio reactivo (toggle de prop, snapshot Firestore, breakpoint cross-thresh) y recibe una clase de animación condicional vía state debe disparar ese setState ANTES del paint. Con `useEffect` el componente hace paint sin clase y la recibe ~30ms después → blip visual perceptible donde el elemento aparece en posición final y luego retro-anima. `useLayoutEffect` causa un re-render sync pre-paint, garantizando que el primer frame visible ya tenga la clase y la animación dispare desde ahí. Detectado en F32.3 sampling DOM cada 30ms con Playwright. Aplicable a cualquier futura swap-anim de chrome global (sidebar/TopBar alterno, tabs swipe, drawer slide, modal entry) que distinga mount inicial de toggle interactivo. Patrón vivo en [src/app/layout.tsx](src/app/layout.tsx).
- **Animation flags (justMounted, isExiting, etc.) deben persistir en state durante toda la duración de la animación, no derivarse de comparaciones instantáneas (ref + 1-render-only).** Cuando una clase CSS (`animate-in slide-in-from-X`, `animate-out`) se condiciona a un flag de "estoy montando/saliendo ahora", el flag debe sobrevivir re-renders del parent mid-animación. Patrón válido: state + `setTimeout` matching `durationMs` que limpia el flag tras la animación. Anti-patrón: `useRef` que se actualiza en `useEffect` post-paint y se compara contra el render actual — el segundo render ya no tiene el flag y la clase se cae mid-vuelo, causando snap visual a translateX(0). Complementa la lección `useLayoutEffect` (la setState debe correr ANTES del paint inicial); aquí la regla es sobre la VENTANA de vida del flag tras ese paint inicial. Detectado en F35.1 cuando la propuesta inicial useRef + useEffect post-paint causaba el snap visual; resuelto con state-based + setTimeout. Aplicable a cualquier hook futuro de transición animada (modal entry, drawer slide, tab swap, swap chrome) que use clases CSS condicionales en lugar de Web Animations API. Patrón vivo en [src/hooks/useMountedTransition.ts](src/hooks/useMountedTransition.ts).
- **Schema versioning del cache local TinyBase + preferences** (post-F36.F8 — v0.2.4+). Al cambiar shape de Row en cualquier `src/stores/*.ts` (agregar/eliminar/renombrar cell o cambiar default) bumpear `TINYBASE_SCHEMA_VERSION` en [src/lib/tinybase.ts](src/lib/tinybase.ts). Al cambiar `UserPreferences` en [src/types/preferences.ts](src/types/preferences.ts) bumpear `PREFERENCES_SCHEMA_VERSION` en [src/lib/preferences.ts](src/lib/preferences.ts). Versionado independiente entre capas. **F8 NO migra datos** — para changes de tipo de cell (no solo agregar nuevos), correr job de migración ANTES del bump. Detalle (treatment asimétrico de "ausente", trade-off purge-on-mismatch, race multi-window) en `Spec/ESTADO-ACTUAL.md` sección "TinyBase + Firestore sync".
- **Firebase Console bloquea el callbackUri / templates de email tras varios reintentos (`EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED`).** Editar el "Customize action URL" o los templates de email (Authentication → Templates) puede quedar bloqueado **server-side** tras varios guardados fallidos, devolviendo `EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED`. **Solo lo destraba el soporte de Firebase** (engineering team vía soporte de Firebase), **NO Google Cloud Support** — el plan Blaze es facturación, no incluye soporte técnico de GCP. Es config server-side, no código: una vez destrabado aplica **sin redeploy**. Detectado en SPEC-54 (F8 callbackUri lo configuró el engineering team de Firebase; F9 copy quedó en curso vía soporte). **Aprendizaje extra:** aunque el soporte destrabe la edición, los templates de Firebase **sanitizan el styling a propósito** (anti-spam, confirmado en docs) → el diseño HTML **elaborado** de emails **no es alcanzable** vía templates de Firebase; requiere un provider propio (Resend/SendGrid + CF + `generateLink` del Admin SDK + dominio verificado).
- **QA de action-codes (verify/reset) vía Admin SDK + ADC — NUNCA una SA key commiteada.** Para probar `/auth/action` (o cualquier flujo que consuma un `oobCode`) sin enviar emails reales: un script Node con `firebase-admin` genera links con `generateEmailVerificationLink`/`generatePasswordResetLink` contra una **cuenta descartable**, se extrae el `oobCode` del query y se visita `localhost:…/auth/action?mode=…&oobCode=…` (el code es válido **cross-origin** — el SDK pega al backend con su apiKey, así que sirve en localhost antes de tocar Console). Autenticar con **ADC** (`gcloud auth application-default login`, proyecto `secondmindv1`) — efímero, sin key en disco. Si se usa una **SA key temporal** en vez de ADC: guardarla **fuera del repo**, **NUNCA** commitear la key ni su ruta (tampoco en docs), y al terminar el QA **revocarla** en GCP Console (IAM & Admin → Service Accounts → Keys) + borrar el archivo. Borrar la cuenta descartable al cierre. Patrón de SPEC-54.
- **El scheme del origin en los webviews nativos es invariante PERMANENTE — nunca cambiarlo o se huérfana todo el storage local (data loss masivo).** Tauri `app.windows[].useHttpsScheme` (hoy `false` → origin `http://tauri.localhost`) y Capacitor `server.androidScheme` (hoy `'https'` → origin `https://localhost`) definen el **origin** del WebView. Cambiar cualquiera de los dos en un release futuro **reubica la carpeta de IndexedDB** (incl. la cache persistente de Firestore) **y huérfana todo el `localStorage` del origin anterior** (theme, install-prompt, sidebar-hint, y crítico `secondmind:tinybase:schemaVersion` → re-dispara `migrateTinyBaseSchemaIfNeeded`) = **data loss masivo en todos los desktops/móviles instalados** (Tauri [#11252](https://github.com/tauri-apps/tauri/issues/11252); en Capacitor cambiar `androidScheme` = "desplegar en otro dominio"). Congelados explícitos en SPEC-56 F3 (verify-first: el valor se leyó del origin real del build de prod antes de fijarlo). Si alguna vez hay que cambiarlos, leer el origin actual primero y planear migración del storage. Aplica a cualquiera que toque config nativa, **independiente de Firestore**.

## Estado de features

Lista de fases completadas + features, gotchas por dominio, decisiones arquitectónicas vigentes y dependencias con historia → `Spec/ESTADO-ACTUAL.md`. Para detalle de una feature específica, seguir el pointer desde ahí a `Spec/features/SPEC-feature-N-*.md`.

When compacting, preserve: current phase, modified files list, pending tasks, and any architectural decisions made during the conversation.
