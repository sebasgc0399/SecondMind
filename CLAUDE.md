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
- **Claude Haiku con tool use no produce nulls** — Fase 3.1 migró las CFs a tool use con schema enforcement (`tool_choice: { type: 'tool' }`). Los `enum` y `required` del JSON Schema garantizan valores válidos a nivel de decoder. Ya no se necesitan fallbacks manuales ni `stripJsonFence`.
- **`isInitializing` de hooks (200ms) no es suficiente para snapshots de datos en full reload.** Los persisters pueden tardar más en hidratar el store. Para decisiones de "¿hay datos o no?" (ej: batch del InboxProcessor, redirect por existencia de row), usar un grace dedicado más largo (1500ms) o observar `items.length > 0` como signal real. Mismo patrón que `redirectGraceExpired` de ProjectDetailPage de Fase 2.
- **`onDocumentCreated` no cubre notas creadas vacías desde el editor.** Las notas desde `/notes` se crean con `contentPlain: ''` y el texto llega en el auto-save (2s después). `autoTagNote` usa `onDocumentWritten` con guard `aiProcessed` para procesar en el primer write con contenido sin re-procesar en updates subsiguientes.
- **Notas del inbox processor necesitan `aiProcessed: true` al crear** si vienen con tags aceptados del AI. Sin esto, `autoTagNote` sobrescribiría los tags que el usuario aceptó de la sugerencia del inbox. `convertToNote` en `useInbox.ts` setea `aiProcessed: !!(overrides?.tags?.length > 0)`.
- **Ruta `notes/graph` ANTES de `notes/:noteId` en router.tsx.** Si va después, React Router captura "graph" como noteId. Orden crítico en flat routes con parámetros dinámicos.
- **Empty state con filtros activos: no hacer early return.** Renderizar siempre los controles de filtro y diferenciar mensaje: "sin datos" vs "filtros sin resultados" con botón de reseteo. Aplica a cualquier vista con filtros.
- **Embeddings NO van en TinyBase.** Vectores de 1536 floats (~6KB c/u) demasiado grandes para store in-memory. Carga on-demand desde Firestore con cache en `useRef`.
- **FSRS opt-in requiere botón explícito.** Sin "Activar revisión periódica", la feature es invisible. ReviewBanner tiene 4 estados: activar, due, próxima fecha, confirmación post-review.
- **`generateEmbedding` usa `contentHash` como guard, no `aiProcessed`.** Los embeddings deben regenerarse cuando el contenido cambia, a diferencia de autoTagNote que solo procesa una vez.
- **`vite-plugin-pwa` requiere `--legacy-peer-deps` con Vite 8.** El peerDependency de v1.2.0 solo lista hasta Vite 7, pero funciona correctamente con Vite 8.
- **`maximumFileSizeToCacheInBytes: 4MB` en workbox config.** El bundle principal es ~2.7MB por Reagraph/Three.js. Sin este override, Workbox rechaza precachear el JS principal. Cuando se haga code-splitting del grafo, se puede bajar o eliminar.
- **CRXJS exporta `{ crx }` como named export**, no default. `import { crx } from '@crxjs/vite-plugin'`, no `import crx from`.
- **Chrome Extension usa `firebase/firestore/lite`** (no el SDK completo). Solo necesita `setDoc` para un write. Reduce bundle de ~120KB a ~30KB gzip.
- **Chrome Extension auth: `firebase/auth/web-extension`** (no `firebase/auth`). Obligatorio para MV3 service worker context.
- **Tauri v2 `tray-icon` feature obligatorio en Cargo.toml.** `tauri = { version = "2.10", features = ["tray-icon"] }`. Sin esta feature, `tauri::tray::TrayIconBuilder` no existe — el módulo `tray` está gated.
- **Ventana `/capture` es ruta top-level fuera de Layout.** Tauri abre segunda WebView con `url: "/capture"`. Debe renderizar en <200ms, por lo que no puede cargar sidebar + stores de TinyBase. Escribe directo a Firestore (patrón extension) con `source: 'desktop-capture'`.
- **Tauri global shortcut en JS (no Rust).** `@tauri-apps/plugin-global-shortcut.register()` + callback llama `getAllWebviewWindows()` → find `capture` → `show()+setFocus()`. Siempre `isRegistered() + unregister()` antes de `register()` en el useEffect para evitar duplicados por HMR.
- **Tauri close-to-tray en JS via `onCloseRequested`.** Hook `useCloseToTray` se monta en `main.tsx` vía `TauriIntegration` wrapper → se ejecuta en cada WebView (main y capture).
- **Single-instance plugin es obligatorio si hay autostart.** Sin él, autostart + click manual duplica procesos, el segundo falla al registrar el shortcut global.
- **Window-state plugin con `.with_denylist(&["capture"])`** para que la ventana efímera siempre abra centrada. Main persiste pos/size automáticamente.
- **Capabilities Tauri v2 NO soportan wildcards.** Usar `core:tray:default`, `core:menu:default`, `core:window:allow-*` enumerado. Nada de `core:tray:*`.
- **Capabilities separadas por ventana.** `default.json` (main, con tray/menu/global-shortcut/autostart) + `capture.json` (capture, solo window show/hide/focus). Principio de mínimo privilegio.
- **CSP explícito en `tauri.conf.json` para Firebase.** `connect-src` incluye `*.googleapis.com *.firebaseio.com wss://*.firebaseio.com identitytoolkit auth`; `frame-src` incluye `*.firebaseapp.com accounts.google.com` para el popup de Google signIn en release.
- **IDE marca permissions "not accepted" tras agregar plugin Tauri.** El schema `src-tauri/gen/schemas/desktop-schema.json` se regenera en `cargo check`/`build`. Correr uno y recargar la IDE.
- **Global shortcut usado: `Ctrl+Shift+Space`.** Cero conflictos en Windows (Chrome no lo usa; VS Code solo con editor enfocado para parameter hints). El `Alt+N` local sigue intacto para la web app.
- **`--legacy-peer-deps` también para `@tauri-apps/*`.** Mismo issue con Vite 8 que vite-plugin-pwa.
- **Capacitor 8: `server.androidScheme: 'https'` obligatorio.** Sin esto Firebase Auth rechaza el WebView por origen HTTP. Es default en Cap 8 para apps nuevas pero explícitamente en config.
- **Google Sign-In Android: `@capgo/capacitor-social-login` con `MainActivity.java implements ModifiedMainActivityForSocialLoginPlugin`.** El plugin intercepta el intent result via `onActivityResult` forwarding a `SocialLoginPlugin.handleGoogleLoginIntent`. Sin esto, la promesa de login queda huérfana. `webClientId` = Web Client ID de GCP (compartido con Tauri), NO el Android Client ID.
- **Ícono Android: VectorDrawable desde SVG source.** `@capacitor/assets generate` procesa el PNG para adaptive icon v26+ con fg/bg separados y distorsiona logos con diseño específico. Solución: copiar los `<path d="">` del `favicon.svg` a `<path android:pathData="">` del VectorDrawable XML (formatos compatibles), `<group translateX/Y>` para normalizar el viewBox. Background sólido `@color/ic_launcher_background`.
- **Capacitor CLI `cap run android` falla en Windows por `gradlew` sin `.bat`.** Workaround: `cd android && ./gradlew.bat assembleDebug` + `adb install` + `adb shell am start -n com.secondmind.app/.MainActivity`. Requiere `JAVA_HOME` + `ANDROID_HOME`.
- **Share Intent reusa QuickCaptureProvider (no ruta separada).** En Capacitor la app completa ya está cargada con el provider montado, a diferencia de Tauri `/capture` (ventana efímera). `useShareIntent` llama `quickCapture.open(content, { source, sourceUrl })`.
- **Vite `resolve.dedupe` obligatorio para Firebase.** Sin `dedupe: ['firebase', '@firebase/app', '@firebase/component', '@firebase/auth', '@firebase/firestore']` en `vite.config.ts`, el optimizer picks up paquetes `@firebase/*` desde `extension/node_modules/` y duplica el component registry → `getAuth` falla con `Component auth has not been registered yet`. Si el dev server tira ese error tras un npm install, es este.
- **Breakpoints mobile-first con `useBreakpoint()`.** `mobile <768`, `tablet 768–1023`, `desktop ≥1024`. Hook en `src/hooks/useMediaQuery.ts` usa `useSyncExternalStore` + `matchMedia` (mismo patrón que `useOnlineStatus`). Para decisiones condicionales en JSX (shell, bottom nav, FAB) usar el hook; para layouts internos usar clases Tailwind responsive (`flex-col md:flex-row`).
- **`SidebarContent` exportado desde Sidebar.tsx y reusado por NavigationDrawer.** Mismo árbol de nav items, callback `onNavigate` para cerrar dialog. No duplicar array.
- **HabitGrid sticky column: `th/td:first-child { position: sticky; left: 0; background: var(--background); z-index: 10 }`.** La primera columna (nombre del hábito) queda fija mientras el user scrollea horizontalmente. Wrapper `<div class="overflow-x-auto">` alrededor de la `<table>`. NO migrar a CSS grid.
- **Tap targets ≥44×44: wrapper label para Radix Checkbox.** `<label class="flex h-11 w-11 items-center justify-center">` con el `<input type="checkbox">` h-4 w-4 dentro. El visual queda chico, el hit area cumple accessibility mobile. Mismo patrón para botones pequeños: h-11 w-11 contenedor + icono 16-20px.
- **`grid` en Tailwind sin `grid-cols-1` explícito deja children crecer.** Un `<div class="grid gap-4 lg:grid-cols-2">` con hijos de content muy largo hace que la implicit column auto se estire hasta varios miles de px en mobile. Siempre empezar con `grid-cols-1`: `grid grid-cols-1 gap-4 lg:grid-cols-2`.
- **`min-w-0 flex-1 truncate` es obligatorio** en `<span>` dentro de `<a class="flex">` para que truncate funcione. Solo `truncate` sin min-w-0 deja el child expandirse a content-size.
- **Safe-area insets via CSS vars + `viewport-fit=cover`.** `index.html` tiene `viewport-fit=cover`, `src/index.css` declara `--sai-top/bottom/left/right` en `:root`. Body aplica `padding-left/right`; MobileHeader usa `padding-top: var(--sai-top)`; BottomNav/FAB usan `--sai-bottom`. Granular, no duplicado.

## Fases de desarrollo

- **Fase 0 (Setup) ✅:** Vite + React 19 + TS + Tailwind + Firebase + TinyBase + estructura base
- **Fase 0.1 (Toolkit) ✅:** MCPs + plugins + hooks + VS Code configurados. Ver `Spec/SPEC-fase-0.1-toolkit.md`
- **Fase 1 (MVP) ✅:** Quick Capture + TipTap editor con WikiLinks + Lista de notas + Backlinks + Inbox + Dashboard minimo
- **Fase 2 (Ejecucion) ✅:** Tareas + Proyectos + Objetivos + Habit Tracker. Ver `Spec/SPEC-fase-2-ejecucion.md`
- **Fase 3 (AI) ✅:** Claude Haiku inbox processing (CF processInboxItem) + schema aiResult flat + InboxItem card con sugerencias + InboxProcessor one-by-one + Command Palette (Ctrl+K) con Orama FTS global + auto-tagging notas (CF autoTagNote). Ver `Spec/SPEC-fase-3-ai-pipeline.md`
- **Fase 3.1 (Schema Enforcement) ✅:** Tool use con JSON Schema enforcement en ambas CFs. Elimina stripJsonFence, fallbacks null, código defensivo de parsing. Schemas compartidos en `schemas.ts`. Ver `Spec/SPEC-fase-3.1-ai-provider.md`
- **Fase 4 (Grafo + Resurfacing) ✅:** Knowledge graph (Reagraph WebGL), CF generateEmbedding (OpenAI), filtros del grafo, notas similares (cosine similarity), FSRS resurfacing (ts-fsrs), Daily Digest (client-side). Ver `Spec/SPEC-fase-4-grafo-resurfacing.md`
- **Fase 5 (PWA + Extension) ✅:** PWA instalable (vite-plugin-pwa, manifest, SW offline, install prompt), offline support (navigateFallback, runtimeCaching, useOnlineStatus, OfflineBadge, guards AI), Chrome Extension MV3 (CRXJS, popup React, captura seleccion, auth chrome.identity + Firebase, write a inbox con firestore/lite). Ver `Spec/SPEC-fase-5-pwa-extension.md`
- **Fase 5.1 (Tauri Desktop) ✅:** wrapper nativo Windows con system tray (close-to-tray, menu con Abrir/Captura/Autostart/Salir), global shortcut `Ctrl+Shift+Space` desde cualquier app → ventana frameless `/capture` que escribe directo a Firestore, single-instance plugin, window-state plugin con denylist capture, autostart opcional con CheckMenuItem toggle, CSP Firebase explícito. Build genera MSI + NSIS. Ver `Spec/SPEC-fase-5.1-tauri-desktop.md`
- **Fase 5.2 (Capacitor Mobile Android) ✅:** wrapper nativo Android con Google Sign-In nativo (bottom sheet via `@capgo/capacitor-social-login`), Share Intent que pre-llena Quick Capture desde el menú "Compartir" de cualquier app (via `@capgo/capacitor-share-target`), adaptive icon VectorDrawable extraído del SVG del PWA (match exacto del branding), splash screen purple `#878bf9`, edge-to-edge via `env(safe-area-inset-*)`. Patrón de auth universal: `SocialLogin.login → idToken → signInWithCredential`. QuickCaptureProvider extendido con `open(content?, { source?, sourceUrl? })` + `pendingMetaRef` para threadear source hasta `save()`. Ver `Spec/SPEC-fase-5.2-capacitor-mobile.md`
- **Feature 1 (Responsive & Mobile UX) ✅:** shell responsive con breakpoints `mobile <768` / `tablet 768–1023` / `desktop ≥1024`. Hook `useBreakpoint()` + `useMediaQuery()` con `useSyncExternalStore` + `matchMedia`. Mobile: MobileHeader + BottomNav (Dashboard/Notas/Tareas/Inbox/Más) + FAB para Quick Capture + NavigationDrawer. Tablet: Sidebar collapsed 64px iconos + hamburger → NavigationDrawer. Desktop: idéntico al previo. Tap targets ≥44×44 (TaskCard checkbox label wrapper, HabitGrid cells h-11 w-11), HabitGrid sticky column via `th/td:first-child`, `viewport-fit=cover`, safe-area vars granulares, QuickCapture con botones "Cancelar/Guardar" en mobile (hints de teclado ocultos). Ver `Spec/features/SPEC-feature-1-responsive-mobile.md`.

When compacting, preserve: current phase, modified files list, pending tasks, and any architectural decisions made during the conversation.
