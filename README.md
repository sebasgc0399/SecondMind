# SecondMind

Sistema de productividad y conocimiento personal construido desde código. Combina ejecución (tareas, proyectos, hábitos) con conocimiento vivo (notas atómicas Zettelkasten, links bidireccionales, grafo, AI copilot).

---

## Qué es

SecondMind es un "segundo cerebro" digital: una app para capturar ideas sin fricción, procesarlas en notas atómicas interconectadas, y usar ese conocimiento para alimentar proyectos, decisiones y hábitos diarios.

El proyecto nace de la experiencia de usar Notion como Segundo Cerebro y detectar sus límites: las notas entran y mueren, no hay conexiones entre ideas, la captura es lenta, y el inbox se acumula porque procesarlo es tedioso. SecondMind intenta resolver eso desde código, con un stack optimizado para instantaneidad, offline-first, y AI como copiloto.

Los principios de diseño, la teoría detrás (CODE de Tiago Forte, Zettelkasten), el modelo de datos y los flujos UX están documentados en [`Docs/`](Docs/).

## Stack

- **UI:** React 19 + TypeScript strict + Vite + Tailwind CSS v4 + shadcn/ui (sobre Base UI)
- **Estado:** TinyBase v8 con custom persister Firestore
- **Editor:** TipTap (ProseMirror) con extensiones custom (wikilinks `@`, slash commands `/`)
- **Búsqueda:** Orama (FTS client-side)
- **Backend:** Firebase — Firestore + Cloud Functions v2 + Auth + Hosting
- **AI:** Claude Haiku (inbox processing + auto-tagging notas) + OpenAI embeddings

## Estado actual

La fuente primaria de estado y arquitectura vigente es [`Spec/ESTADO-ACTUAL.md`](Spec/ESTADO-ACTUAL.md). Cada fase tiene su SPEC en [`Spec/`](Spec/); cada feature post-MVP en [`Spec/features/`](Spec/features/).

- **Fase 0 — Setup** ✅ Proyecto compilando, auth con Google, sync TinyBase ↔ Firestore, deploy a Firebase Hosting
- **Fase 0.1 — Toolkit** ✅ MCPs (Firebase, Context7, Playwright, Brave Search), skills de frontend/UX, hooks de formato automático (Prettier + ESLint en PostToolUse), protección de la rama main
- **Fase 1 — MVP** ✅ Primera versión usable diariamente. 9 features completas:
  - **F1 · Router:** React Router con layout (sidebar + outlet) y rutas `/`, `/inbox`, `/notes`, `/notes/:noteId`, `/settings`
  - **F2 · Stores:** TinyBase v8 con schemas de notes/links/inbox y custom persister Firestore con `merge: true`
  - **F3 · Quick Capture:** modal global con shortcut `Alt+N`, animación de confirmación, escribe al `inboxStore` sin clasificar
  - **F4 · Editor:** TipTap con StarterKit + Node custom `wikilink` + autocompletado al escribir `[[`. Auto-save con debounce de 2s. El JSON del doc va directo a Firestore; la metadata a TinyBase
  - **F5 · Links bidireccionales:** cada save sincroniza los wikilinks contra la colección `links/` con IDs determinísticos `source__target`. Filtra self-links y actualiza `incomingLinkIds`/`outgoingLinkIds` en ambas notas
  - **F6 · Lista de notas + búsqueda:** vista `/notes` con FTS client-side vía Orama (rebuild on change del `notesStore`), cards con título/snippet/badges/fecha relativa, y botón "Nueva nota"
  - **F7 · BacklinksPanel:** panel lateral en el editor que muestra las notas que apuntan a la actual, con contexto del párrafo. Toggleable, default abierto en desktop y cerrado en mobile. Resuelve títulos frescos haciendo join con `notesStore`
  - **F8 · Vista Inbox:** `/inbox` con lista de items pendientes, acciones "Convertir a nota" y "Descartar". Badge reactivo con el count en el sidebar
  - **F9 · Dashboard:** `/` con saludo contextual (mañana/tarde/noche), botón de captura rápida, card de inbox con los 3 items más recientes y card de notas recientes con las 5 últimas actualizaciones

- **Fase 2 — Ejecución** ✅ La capa de acción. 8 features completas:
  - **F1 · Stores y types:** `tasksStore`, `projectsStore`, `objectivesStore`, `habitsStore` con schemas TinyBase + persister Firestore. Types para las 4 entidades + `HABITS` const con los 14 hábitos hardcoded + `AREAS` map con las 6 áreas PARA. Alinea `TaskStatus` y agrega `ObjectiveStatus` a `common.ts`
  - **F2 · Rutas y sidebar activo:** 5 rutas nuevas (`/tasks`, `/projects`, `/projects/:projectId`, `/objectives`, `/habits`) y activación de los 4 items del sidebar que antes estaban disabled. Active state por prefix match de NavLink
  - **F3 · Tareas:** `/tasks` con tabs Hoy/Pronto/Completadas, creación inline con `Enter`, `TaskCard` con priority badge color-coded (verde/amarillo/naranja/rojo), expand inline para editar descripción/prioridad/proyecto/fecha, y checkbox optimistic vía TinyBase. Tab "Hoy" incluye vencidas en sección separada; tab "Pronto" agrupa por día con `Intl.DateTimeFormat`
  - **F4 · Proyectos:** `/projects` con lista agrupada por status (En progreso → No empezados → En pausa; completados ocultos). `ProjectCard` con count reactivo de tareas pendientes calculado cross-store (`useTable('tasks')` + `useMemo`). Modal de creación con área + prioridad que navega al detalle tras crear
  - **F5 · Detalle de proyecto:** `/projects/:projectId` con header (nombre + selects de status/prioridad), barra de progreso completadas/total, sección Tareas que reusa `TaskCard` con `projectId` pre-asignado, y sección Notas vinculadas con `NoteLinkModal` que reusa `useNoteSearch` de Orama. Vinculación bidireccional client-side `note.projectIds ↔ project.noteIds`
  - **F6 · Objetivos:** `/objectives` con lista agrupada por área. `ObjectiveCard` con progreso agregado (promedio del % de tareas completadas de cada proyecto vinculado), deadline formateado ("faltan N días" / "hoy" / "vencido hace N días"), y expand inline con `<select>` "+ Vincular proyecto..." que dispara el link bidireccional `objective.projectIds ↔ project.objectiveId`
  - **F7 · Habit tracker:** `/habits` con grid semanal 14×7 (14 hábitos × 7 días, lunes inicia la semana). Navegación ← → entre semanas, toggle de hoy/ayer clickeable, días pasados/futuros read-only. Barra de progreso de hoy referida al día real aunque se navegue a otra semana. IDs determinísticos `YYYY-MM-DD` como `rowId` y `docId`, con docs creados implícitamente en el primer toggle
  - **F8 · Dashboard expandido:** reestructura `/` con 5 cards en grid 2×2 + hábitos full-width — `TasksTodayCard` (top 5 tareas de hoy con checkbox funcional), `InboxCard` existente, `ProjectsActiveCard` (proyectos in-progress con count reactivo), `RecentNotesCard` existente, y `HabitsTodayCard` (14 pills toggleables con barra de progreso)

- **Fase 3 — AI Pipeline** ✅ Inteligencia que reduce la friccion de organizar. 6 features completas:
  - **F1 · Cloud Function processInboxItem:** `onDocumentCreated` en `inbox/{itemId}` llama a Claude Haiku (`claude-haiku-4-5-20251001`) con tool use y schema enforcement, escribe campos flat `aiSuggested*` (titulo, tipo, tags, area, resumen, prioridad) al doc. Secret via `defineSecret`. Retry false, timeout 60s, us-central1
  - **F2 · Schema aiResult flat:** reemplaza el placeholder `aiResult: string` del `inboxStore` por 6 campos flat. El hook `useInbox` construye el objeto `aiResult` con gate `aiProcessed && aiSuggestedTitle`. Cadena completa CF -> Firestore -> persister -> store -> mapper verificada
  - **F3 · InboxItem card con sugerencias:** `AiSuggestionCard` con display + edit modes. Muestra tipo/titulo/area/tags/prioridad/resumen sugeridos. Botones Aceptar (crea entidad con overrides) y Editar (expand form inline con selects + input tags comma-separated, parseo al submit). Indicator "Procesando con AI..." para items en flight. Botones fallback "Nota"/"Descartar" siempre visibles. `useInbox` compone `useTasks`/`useProjects` para `convertToTask`/`convertToProject` con `createTask` extendido (acepta `{priority, areaId}` en 1 write)
  - **F4 · Inbox Processor:** ruta `/inbox/process` con vista one-by-one. Snapshot congelado del batch al montar (permite Atras a items ya procesados sin que desaparezcan del array reactivo). `InboxProcessorForm` con draft local reseteado por `key={item.id}`. Read-only variant para items procesados. Progress dots clickeables. Keyboard shortcuts (Enter/Escape/ArrowLeft/ArrowRight). Pantalla done con resumen ("Procesaste N notas, M tareas, X descartados"). Grace de hidratacion dedicado (1500ms) para evitar false empty en full reload
  - **F5 · Command Palette (Ctrl+K):** modal de busqueda global con Orama FTS. Index unificado con campo `_type: 'note' | 'task' | 'project'`, rebuild con debounce 100ms en 3 store listeners. Query vacio muestra recientes (top 5 por `updatedAt` desc, filtra completed/archived) + acciones rapidas estaticas. Keyboard nav completo (arrows + Enter + Escape). Mouse hover sincronizado con keyboard index. Dialog base-ui con animaciones `data-starting-style`/`data-ending-style`
  - **F6 · Cloud Function autoTagNote:** `onDocumentWritten` en `notes/{noteId}` genera hasta 5 tags + resumen con Claude Haiku via tool use y schema enforcement. Guard `aiProcessed || !contentPlain.trim()`. Cambio de `onDocumentCreated` a `onDocumentWritten` para cubrir notas creadas vacias desde el editor (contenido llega en auto-save 2s despues). Fix critico: `convertToNote` setea `aiProcessed: true` cuando hay tags del inbox processor para evitar que F6 sobrescriba

- **Fase 3.1 — Schema Enforcement** ✅ Refactoring de las 2 Cloud Functions de AI para usar tool use de Anthropic (`tool_choice: { type: 'tool' }`) con JSON Schema enforcement en vez de "Responde SOLO JSON" en el prompt. Elimina nulls en campos, `stripJsonFence`, fallbacks manuales, y ~120 lineas de codigo defensivo. Schemas compartidos en `schemas.ts`. Cero cambios en frontend — las CFs siguen escribiendo los mismos campos flat a Firestore.

- **Fase 4 — Grafo + Resurfacing** ✅ El conocimiento vuelve a aparecer. 5 features:
  - **F1 · Knowledge graph:** `/notes/graph` con Reagraph (WebGL sobre Three.js). Nodos = notas, aristas = wikilinks. Filtros por tag/area, zoom, select para navegar al detalle
  - **F2 · Embeddings (CF generateEmbedding):** `onDocumentWritten` en `notes/{noteId}` genera vector 1536 dims con OpenAI `text-embedding-3-small`. Guard por `contentHash` SHA-256 para evitar regeneraciones innecesarias. Persistidos en `users/{uid}/embeddings/{noteId}`
  - **F3 · Notas similares:** panel lateral en el editor con cosine similarity sobre los embeddings cacheados en `useRef` (embeddings NO van a TinyBase por tamaño)
  - **F4 · FSRS spaced repetition:** algoritmo `ts-fsrs` client-side para agendar revisiones de notas. Opt-in via `ReviewBanner` con 4 estados (activar/due/próxima/confirmación). `fsrsDue` en Firestore solo para notas activadas
  - **F5 · Daily Digest:** cards en el dashboard agrupando notas por hubs (tags con más incoming links) + orden determinístico del día via hash `noteId+date`

- **Fase 5 — PWA + Chrome Extension** ✅ Acceso desde donde sea. 2 features:
  - **F1 · PWA instalable:** `vite-plugin-pwa` con `generateSW` + `autoUpdate`, manifest completo, navigateFallback para SPA routing offline, runtimeCaching de Google Fonts, install prompt en el Layout. `useOnlineStatus` (useSyncExternalStore) + `OfflineBadge`. Guards offline solo en features AI (procesar inbox, notas similares); el resto funciona via TinyBase
  - **F2 · Chrome Extension MV3 (`extension/`):** CRXJS 2.4.0 + Vite 8, popup React con captura de selección del tab activo, auth Google via `chrome.identity.getAuthToken` + `signInWithCredential`, SDK lite (`firebase/auth/web-extension` + `firebase/firestore/lite` = 342KB / 105KB gzip), `source: 'web-clip'` con `sourceUrl` limpiado de tracking params

- **Fase 5.1 — Tauri Desktop** ✅ Wrapper nativo Windows. 6 features:
  - **F1 · Scaffold:** Tauri v2.10 integrado al proyecto existente (`src-tauri/`). Consume `dist/` del build Vite. Scripts `tauri:dev` / `tauri:build`. Iconos generados desde `public/pwa-512x512.png`
  - **F2 · System tray + close-to-tray:** icono en la bandeja con menú (Abrir / Captura rápida / Iniciar con Windows / Salir). Click izq toggle main window. Botón X oculta en vez de terminar proceso
  - **F3 · Global shortcut `Ctrl+Shift+Space`:** desde cualquier app abre una ventana frameless `/capture` (480×220 frameless alwaysOnTop) con textarea enfocado. Enter escribe directo a Firestore con `source: 'desktop-capture'`, Escape cierra. No colisiona con `Alt+N` local
  - **F4 · Autostart + window-state:** toggle en el tray registra `HKCU\...\Run\SecondMind`. Main window persiste pos/size; capture siempre centrada (denylist)
  - **F5 · Single-instance + CSP Firebase:** plugin previene procesos duplicados (crítico con autostart). CSP explícito en `tauri.conf.json` permite auth + firestore en release
  - **F6 · OAuth Desktop flow (post-merge fix):** `signInWithPopup` no funciona en Tauri WebView2 (window.open va al browser del sistema, no puede postMessage back). Reemplazado por flow custom con `tauri-plugin-shell` + HTTP listener local en Rust (`src-tauri/src/oauth.rs`), PKCE S256, state CSRF, intercambio code→id_token, `signInWithCredential`. OAuth Client tipo "Desktop app" en Google Cloud Console. `useAuth` detecta `isTauri()` y ramifica
  - Instaladores: `SecondMind_0.2.0_x64_en-US.msi` + `SecondMind_0.2.0_x64-setup.exe` (NSIS) en `src-tauri/target/release/bundle/`

- **Fase 5.2 — Capacitor Mobile (Android)** ✅ Wrapper nativo Android. 5 features:
  - **F1 · Scaffold:** Capacitor 8.3 integrado al proyecto (`android/` Gradle project). `appId com.secondmind.app`, minSdk 24, compileSdk 36, targetSdk 36. `server.androidScheme: 'https'` obligatorio para Firebase Auth en WebView. Scripts `cap:sync` / `cap:run` / `cap:build`
  - **F2 · Auth nativa Google Sign-In:** `@capgo/capacitor-social-login` con bottom sheet nativo de Android. Patrón universal `SocialLogin.login → idToken → GoogleAuthProvider.credential → signInWithCredential`. `MainActivity.java implements ModifiedMainActivityForSocialLoginPlugin` con `onActivityResult` forwarding. `webClientId` = Web Client ID de GCP (compartido con Tauri)
  - **F3 · Share Intent:** `@capgo/capacitor-share-target` recibe texto/URL desde el menú "Compartir" de cualquier app Android. `AndroidManifest.xml` con intent-filter `ACTION_SEND text/*`. `useShareIntent` extrae texto/URL del evento, detecta URLs con regex, llama `quickCapture.open(content, { source: 'share-intent', sourceUrl })`. Reusa el `QuickCaptureProvider` ya montado en el Layout (a diferencia de Tauri `/capture` que es ventana efímera)
  - **F4 · Branding:** ícono adaptive v26+ con VectorDrawable nativo extraído del `public/favicon.svg` (21 paths + translate group para normalizar viewBox), fondo `#171617` matching el logo PWA. Splash screen drawable XML con color sólido `#878bf9` (el `@capacitor/assets generate` ignora `--splashBackgroundColor` y usa gris default). Edge-to-edge via `env(safe-area-inset-*)` en `body`
  - **F5 · APK debug:** `./gradlew.bat assembleDebug` genera `app-debug.apk` (10.6MB) instalable en device físico via `adb install`. SHA-1 del debug keystore registrado en Google Cloud Console para el Android OAuth Client

- **Features 1-15 (marzo-abril 2026)** ✅ Mejoras post-MVP sobre mobile, editor, búsqueda, infra y polish. 15 features completadas:
  - **F1 — Responsive & Mobile UX:** shell con BottomNav + FAB + breakpoints mobile/tablet/desktop
  - **F2 — Editor Polish:** `@` para menciones, slash commands `/` (12 items en 5 categorías), templates Zettelkasten
  - **F3 — Búsqueda Híbrida:** keyword (Orama BM25) + semántica (embeddings cosine), CF callable `embedQuery`
  - **F4 — Progressive Summarization:** 3 niveles de destilación L0/L1/L2/L3 de Tiago Forte sobre TipTap
  - **F5 — Bubble Menu:** toolbar flotante con 6 acciones inline al seleccionar texto
  - **F6 — Theme System:** claro / automático / oscuro, paleta violet oklch hue 285°, script inline anti-flash
  - **F7 — Capture Multi-Monitor:** ventana `/capture` centrada en el monitor del cursor (lógica Rust-side en `tray.rs`)
  - **F8 — Tauri Auto-Updater:** auto-update in-app con tag-based CI, firma ed25519, silent startup check
  - **F9 — Capacitor Auto-Update (Android):** mismo flujo tag-based para APK vía Firebase App Distribution
  - **F10 — Capa de Repos (`src/infra/repos/`):** factory genérico, 6 repos, hooks −412 LoC, primeros tests Vitest
  - **F11 — Store Isolation + Gating:** `useStoreHydration` signal real, `delTable` pre-init, cierra cross-user leak
  - **F12 — Persister Diff-Based:** consume `changes` nativo de TinyBase v8, O(N) → O(cambios) en write amplification
  - **F13 — GitHub Actions Node 24:** migración `actions/*@v5` + `tauri-action@v0.6.2`, prerelease guard RC/beta
  - **F14 — Editor UX Polish:** paste sanitization, slash menu con `@floating-ui/dom` flip dinámico, `padding-bottom: 50vh`
  - **F15 — UI Polish Post-Dogfooding:** scrollbar fantasma, `AuthLoadingSkeleton`, imperativo neutro + tildes

- **Features 16-30 (abril 2026)** ✅ Polish post-dogfooding, AI suggestions persistentes y retry queue end-to-end. 14 features completadas (F25 absorbida en F23):
  - **F16 — Code Block Scroll:** `white-space: pre` + `max-width: 100%` en `<pre>` para evitar que Tailwind v4 Preflight envuelva líneas largas; scroll horizontal preserva indentación en 375px
  - **F17 — Editor Popup Hook Unificado:** `useEditorPopup<TItem>` encapsula slash + wikilink menus con Floating UI (`flip`, `shift`), close-on-scroll document capture deferred y keyboard nav
  - **F18 — Notas Favoritas + Soft Delete:** `isFavorite` + `deletedAt` sentinel `0` (TinyBase no soporta null), cluster top-right en `NoteCard` + `ConfirmDialog`, favoritas anclan al tope sin query
  - **F19 — Papelera con Auto-Purga:** segmento 3 tabs en `/notes`, `trashAutoPurgeDays` configurable, primera CF scheduled `autoPurgeTrash` y cleanup cascada vía `onNoteDeleted` (embeddings + links bidireccionales)
  - **F20 — Search en Papelera + `defaultNoteType`:** búsqueda por substring en los 3 tabs (Orama excluye borradas) y preferencia de tipo default (la preferencia se revertió en F21)
  - **F21 — `aiSummary` Fleeting Default:** toda nota nace `'fleeting'` (Zettelkasten flow) y se surfacea `aiSummary` huérfano como segunda línea en `NoteCard` con itálica + Sparkles violet
  - **F22 — Distill Levels Discoverability:** badge L0 visible dashed violet, popover auto-abre primer mount (`distillIntroSeen`), banner ascendente per-nivel 3s, copy L3 reformulado a "tu yo del futuro"
  - **F23 — AI Suggestions:** banner contextual en editor con accept/dismiss, AI server-side via `autoTagNote` extendida (prompt caching `ephemeral`) + heurística client-side, `arrayUnion` con bypass `updateDoc`. Absorbió F25 del roadmap
  - **F24 — FSRS Widget Mejorado:** `ReviewCard` separado de hubs con copy "Te toca/Te tocan N", botón "Ver todas las due" cuando >5, tab "Por revisar" en `/notes` con search local + deep-link `?filter=review`
  - **F26 — Inbox Batch + Confidence:** CF `processInboxItem` devuelve `confidence: 0..1`, UI agrupa items en buckets "Alta confianza ≥0.85" / "Revisar", botón `Aceptar N items` con batch-accept por tipo y badge % verde/ámbar por item
  - **F27 — Cleanup Deuda QA:** borra campo muerto `relatedNoteIds`, separa `setTimeout` de `batchStatus` en `useEffect` propio (patrón canónico F22), guard `existingDoc.exists` en `generateEmbedding` para limpiar embeddings stale cuando `contentPlain` queda vacío
  - **F28 — `saveContent` Retry/Rollback:** retry queue in-memory con backoff `[1s, 2s, 4s]` × 4 attempts, `SaveStatus` 5 estados via `useSyncExternalStore`, banner top-of-page con `[Reintentar / Descartar / Copiar contenido]`, listeners `beforeunload` + `online` para flush + recovery, Tauri close-to-tray con timeout 2s
  - **F29 — Retry Queue al Factory Entero:** `RepoConfig<Row>` parametrizado con `queue?: SaveQueue<Partial<Row>>`, 7 singletons (`saveContentQueue` + 6 metas por entidad), `<PendingSyncIndicator />` global en sidebar/header con popover per-entity counts, sign-out mid-retry guard, `clear()` separado de `dispose()` para test isolation
  - **F30 — Retry Queue en los Creates:** 4 singletons dedicados (`saveNotesCreatesQueue`, `saveTasksCreatesQueue`, `saveProjectsCreatesQueue`, `saveObjectivesCreatesQueue`), `RepoConfig.createsQueue?` opcional, `useNote` via `useSyncExternalStore` + `setDoc(merge:true)` en `saveContent` (D9) para tolerar `not-found` durante create-pending

  Detalle técnico, decisiones y gotchas: [`Spec/ESTADO-ACTUAL.md`](Spec/ESTADO-ACTUAL.md) y [`Spec/features/SPEC-feature-*.md`](Spec/features/).

**Ya se puede usar a diario:** capturar ideas desde cualquier app con `Ctrl+Shift+Space` (desktop) o `Alt+N` (web/in-app), web clip desde Chrome via extensión, share intent desde cualquier app Android al Quick Capture, procesar inbox con sugerencias AI agrupadas por confianza (`Aceptar N` para los items ≥0.85), buscar globalmente con `Ctrl+K`, escribir notas con wikilinks + backlinks + auto-tags + resumen AI + sugerencias contextuales accept/dismiss en el editor, marcar favoritos y mandar a papelera con auto-purga configurable, explorar el grafo de conocimiento, ver notas similares por embeddings, agendar revisiones con FSRS, organizar tareas/proyectos/objetivos/hábitos, y todo offline gracias a TinyBase + PWA + retry queue end-to-end (creates + updates + saveContent) con `<PendingSyncIndicator />` global cuando hay writes pendientes.

## Setup local

Requisitos:

- Node.js 22 o superior (Capacitor Android lo requiere; Tauri funciona con 20)
- Un proyecto Firebase propio con Auth (Google sign-in) y Firestore habilitados
- OAuth Clients configurados en Google Cloud Console: Web (Vite), Android (SHA-1 del keystore para Capacitor) y Desktop (para el flow custom de Tauri)
- Opcional para el wrapper desktop: Rust 1.70+ (`rustup`) y MSVC Build Tools con workload "Desktop development with C++" en Windows
- **Windows developers:** ver [`Docs/SETUP-WINDOWS.md`](Docs/SETUP-WINDOWS.md) para patches one-time de entorno (TS LSP, symlinks `ui-ux-pro-max`, Firebase MCP, Capacitor Android, Cargo)

Pasos:

```bash
# Clonar e instalar
git clone https://github.com/sebasgc0399/SecondMind.git
cd SecondMind
npm install

# Configurar variables de entorno
cp .env.example .env.local
# Editar .env.local con las credenciales de tu proyecto Firebase

# Desplegar las security rules de Firestore (primera vez)
npx firebase login
npx firebase use --add   # seleccionar tu proyecto
npm run deploy:rules

# Correr en desarrollo
npm run dev
```

## Comandos

```bash
npm run dev               # Servidor de desarrollo (Vite)
npm run build             # Build de producción (tsc + vite build)
npm run lint              # ESLint
npm test                  # Vitest (unit tests — repos, persister, etc.)
npm run preview           # Preview del build local
npm run deploy            # Build + deploy a Firebase Hosting
npm run deploy:rules      # Deploy de Firestore security rules
npm run deploy:functions  # Deploy de Cloud Functions
npm run logs:functions    # Logs de Cloud Functions
npm run tauri:dev         # Abre la app desktop nativa en modo dev (requiere Rust)
npm run tauri:build       # Genera MSI + NSIS en src-tauri/target/release/bundle/
npm run cap:sync          # Build web + sync al proyecto android/
npm run cap:run           # cap run android (requiere Android Studio/adb en PATH)
npm run cap:build         # Build web + sync + gradlew assembleDebug → APK debug
```

## Distribución

- **Web / PWA:** https://secondmind.web.app — instalable desde Chrome/Edge
- **Chrome Extension:** código en [`extension/`](extension/) (build separado vía CRXJS)
- **Desktop Windows:** instaladores en `src-tauri/target/release/bundle/{msi,nsis}/` vía `npm run tauri:build`. Auto-update tag-based (F8)
- **Android:** APK debug en `android/app/build/outputs/apk/debug/` vía `npm run cap:build`. Release firmado se distribuye por Firebase App Distribution con el mismo flujo tag-based (F9)

## Documentación

Documentación técnica y de diseño:

- [`Docs/00-fundamentos-segundo-cerebro.md`](Docs/00-fundamentos-segundo-cerebro.md) — principios teóricos (CODE de Tiago Forte, Zettelkasten, 10 principios de diseño)
- [`Docs/01-arquitectura-hibrida-progresiva.md`](Docs/01-arquitectura-hibrida-progresiva.md) — stack completo, modelo de datos Firestore, flujos clave, fases, decisiones
- [`Docs/02-flujos-ux-y-pantallas.md`](Docs/02-flujos-ux-y-pantallas.md) — 14 pantallas con wireframes, 5 flujos de usuario, shortcuts, responsive
- [`Docs/03-convenciones-y-patrones.md`](Docs/03-convenciones-y-patrones.md) — naming, componentes React, TinyBase, TypeScript, Tailwind, errores, Git
- [`Docs/04-clean-architecture-frontend.md`](Docs/04-clean-architecture-frontend.md) — Clean Architecture en 4 capas, factory repos F10, excepciones documentadas
- [`Docs/SETUP-WINDOWS.md`](Docs/SETUP-WINDOWS.md) — patches one-time de entorno Windows
- [`design-system/secondmind/MASTER.md`](design-system/secondmind/MASTER.md) — tokens de diseño (paleta, tipografía, anti-patterns)

Las SPECs viven en [`Spec/`](Spec/):

- [`Spec/ESTADO-ACTUAL.md`](Spec/ESTADO-ACTUAL.md) — snapshot consolidado (fuente primaria de estado y arquitectura vigente)
- [`Spec/SPEC-fase-*.md`](Spec/) — canon histórico por fase (0 a 5.2)
- [`Spec/features/SPEC-feature-*.md`](Spec/features/) — canon histórico por feature (1 a 15)
- [`Spec/drafts/DRAFT-*.md`](Spec/drafts/) — discovery pre-SPEC temporal (se eliminan al convertirse en SPEC formal)
