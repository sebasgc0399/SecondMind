# Estado Actual — SecondMind (Snapshot consolidado)

> Última actualización: Feature 15 UI polish post-dogfooding (Abril 2026)
> Snapshot de arquitectura vigente, gotchas por dominio, patrones, deps clave.
> Se actualiza al cerrar cada feature con la regla de escalación de CLAUDE.md:
> gotchas nacen en SPEC → suben acá si aplican a >1 feature → suben a CLAUDE.md si son universales.
> Nunca se duplica entre niveles.

---

## Fases completadas

- **Fase 0 — Setup base:** Vite + React 19 + TS strict + Tailwind v4 + Firebase + TinyBase v8.
- **Fase 0.1 — Toolkit:** MCPs (Firebase, Context7, Playwright, Brave), Prettier/ESLint hooks, protección `main` vía PreToolUse. Ver [`Spec/SPEC-fase-0.1-toolkit.md`](features/../SPEC-fase-0.1-toolkit.md).
- **Fase 1 — MVP:** Quick Capture (Alt+N), TipTap editor con wikilinks, backlinks, Orama FTS, inbox, dashboard mínimo.
- **Fase 2 — Ejecución:** tareas con prioridad/fecha, proyectos con progreso, objetivos con deadline, habit tracker semanal. Ver [`SPEC-fase-2-ejecucion.md`](SPEC-fase-2-ejecucion.md).
- **Fase 3 — AI Pipeline:** CF `processInboxItem` + `autoTagNote` con Claude Haiku, InboxProcessor one-by-one, Command Palette (Ctrl+K) con Orama FTS global. Ver [`SPEC-fase-3-ai-pipeline.md`](SPEC-fase-3-ai-pipeline.md).
- **Fase 3.1 — Schema Enforcement:** tool use con JSON Schema en ambas CFs, eliminó nulls/stripJsonFence/fallbacks. Ver [`SPEC-fase-3.1-ai-provider.md`](SPEC-fase-3.1-ai-provider.md).
- **Fase 4 — Grafo + Resurfacing:** knowledge graph (Reagraph WebGL), CF `generateEmbedding` (OpenAI), notas similares (cosine), FSRS spaced repetition, Daily Digest. Ver [`SPEC-fase-4-grafo-resurfacing.md`](SPEC-fase-4-grafo-resurfacing.md).
- **Fase 5 — PWA + Extension:** PWA instalable (manifest, SW offline, install prompt), Chrome Extension MV3 (CRXJS, auth `chrome.identity`, write a inbox via `firestore/lite`). Ver [`SPEC-fase-5-pwa-extension.md`](SPEC-fase-5-pwa-extension.md).
- **Fase 5.1 — Tauri Desktop:** wrapper nativo Windows con system tray (close-to-tray, autostart), global shortcut `Ctrl+Shift+Space`, ventana frameless `/capture`, single-instance, window-state con denylist capture. Build MSI + NSIS. Ver [`SPEC-fase-5.1-tauri-desktop.md`](SPEC-fase-5.1-tauri-desktop.md).
- **Fase 5.2 — Capacitor Mobile (Android):** Google Sign-In nativo (`@capgo/capacitor-social-login`), Share Intent (`@capgo/capacitor-share-target`), adaptive icon VectorDrawable desde SVG, splash purple, edge-to-edge via `env(safe-area-inset-*)`. Ver [`SPEC-fase-5.2-capacitor-mobile.md`](SPEC-fase-5.2-capacitor-mobile.md).
- **Feature 1 — Responsive & Mobile UX:** shell responsive con breakpoints `mobile <768` / `tablet 768–1023` / `desktop ≥1024`. BottomNav + FAB + NavigationDrawer en mobile, Sidebar collapsed en tablet. Ver [`features/SPEC-feature-1-responsive-mobile.md`](features/SPEC-feature-1-responsive-mobile.md).
- **Feature 2 — Editor Polish:** `@` como trigger de menciones (reemplaza `[[`), slash commands `/` con 12 items en 5 categorías, templates Zettelkasten Literature/Permanent. Ver [`features/SPEC-feature-2-editor-polish.md`](features/SPEC-feature-2-editor-polish.md).
- **Feature 3 — Búsqueda Híbrida:** `/notes` combina keyword (Orama BM25 instant) con semántica (embeddings + cosine client-side, debounced 500ms). Primera CF callable del proyecto (`embedQuery`). Ver [`features/SPEC-feature-3-busqueda-hibrida.md`](features/SPEC-feature-3-busqueda-hibrida.md).
- **Feature 4 — Progressive Summarization:** 3 niveles de destilación de Tiago Forte sobre TipTap. L0 sin marcas → L1 bold → L2 highlight (`Ctrl+Shift+H`) → L3 resumen ejecutivo. Badge L0/L1/L2/L3 con popover contextual. Ver [`features/SPEC-feature-4-progressive-summarization.md`](features/SPEC-feature-4-progressive-summarization.md).
- **Feature 5 — Bubble Menu + Link:** toolbar flotante al seleccionar texto con 6 botones inline (Bold/Italic/Strike/Code/Highlight/Link). Link ya venía en StarterKit v3, solo faltaba UI. Ver [`features/SPEC-feature-5-bubble-menu.md`](features/SPEC-feature-5-bubble-menu.md).
- **Feature 6 — Theme System + Paleta Violet:** 3 modos (Claro/Automático/Oscuro) con paleta oklch violet desaturada hue 285°, script inline anti-flash, `useTheme` con `useSyncExternalStore`. Default `auto`. Ver [`features/SPEC-feature-6-theme-system.md`](features/SPEC-feature-6-theme-system.md).
- **Feature 7 — Capture Multi-Monitor:** ventana `/capture` aparece centrada en el monitor del cursor. Lógica unificada Rust-side en `tray.rs::show_capture`, compartida por shortcut y tray menu. Drag-from-header revertido (bug tao#3610 en cross-DPI drag). 3 rondas de fix documentadas. Ver [`features/SPEC-feature-7-multi-monitor-capture.md`](features/SPEC-feature-7-multi-monitor-capture.md).
- **Feature 8 — Tauri Auto-Updater:** auto-actualización in-app con tag-based CI en GitHub Actions. Hook `useAutoUpdate` con startup silent check + trigger manual desde tray y Settings. Firma ed25519 vía `tauri-plugin-updater` + `-process` + `-dialog`. 3 rondas de fix (createUpdaterArtifacts schema, tag prematuro, env vars CI). Ver [`features/SPEC-feature-8-tauri-auto-updater.md`](features/SPEC-feature-8-tauri-auto-updater.md).
- **Feature 9 — Capacitor Auto-Update (Android):** mismo flujo tag-based que F8 pero para APK Android vía Firebase App Distribution. Job `release-capacitor` paralelo a `release-tauri` en el mismo workflow. `versionName`/`versionCode` derivados del tag via Gradle props `-P`, keystore + `google-services.json` inyectados via secrets base64. 4 rondas de fix en CI (Node 22, chmod gradlew, JDK 21, verde). Validado E2E: notificación Firebase App Tester → install APK → login Google funciona. Ver [`features/SPEC-feature-9-capacitor-auto-update.md`](features/SPEC-feature-9-capacitor-auto-update.md).
- **Feature 10 — Capa de Repos (`src/infra/repos/`):** factory genérico `createFirestoreRepo` que encapsula el patrón optimistic `setRow/setPartialRow (sync) → setDoc (async)`. 6 repos específicos (tasks, projects, objectives, habits, notes, inbox). Los 6 hooks de entidades delegan toda la persistencia al repo — `grep setDoc\|updateDoc\|addDoc\|deleteDoc src/hooks/` = 0 líneas. Fix colateral: bug de orden invertido en los 5 `createX` queda corregido (setRow ahora sync antes que setDoc async). 5 tests unitarios del factory con Vitest 4.1 (primer testing del proyecto, environment node). Hooks reducidos −412 LoC en agregado (useTasks 139→57, useProjects 123→54, useObjectives 119→51, useHabits 172→110, useNoteSave 170→154, useInbox 245→130). F11 (store isolation + gating) y F12 (persister diff-based) quedan como candidatas del backlog — no resueltas acá. Ver [`features/SPEC-feature-10-repos-layer.md`](features/SPEC-feature-10-repos-layer.md).
- **Feature 11 — Store isolation + gating correcto:** cierra los 2 hallazgos pre-existentes detectados en la auditoría F10. F1: `useStoreInit` llama `store.delTable(tableName)` para las 7 tablas pre-`startAutoLoad` y en cleanup post-`destroy()` — cierra la ventana <100ms del cross-user data leak (delTable con persister snapshot-based no borra Firestore: `Object.entries({}).map() → Promise.all([]) → cero setDoc`). F2: nuevo `useStoreHydration` Context + Provider montado en `layout.tsx` envolviendo `<CommandPaletteProvider>`; `useStoreInit` retorna `{ isHydrating }` derivado de `hydratedUserId !== userId` (patrón derivado evita `setState` dentro del effect al cambiar userId). Anti-StrictMode: `currentUserIdRef` filtra `.then` resolutions de userId obsoleto en double-mount de dev. F3: 8 consumidores migrados al signal real (useTasks, useProjects, useObjectives, useHabits, useInbox, useNoteSearch, useDailyDigest, RecentNotesCard, DailyDigest); `grep INIT_GRACE_MS src/` = 0. El grace de 1500ms en `projects/[projectId]/page.tsx` se reemplaza por condición determinística `!isHydrating && !project`. F4 spike (retry+backoff auth errors) descartado: pre-bias confirmado por auditoría — Firebase Auth refresca tokens y `onSnapshot` se re-arma solo. Ver [`features/SPEC-feature-11-store-isolation-gating.md`](features/SPEC-feature-11-store-isolation-gating.md).
- **Feature 12 — Persister diff-based:** cierra el último hallazgo del backlog F10 (write amplification del persister). El callback `setPersisted` ahora consume el param `changes` nativo de TinyBase v8 — emite `setDoc(merge:true)` solo para las rows tocadas en la transacción. Auditoría con 3 Explore + 1 Plan agents reveló que el snapshot manual del SPEC original era reimplementación de una API existente (~40 LoC innecesarias). `Promise.allSettled` para que un setDoc fallido no aborte los paralelos del mismo tick; rejects reportados a `onIgnoredError` (6º arg de `createCustomPersister`) sin retry — eventual consistency cuando la row vuelva a tocarse. Limitación TinyBase v8 descubierta empíricamente: `changes` NO incluye row IDs eliminados (`delRow` deja `changes = [{},{},1]` vacío), F12 NO propaga deletes — inocuo porque los repos F10 hacen `deleteDoc` directo. 8 tests Vitest cubren add/modify/skip/no-retry/limitación delete. Validado E2E con Playwright + Firebase MCP: toggle hábito persistió, 0 errors/warnings, 7 tablas hacen `setPersisted sin changes — skip` en el primer tick post-load (loop load→write evitado). Ver [`features/SPEC-feature-12-persister-diff-based.md`](features/SPEC-feature-12-persister-diff-based.md).
- **Feature 13 — GitHub Actions Node 24 migration:** migración infra del workflow `.github/workflows/release.yml` antes del switch forzado de GitHub a Node 24 (2026-06-02). `actions/checkout@v4 → @v5`, `actions/setup-node@v4 → @v5`, `actions/setup-java@v4 → @v5` (bump mínimo al major que cumple el constraint, no `@v6` para evitar absorber cambios laterales). Pin hygiene `tauri-action@v0 → @v0.6.2` (de moving pointer a tag inmutable). Prerelease guard dinámico `prerelease: contains(github.ref_name, '-rc' | '-beta')` habilita validación full-pipeline con RC tags sin impactar el updater de usuarios. Validado E2E con `v0.1.8-rc1` desde feature branch: ambos jobs success 8m43s, cero warnings Node 20, `gh release delete --cleanup-tag --yes` para limpieza atómica. Ver [`features/SPEC-feature-13-actions-node24-migration.md`](features/SPEC-feature-13-actions-node24-migration.md).
- **Feature 14 — Editor UX polish:** tres issues UX del editor TipTap surgidos en dogfooding, resueltos 100% client-side sin bump de versión. (1) **Paste sanitization** vía `editorProps.transformPastedHTML` regex que stripea `style`/`class` inline (cubre `"` y `'`) — evita que HTML del clipboard (IDE con syntax highlighting, Google Docs) gane por CSS specificity sobre el estilo del editor. (2) **Slash menu con flip dinámico** — refactor de posicionamiento manual (`position: fixed; top: rect.bottom + 6`) a `@floating-ui/dom` `computePosition` + middlewares `offset/flip/shift`, envuelto en `autoUpdate` para re-cálculo en scroll/resize. `MenuState` guarda la función `clientRect` de TipTap (no snapshot). (3) **`padding-bottom: 50vh`** en `.note-editor .ProseMirror` — spacer CSS que evita el cursor pegado al borde inferior, cero JS. Validado E2E con Playwright: HTML pegado con `<p style="font-size: 32px">` queda como `<p>…</p>`, slash menu flip a 85% viewport (menuTop 440 vs cursor 792), mobile 375px sin desborde. Deploy solo-hosting; auto-updater desktop y WebView mobile recogen la web nueva. Ver [`features/SPEC-feature-14-editor-ux-polish.md`](features/SPEC-feature-14-editor-ux-polish.md).
- **Feature 15 — UI polish post-dogfooding:** cuatro categorías de issues visuales detectadas en tour de Playwright sobre 9 páginas × 2 viewports, resueltos en un pase coordinado 100% client-side. (1) **Scrollbar fantasma** en tabs de Tareas suprimido con `overflow-y-hidden` explícito (Chrome/Edge Windows computan scrollbar vertical implícito cuando `overflow-x` es `auto`/`scroll`). (2) **Shell skeleton pre-auth responsive** (`AuthLoadingSkeleton`) reemplaza `<p>Cargando...</p>` en `layout.tsx`, con variantes desktop (sidebar 240px + main + cards) y mobile (header h-14 + main + bottom nav), alternadas via CSS puro (`hidden md:flex`/`md:hidden`) sin `useBreakpoint`. Skeleton inline minimal en `/login`. (3) **Imperativo neutro + tildes**: 22 strings en 15 archivos, voseo (`Creá`, `Revisá`, `Escribí`, `Intentá`) → imperativo neutro + 10 tildes faltantes (`revisión`, `próxima`, `aún`, `conexión`, `más`, `ningún`, `periódica`, `sincronizarán`, `mañana`, `días`). Greps finales = 0 matches. (4) **H1 duplicado oculto en mobile** con estrategia granular por página: 4 con `hidden md:block/flex` al `<header>` wrapper, 3 con restructure preservando siblings esenciales (habits mes/año, inbox Link Procesar, notes botones grafo+Nueva), y `/notes/graph` agregado tardíamente en commit separado tras descubrir en E2E que `navItems` tiene exact match (devuelve "Grafo", no "Notas" por prefix). Dashboard excepción intencional (saludo personalizado). Ver [`features/SPEC-feature-15-ui-polish.md`](features/SPEC-feature-15-ui-polish.md).

---

## Arquitectura y gotchas por dominio

### TinyBase + Firestore sync

- **Persister con `merge: true` es precondición global.** Sin merge, borra campos fuera del schema TinyBase (como `content` de notas, campos `ai*` de CFs). Aplica a todo persister nuevo.
- **Content largo de notas (TipTap JSON) va directo a Firestore, NO en TinyBase.** `useNoteSave` es el único punto que escribe `content`.
- **Capa de repos en [src/infra/repos/](../src/infra/repos/) centraliza el patrón optimistic (desde F10).** Todo write a Firestore debe pasar por un repo (`tasksRepo`, `projectsRepo`, etc.) en lugar de llamar `setDoc`/`setPartialRow` inline desde un hook. El factory garantiza orden `setRow (sync) → await setDoc (async)` y auto-genera UUID v4 si no se provee `id`. Ver [baseRepo.ts](../src/infra/repos/baseRepo.ts) para la firma y [baseRepo.test.ts](../src/infra/repos/baseRepo.test.ts) para patrones de mocking con `vi.mock`.
- **Creación de recursos con navegación inmediata: `await repo.create(...)` → `navigate()`.** El factory retorna la promesa tras completar setDoc, entonces `useNote.getDoc` en la página destino encuentra el doc presente en Firestore. Patrón aplicado en `app/notes/page.tsx` y `convertToNote` de inboxRepo.
- **Content largo (TipTap JSON) sigue yendo solo a Firestore, NO a TinyBase.** `notesRepo.saveContent(id, payload)` es el único método que persiste `content`: hace `setPartialRow` a TinyBase con todos los campos derivados (title, contentPlain, updatedAt, distillLevel, linkCount, outgoingLinkIds) EXCEPTO content, y después `updateDoc` explícito a Firestore con content incluido. Un solo write atómico. `notesRepo.createFromInbox` es la variante que construye un docJson TipTap desde rawContent y lo persiste junto con metadata.
- **Write amplification resuelto por F12 (persister diff-based).** El callback `setPersisted` en [src/lib/tinybase.ts](../src/lib/tinybase.ts) ahora consume el param `changes` nativo de TinyBase v8 — emite `setDoc(merge:true)` solo para las rows tocadas en la transacción, no para toda la tabla. Reduce write amplification de O(N) a O(cambios). `Promise.allSettled` evita que un setDoc fallido aborte los paralelos del mismo tick; rejects se reportan vía `onIgnoredError` (6º arg de `createCustomPersister`) sin retry automático — rows fallidas quedan eventualmente consistentes solo cuando vuelven a tocarse. Sin `changes` (típico primer tick post-`startAutoLoad`): skip + `console.debug` en dev.
- **Cross-user data leak resuelto por F11.** `useStoreInit` llama `store.delTable(tableName)` para las 7 tablas pre-`startAutoLoad` y en cleanup post-`destroy()`. Cualquier nueva tabla agregada al `configs` array de [src/hooks/useStoreInit.ts](../src/hooks/useStoreInit.ts) hereda automáticamente el cleanup. Orden crítico en cleanup: `destroy()` (apaga onSnapshot + autoSave) antes de `delTable()`; invertido = race con snapshot in-flight repoblando la tabla vacía.
- **Limitación TinyBase v8 (post-F12): `changes` NO incluye row IDs eliminados.** `delRow` standalone produce `changes = [{}, {}, 1]` (vacío); `delTable` igual. El persister F12 NO puede propagar deletes a Firestore — ignora silenciosamente cualquier mutación de tipo delete. Inocuo en producción: todos los deletes pasan por repos (F10) que hacen `deleteDoc` directo. Si alguien llama `store.delRow` sin pasar por un repo, el doc queda huérfano en Firestore — patrón a evitar (era cierto pre-F12 también, según el gotcha original de F11). Beneficio colateral: si el orden `destroy() → delTable()` del cleanup F11 se invierte por accidente, F12 NO borra Firestore (pre-F12 sí lo haría).
- **Items de inbox nunca se borran físicamente** — se marcan `status: 'processed'` o `'dismissed'`. Filter pending los oculta, preserva historial.
- **Embeddings NO van en TinyBase.** Vectores de 1536 floats (~6KB c/u) demasiado grandes para store in-memory. Carga on-demand desde Firestore con cache module-level en [`src/lib/embeddings.ts`](../src/lib/embeddings.ts).
- **Gate de hidratación: `useStoreHydration()` (signal real, post-F11).** Hooks/componentes que muestran skeleton hasta que las 7 tablas TinyBase terminan `startAutoLoad` consumen `useStoreHydration()` — devuelve `{ isHydrating: boolean }` sincronizado con `Promise.all` del [Provider en layout.tsx](../src/app/layout.tsx). Default sin Provider: `{ isHydrating: true }` (skeleton-safe en `/login`, `/capture`, tests). Para gates de redirect por "row no existe" en detail pages: `!isHydrating && !row`, no timer arbitrario. Patrón vivo en [src/app/projects/[projectId]/page.tsx](../src/app/projects/%5BprojectId%5D/page.tsx). Reemplazó los 8 timers `INIT_GRACE_MS = 200` y el grace de 1500ms del workaround viejo.

### Relaciones entre entidades

- **Vinculaciones 1:N: el lado singular es autoritativo.** `project.objectiveId === objective.id` es más robusto que `objective.projectIds.includes(projectId)` para render.
- **Links bidireccionales con IDs determinísticos** — `source__target` como docId en `links/`. `extractLinks()` se ejecuta en cada save del editor.
- **Self-links filtrados en `syncLinks`:** `targetId !== sourceId`. Sin este guard, una nota que se referencia a sí misma con wikilink poluciona el grafo.
- **ID determinístico `YYYY-MM-DD` para hábitos** como `rowId` en TinyBase y `docId` en Firestore. Docs creados implícitamente al primer toggle. Patrón reutilizable para entidades time-indexed.

### Editor (TipTap)

- **TipTap WikiLinks son Nodes, no Marks.** Attrs `{ noteId, noteTitle }`, renderizado inline. Ver extensión en [`components/editor/extensions/wikilink.ts`](../src/components/editor/extensions/wikilink.ts).
- **`extractLinks()` se ejecuta en cada save** parseando el doc TipTap JSON y sincronizando la colección `links/` con los wikilinks encontrados.
- **Auto-save debounce 2s** (`AUTOSAVE_DEBOUNCE_MS = 2000`). Hook `useNoteSave` es el único writer del doc de nota: maneja editor + textarea del `summaryL3` con un solo timer compartido. Un `updateDoc` atómico por disparo. Cualquier campo futuro persistible por-save debe extender este hook, no crear uno paralelo.
- **Múltiples `@tiptap/suggestion` plugins necesitan `pluginKey` explícito.** Default todos usan `suggestion$` → `RangeError: Adding different instances of a keyed plugin` al montar el segundo. Fix: `pluginKey: new PluginKey('nombre-único')`. F2 tiene `wikilink-suggestion` y `slash-command-suggestion`.
- **`@` trigger con `allow()` blacklist alfanumérica** (no whitelist). `allow: ({ state, range }) => !/[a-zA-Z0-9]/.test(state.doc.textBetween(range.from - 1, range.from))`. Bloquea `user@domain.com` sin enumerar chars permitidos.
- **Listener pattern reusable para Suggestion → popup React.** Un archivo `*-suggestion.ts` tiene `let activeListener = null` módulo-level + `setXMenuListener()` export. Componente popup registra el listener en `useEffect`, delega `onStart/onUpdate/onKeyDown/onExit`. Render con `createPortal(..., document.body)` + virtual anchor (`fixed top: rect.bottom + 6, left: rect.left`).
- **Slash menu items con `keywords?: string[]`** para abreviaciones (`/h1`, `/ul`, `/hr`). Filter contra `[label, id, ...keywords].join(' ').toLowerCase()`.
- **Slash menu NO sirve para inline marks** (highlight/link). Slash commands disparan sin selección → `toggleHighlight` no-op. Block-level OK. Único entrypoint a inline marks: shortcut + bubble menu.
- **Templates como `JSONContent[]`, no HTML/Markdown.** Array de nodos ProseMirror que `insertContent()` aplica directamente. `updateNoteType(noteId, type)` lee `auth.currentUser?.uid` en runtime (no freeze en config) para tolerar logout/login mid-sesión.
- **StarterKit v3 incluye Link, Underline y ListKeymap por default.** Configurar Link vía `StarterKit.configure({ link: {...}, underline: false })`. NO instalar `@tiptap/extension-link` por separado. Verificado en `node_modules/@tiptap/starter-kit/dist/index.d.ts:10,97`.
- **`@tiptap/react/menus` es el import v3 correcto** (no `@tiptap/react` legacy). `BubbleMenu` y `FloatingMenu` viven ahí. `options` expone middlewares de Floating UI como **keys individuales** (`offset`, `flip`, `shift`, `arrow`, `size`, `autoPlacement`, `hide`, `inline`) — pasar `middleware: [...]` falla con TS2353.
- **`useEditorState` obligatorio para reactividad de `isActive()` en React.** Sin el hook, `editor.isActive('bold')` queda congelado en el valor del primer render. **Retornar solo primitivos** (booleans, strings) en el selector — objects anidados causan re-renders en cada keystroke.
- **`shouldShow` de BubbleMenu definido module-level**, fuera del componente. Referencia estable sin overhead de `useCallback`. Inline remonta el BubbleMenu en cada render y pierde el plugin de ProseMirror.
- **`extendMarkRange('link')` antes de `setLink`/`unsetLink`** cuando el cursor está sobre un link sin selección activa. Sin `extendMarkRange`, aplica solo al rango del cursor (1 char).
- **`e.preventDefault() + e.stopPropagation()` en Enter/Escape dentro de inputs en floating menus.** Sin `stopPropagation`, el keydown burbujea al editor. Patrón en `LinkInput.tsx`, reusar para cualquier input dentro de BubbleMenu/FloatingMenu.
- **Node ProseMirror `atom: true` + `contenteditable="false"` NO emite textContent en DOM.** El wikilink aparece solo en `editor.getText()` (TipTap serializa), no en `document.querySelector('.ProseMirror').textContent`. Afecta tests E2E.
- **Pill `.wikilink::before { content: '@' }` no se copia al clipboard.** Chrome/Firefox excluyen pseudo-elementos. Al pegar una mención afuera sale solo el título.
- **`SlashCommand.configure({ noteId })` depende de remount por nota.** `noteId` capturado en closure del Suggestion. Funciona porque `[noteId]/page.tsx` pasa `key={noteId}` al `<NoteEditor>`. Si alguien comparte el editor entre notas sin remount, las Templates Actions escribirían al noteId viejo.
- **Textarea auto-resize: `el.style.height = '0px'` antes de `scrollHeight`.** No usar `'auto'` — iOS Safari devuelve valores pequeños tras deletes.
- **`summaryL1` / `summaryL2` son dead weight** en el schema de TinyBase. Derivados de marks (bold/highlight) en `content`. Preservados por compatibilidad; no tocar.
- **Progressive Summarization: `computeDistillLevel(doc, summaryL3)` usa walk recursivo**. Orama schema + `NoteOramaDoc` extended con `distillLevel` para badge en NoteCard (L0 oculto, L1 azul, L2 amarillo, L3 verde).
- **BubbleMenu v3 NO anima entrada/salida automáticamente.** No aplica `data-starting-style` / `data-ending-style` como base-ui. Decisión F5: no animar (Notion tampoco).
- **iOS Safari selection toolbar coexiste con BubbleMenu.** Known limitation sin workaround confiable.
- **Paste sin `transformPastedHTML` preserva atributos HTML del nodo aunque el schema filtre marks.** El schema ProseMirror descarta marks no registrados (FontSize, TextStyle, Color) al reconstruir el documento, pero `<p style="font-size: 32px">` entra como atributo del paragraph y gana por CSS specificity sobre el estilo del editor. Cualquier extensión nueva que permita paste necesita sanitizar HTML a nivel string antes de que el schema lo procese. Hook canónico: `editorProps.transformPastedHTML` en el `useEditor()` con regex defensivo `/\s(style|class)=["'][^"']*["']/gi` (cubre comillas simples y dobles). Vive en [NoteEditor.tsx:62-64](../src/components/editor/NoteEditor.tsx#L62-L64). `linkOnPaste` sigue funcionando porque opera sobre el texto post-strip.
- **Menús anchored en cursor position usan `@floating-ui/dom` con virtual element + `autoUpdate` (post-F14).** El virtual element solo requiere `getBoundingClientRect: () => DOMRect` — perfecto para `SuggestionProps.clientRect` de TipTap que devuelve coords del cursor. `autoUpdate` instala `ResizeObserver` + `IntersectionObserver` + scroll ancestors listeners con un único handle de cleanup → re-posiciona en scroll/resize sin código extra. Crítico: **guardar la función `clientRect`, NO un snapshot `DOMRect`**. Snapshot queda stale al scrollear con el menú abierto; función invocada desde `virtualRef.getBoundingClientRect()` devuelve coords actuales siempre. Render con `visibility: hidden` hasta el primer `computePosition()` resuelva (evita flash de posición `(0,0)`). Patrón vivo en [SlashMenu.tsx](../src/components/editor/menus/SlashMenu.tsx); reusable para hover cards de wikilinks, tooltips de AI suggestions, cualquier overlay del editor cuyo anchor no es un DOM node.
- **`padding-bottom: 50vh` en `.note-editor .ProseMirror` para breathing room al final de notas largas.** Spacer CSS invisible que permite que el scroll del `<main>` corra aunque el contenido real termine antes — el cursor al final nunca queda pegado al borde inferior del viewport. Principio generalizable: antes de montar un listener JS que corre en cada keystroke/selection change (typewriter-mode via `selectionUpdate` + `scrollIntoView`), verificar si un padding/margin/spacer estático alcanza. El listener tiene costo de performance y tradeoff de UX (some users hate typewriter mode); el padding no. Documentado en [src/index.css:167](../src/index.css#L167).

### UI y componentes

- **Base-UI `@base-ui/react` para Dialog y Popover** (ya en deps, usado en 7+ archivos). Convenciones: `Root/Trigger/Portal/Positioner/Popup` + data-attrs `data-starting-style`/`data-ending-style`. **NO implementar** dropdown manual con useState+click-outside+escape+portal — duplica ~60 líneas ya provistas.
- **Base-UI usa `data-open` + `data-starting-style`/`data-ending-style`** (NO `data-state` como Radix). Las clases `animate-in`/`animate-out` de `tw-animate-css` no aplican.
- **`setIsOpen(true) → requestAnimationFrame → focus()` obligatorio para colapsables.** Si un handler externo pide expandir + enfocar un disclosure, el input aún no existe en DOM en el mismo tick. Sin rAF, `ref.current` es null.
- **Empty state con filtros activos: no hacer early return.** Renderizar siempre los controles de filtro y diferenciar mensaje: "sin datos" vs "filtros sin resultados" con botón de reseteo.
- **Quick Capture shortcut `Alt+N`** (no `Ctrl+Shift+N` que choca con Chrome incógnito). El modal NO tiene selector de tipo/tags/proyecto — todo va al Inbox sin clasificar. Clasificación post-captura (AI o manual).
- **`Intl.DateTimeFormat('es', { weekday: 'narrow' })`** devuelve "X" para miércoles, no "M". Usar resultado de Intl directamente, no hardcodear array.
- **`React.FormEvent` deprecated en React 19.** Handler inline `onSubmit={(event) => { event.preventDefault(); void submit(); }}` para que TypeScript infiera sin importar el type.
- **`overflow-x-auto` sin `overflow-y-hidden` explícito dispara scrollbar vertical fantasma en Chrome/Edge Windows (post-F15).** La spec CSS computa `overflow-y: auto` implícito cuando `overflow-x` es `auto`/`scroll`, y los navegadores renderean scrollbar vertical "por las dudas" aunque el elemento no tenga overflow real. Fix canónico: siempre parejar `overflow-x-auto overflow-y-hidden` en elementos cuyo único scroll intencional es horizontal (tabs, chips, carruseles). Aplica a cualquier `<nav>` o contenedor scrolleable del proyecto. Patrón vivo en [src/app/tasks/page.tsx:109](../src/app/tasks/page.tsx#L109).
- **Copy UI en imperativo neutro (post-F15).** El proyecto usa imperativo neutro (`Crea`, `Revisa`, `Escribe`, `Intenta`), NO voseo rioplatense (`Creá`, `Revisá`, `Escribí`). Decisión: evita marcar registro regional, forma más estándar en UIs de software en español. Cualquier string UI nueva debe seguir esta convención. Grep guardian: `rg "Creá|Revisá|Escribí|Intentá|Probá|Pegá|Hacé" src/` debe devolver 0 matches. Tildes siempre presentes en palabras básicas (revisión, próxima, aún, conexión, más, ningún, periódica, sincronizarán, mañana, días) — no omitirlas por ASCII compat, el stack ya acepta UTF-8 en todo el pipeline.
- **H1 duplicado en mobile oculto con estrategia granular (post-F15).** `MobileHeader` en [src/components/layout/MobileHeader.tsx:36](../src/components/layout/MobileHeader.tsx#L36) ya renderea `<h1>` sticky con `getPageTitle(pathname)` — las páginas duplicaban el título en un H1 interno. Regla: ocultar el H1 interno con `hidden md:block` (o `md:flex` en flex containers, `md:inline` si está inline con siblings). Si el `<header>` contiene solo el H1, aplicar al wrapper completo; si tiene siblings esenciales para mobile (botones críticos, nav flechas, Links), aplicar solo al H1 y preservar siblings. **Excepciones reconocidas**: Dashboard (`/` con saludo personalizado "Buenas noches, X" — copy distinto del label del nav). `/notes/graph` originalmente asumida como excepción por prefix-match (descartada en el plan) — pero `navItems` en [src/components/layout/Sidebar.tsx:38](../src/components/layout/Sidebar.tsx#L38) la registra con exact match → devuelve "Grafo". Lección: **verificar `navItems` antes de asumir el label del MobileHeader para cualquier ruta con exact/prefix match ambiguo.** Patrón vivo en las 8 páginas bajo `src/app/*/page.tsx` y `src/app/notes/graph/page.tsx`.

### Responsive & Mobile UX (Feature 1)

- **Breakpoint detection via `useSyncExternalStore` + `matchMedia`** — `useMediaQuery(query)` + `useBreakpoint()` en [`src/hooks/useMediaQuery.ts`](../src/hooks/useMediaQuery.ts). Mismo patrón que `useOnlineStatus`.
- **Render condicional JSX para shell, CSS para layouts internos.** Sidebar oculta en mobile via `!isMobile && <Sidebar>`; BottomNav/FAB ocultos en desktop. Dentro de cada página, responsive con clases Tailwind.
- **`SidebarContent` exportado y reusado por `NavigationDrawer`.** Evita duplicar array de nav items y handlers. Callback `onNavigate` cierra el dialog al click.
- **`viewport-fit=cover` en `index.html`** + `--sai-top/bottom/left/right: env(safe-area-inset-*)` en `index.css`. Body aplica `padding-left/right` global; top/bottom granular en MobileHeader y BottomNav/FAB para no duplicar.
- **Tap targets ≥44×44 via wrapper label.** Para Radix Checkbox: `<label class="h-11 w-11 flex items-center justify-center">` con el `<input h-4 w-4>` adentro. Mismo patrón para botones: contenedor h-11 w-11 + icono 16-20px.
- **`<table>` + sticky `th/td:first-child` para HabitGrid.** `position: sticky; left: 0; background: var(--background); z-index: 10` + wrapper `<div class="overflow-x-auto">`. NO migrar a CSS grid.
- **BottomNav fixed + `calc(80px + var(--sai-bottom))` height.** Main tiene `padding-bottom: calc(80px + var(--sai-bottom))` para que el content no quede tapado. FAB bottom: `calc(80px + 16px + var(--sai-bottom))`.
- **Cache del SW persiste entre reinstalaciones del APK en Capacitor.** WebView retiene bundle viejo al `adb install -r`. `registerType: 'autoUpdate'` resuelve en reloads subsiguientes; para E2E confiable, desinstalación completa + install fresh.

### Theme System (Feature 6)

- **`@custom-variant dark (&:is(.dark *))` NO matchea `<html class="dark">` por sí mismo**, solo descendientes. Usar pattern canónico shadcn `(&:where(.dark, .dark *))`.
- **`color-scheme: light/dark` property obligatoria** en `:root`/`.dark`. Sin ella, scrollbars nativos + autocomplete + form controls no respetan el tema (visible en Tauri WebView2 y Capacitor Android).
- **Script inline anti-flash en `<head>` antes del `<script type="module">`.** Única forma confiable en Vite SPA. Modules se defer-loadean; el script inline ejecuta sincrónicamente durante el parsing. Try-catch defensivo + IIFE para no polucionar global.
- **`resolvedTheme` snapshot DEBE leer del DOM** (`classList.contains('dark')`), no recomputar de `localStorage + matchMedia`. Elimina drift con el script inline que ya aplicó la clase antes de React mount.
- **Custom event `sm-theme-change` para notificación same-tab.** `storage` event solo dispara cross-tab. El setter dispatchea el custom event para que `useSyncExternalStore` en el mismo tab reaccione. Patrón generalizable para cualquier hook que persista en localStorage.
- **Theme default = `auto`, no `dark`.** Pre-F6 la app no tenía `.dark` setter — cambiar default sería cambio impuesto. `auto` respeta `prefers-color-scheme`.
- **localStorage del tema es per-plataforma.** Capacitor sirve desde `capacitor://localhost` (origen distinto al web deploy). Tauri también. Per-dispositivo es correcto; sync cross-device via Firestore si demanda aparece.
- **Tokens `--shadow-modal`, `--background-deep`, `--border-strong`.** Varían por tema. `--shadow-modal` reemplaza `shadow-[0_20px_40px_rgba(0,0,0,0.5)]` hardcoded (halo gris elefante en light). Cualquier Dialog/Popup nuevo debe usar estos tokens, no valores hardcoded.

### Knowledge Graph y WebGL

- **Ruta `notes/graph` ANTES de `notes/:noteId` en router.tsx.** Si va después, React Router captura "graph" como noteId. Orden crítico en flat routes con parámetros dinámicos.
- **Three.js NO procesa strings `oklch()`.** Solo hex, rgb, nombres CSS. Reagraph pasa `GraphNode.fill` directo a Three. Workaround: [`src/lib/theme-colors.ts`](../src/lib/theme-colors.ts) expone hex equivalentes con comentario `// KEEP IN SYNC WITH src/index.css`. Aplica a cualquier lib WebGL (Three, regl, pixi).
- **Reagraph `<GraphCanvas>` tiene canvas blanco hardcoded** si no se pasa `theme` prop con `canvas.background`. Construir `ReagraphTheme` dinámico con `useMemo` dep en `resolvedTheme`, extendiendo `lightTheme` base y overridando `canvas.background` / `node.label.color` / `edge.fill` / `arrow.fill`.

### Búsqueda Híbrida (Feature 3)

- **Primera CF callable del proyecto usa `onCall` v2.** `import { onCall, HttpsError } from 'firebase-functions/v2/https'`. Signature: `(request) => { request.auth?.uid; request.data }` — NO v1 (`context.auth`). Cliente via `getFunctions(app, 'us-central1') + httpsCallable`. Callable ref se crea una vez a nivel de módulo.
- **Cache de embeddings module-level compartido** entre `useSimilarNotes` y `useHybridSearch`. `getEmbeddingsCache(uid)` deduplica fetches concurrentes via `fetchPromise`; reusa si uid no cambió. `invalidateEmbeddingsCache()` se llama en `signOut` (antes de `firebaseSignOut`) para no filtrar entre cuentas.
- **Threshold empírico con `text-embedding-3-small` + notas cortas en español: 0.30.** Cosine satura en 0.15–0.45 para documentos cortos. `SimilarNotesPanel` usa 0.5 (compara notas completas); `useHybridSearch` usa 0.3 (queries más cortas). Recalibrar si el corpus cambia.
- **Pipeline semántico en orden estricto**: `filter isArchived → exclude keyword IDs → sort score desc → slice(0, 5)`. Si se slicea antes de excluir, con 5 keyword matches `semanticResults` queda vacío aunque haya hits válidos.
- **Race handling con snapshot del query, no `AbortController`.** Firebase callable no expone abort. Patrón: `const frozenQuery = trimmed` al iniciar, `if (frozenQuery !== query.trim()) return` al volver del CF.

### FSRS y resurfacing

- **FSRS opt-in requiere botón explícito.** Sin "Activar revisión periódica", la feature es invisible porque notas nuevas no tienen `fsrsDue`. `ReviewBanner` tiene 4 estados: activar, due, próxima fecha, confirmación post-review.
- **`Math.random()` no es seedable en JavaScript.** Para orden determinístico diario de hubs en Daily Digest, usar hash numérico de `noteId + dateString`: `[...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)`.

### Optimistic updates

- **Orama sync: full rebuild en cada `addTableListener` es el patrón.** <50ms para ~100 notas. Evita edge cases de sync incremental. Aceptable hasta ~1k filas.
- **`useBacklinks` auto-refresca `sourceTitle`** vía join in-memory con `useTable('notes')`. No hay que re-sincronizar cache de `links/`.

### PWA + Offline

- **`vite-plugin-pwa` con `generateSW` y `autoUpdate`.** `navigateFallback: 'index.html'` permite SPA routing offline. `navigateFallbackDenylist: [/^\/api/, /^\/__\//]` evita interceptar rutas Firebase internas. Requiere `--legacy-peer-deps` con Vite 8.
- **TinyBase es el offline layer.** Datos en memoria sobreviven pérdida de red. Persister con `autoSave` sincroniza al reconectar. No se usa `enableOfflineDataPersistence()` de Firestore.
- **Guards offline solo en features AI.** Escrituras locales (notas, tareas, hábitos) funcionan via TinyBase. Solo "Procesar" inbox (CF + Claude) y SimilarNotesPanel (embeddings Firestore) se deshabilitan offline.
- **`useOnlineStatus` usa `useSyncExternalStore`** — más correcto semánticamente que useState+useEffect para subscripciones a APIs del browser.
- **`maximumFileSizeToCacheInBytes: 4MB` en workbox config.** Bundle principal ~2.7MB por Reagraph/Three.js. Cuando haya code-splitting del grafo, se puede bajar.

### Chrome Extension

- **Proyecto separado en `extension/`** con su propio package.json, tsconfig, vite.config. No comparte build con la app principal.
- **CRXJS 2.4.0 + Vite 8.** Named export: `import { crx } from '@crxjs/vite-plugin'` (NO default).
- **Auth: `chrome.identity.getAuthToken()` + `signInWithCredential()`** — más simple en MV3, no requiere offscreen documents.
- **Firebase SDK lite:** `firebase/auth/web-extension` + `firebase/firestore/lite`. Bundle total 342KB (105KB gzip). `firebase/auth/web-extension` obligatorio para MV3 — el import normal falla en service worker context.
- **Items del extension se crean con `source: 'web-clip'`** y `sourceUrl` del tab activo.
- **Sin encolamiento offline** — el popup es efímero, si no hay red muestra error.

### Tauri Desktop (Fase 5.1 + Feature 7)

- **`src-tauri/` integrado en el raíz del proyecto**, no proyecto separado. Tauri consume output de Vite (`dist/`). `tauri:dev` lanza Vite + Tauri juntos.
- **Ventana `/capture` como ruta top-level, fuera de Layout.** Layout hidrata sidebar + TinyBase + editor pesado; capture debe abrir en <200ms. Top-level = solo auth + textarea + `setDoc` directo. Misma pattern que la extension.
- **Hook JS en `main.tsx` se monta en TODAS las ventanas del bundle.** Tauri no separa entrypoints por ventana — `main`, `capture` y futuras comparten el mismo `main.tsx`. Side effects globales (shortcut OS-level, init de singleton, analytics) duplican registro sin guard. Patrones seguros: (1) registrar Rust-side si es OS-level, (2) guard `getCurrentWebviewWindow().label === 'main'` en el hook, (3) hook legítimamente per-window como `useCloseToTray` porque cada ventana necesita su propio listener de `close-requested`.
- **Global shortcut registrado Rust-side** con `tauri_plugin_global_shortcut::Builder::new().with_handler(...)` dentro de `setup()`. El pattern original (hook JS) se montaba en ambas ventanas → double-register race → callback en contexto `capture` operando sobre sí misma → quirks Windows (tauri#6843). Rust-side garantiza registro único + AppHandle estable, y permite compartir `tray::show_capture` con el handler del tray (zero duplicación).
- **Close-to-tray en JS via `onCloseRequested`.** Hook `useCloseToTray` en `main.tsx` llama `event.preventDefault()` + `getCurrentWebviewWindow().hide()`. Se monta en cada ventana.
- **Single-instance plugin obligatorio con autostart.** Sin él, autostart + click manual = dos instancias, segunda falla al registrar shortcut global.
- **Window-state plugin con denylist `["capture"]`.** Capture siempre centrada, nunca recuerda pos. Main sí persiste pos/size.
- **Feature `tray-icon` obligatorio en `Cargo.toml`.** `tauri::tray` gated detrás de `features = ["tray-icon"]`.
- **Capabilities Tauri v2 NO soportan wildcards.** Usar `core:tray:default`, `core:menu:default`, `core:window:allow-*` enumerado. Separadas por ventana: `default.json` para main, `capture.json` para capture — principio de mínimo privilegio.
- **IDE marca capabilities "not accepted" tras agregar plugin.** Schema `gen/schemas/desktop-schema.json` se regenera solo en `cargo check/build`. Correr uno y recargar IDE.
- **CSP Firebase explícito en `tauri.conf.json`.** `connect-src`: `*.googleapis.com *.firebaseio.com wss://*.firebaseio.com identitytoolkit auth`. `frame-src`: `*.firebaseapp.com accounts.google.com` para el popup de Google signIn en release.
- **Auth en Tauri NO usa `signInWithPopup`.** WebView2 abre `window.open` en browser del sistema y el popup no puede comunicarse de vuelta. Fix: OAuth Desktop flow custom en `src-tauri/src/oauth.rs` — HTTP listener local, abre URL via `plugin-shell`, intercambia code por id_token, `signInWithCredential`. PKCE + state CSRF. Credenciales en `.env.local` (`VITE_GOOGLE_OAUTH_CLIENT_ID` + SECRET). OAuth listener es one-shot.
- **Shortcut global `Ctrl+Shift+Space`.** Cero conflictos en Windows. `Alt+N` local sigue intacto (QuickCaptureProvider).
- **`--legacy-peer-deps` también para `@tauri-apps/*`** con Vite 8.
- **Bundle MSI + NSIS ambos activos.** MSI para distribución corporativa, NSIS para auto-updater futuro. Output en `src-tauri/target/release/bundle/{msi,nsis}/`.
- **Primer `cargo build` tarda 5-10 min** (~400 crates). Incrementales luego 10-30s.
- **Capture multi-monitor (Feature 7):** `tray.rs::show_capture` centra en monitor del cursor. Hit-test cursor-based con `?? monitors[0]` fallback. Dimensiones físicas con `scale_factor * LOGICAL_SIZE` (NO `outer_size()`). `set_position` llamado DOS veces (pre + post `show()`) por Windows hidden-window queue quirk. `set_size(LogicalSize(480, 220))` post-show para resetear tamaño canónico — seguro porque corre al rest.
- **Drag de capture window fue revertido (F7 round 3).** Cross-DPI drag disparaba feedback loop de `onScaleChanged` + `setSize` que paniceaba tao con integer underflow (`event_loop.rs:2035/2042`). Bug upstream tauri#3610 abierto desde 2022 sin fix. Para mover a otro monitor, re-invocar shortcut.
- **Menu items inmutables post-build en Tauri.** `CheckMenuItem` lee `is_enabled()` al construirse; no se puede reconstruir el menú en runtime. Para toggle (ej. "Iniciar con Windows"), alternar `enable()/disable()` + `set_checked(!enabled)` sobre el item existente. Aplica a cualquier menu item Tauri que cambie estado post-setup.

### Auto-Updater + Releases (Features 8-9)

- **tauri-action NO propaga env vars del step `env:` al subprocess `beforeBuildCommand` en Windows runners.** `VITE_FIREBASE_*` declaradas en `env:` quedaban `undefined` dentro de `npm run build` que dispara tauri-action, rompiendo Firebase/OAuth en los bundles de CI. Patrón canónico: generar `.env.production` explícito en un step previo — Vite lo lee directo desde disk, sin depender del forwarding entre procesos. Los `TAURI_SIGNING_*` siguen en `env:` porque los consume tauri-action directamente (ahí sí funciona). Ver `.github/workflows/release.yml` step "Generate .env.production for Vite". Aplicable a F9 Capacitor CI y cualquier futuro workflow.
- **`createUpdaterArtifacts` en `tauri.conf.json` acepta `true`/`false`/`"v1Compatible"` solamente.** No existe `"v2Compatible"`. `true` produce artifacts v2 firmados por default. Schema verificado en `node_modules/@tauri-apps/cli/config.schema.json`.
- **Tauri `plugin-updater` trata HTTP 404 como error**, no como "sin update disponible". Pre-primer-release el endpoint de `latest.json` devuelve 404 y el hook cae al catch — el error dialog solo aparece en check manual (startup silent traga el error). Comportamiento correcto en prod post-bootstrap.
- **DevTools desactivadas en production builds de Tauri** salvo que se agregue feature `devtools` al crate `tauri` de `Cargo.toml` (`features = ["tray-icon", "devtools"]`). F12/Ctrl+Shift+I no funcionan en el MSI/NSIS instalado. Diagnóstico de bugs build-time requiere `tauri:build` local para comparar vs el bundle de CI.
- **`gh release delete <tag> --cleanup-tag --yes`** elimina Release + tag remoto en un solo paso. tauri-action recrea git tags al crear Releases; si borrás solo el tag, el siguiente run puede recrearlo. Usar siempre `--cleanup-tag` cuando se está rehaciendo un release.
- **`gh` CLI con PAT default no puede cancelar workflow runs** (403 "Resource not accessible"). Requiere scope `workflow` o `actions:write`. Fallback: dejar correr + limpiar Release post-facto.
- **Update flow E2E requiere ≥2 releases secuenciales.** Baseline instalado (v0.1.1) + versión nueva publicada (v0.1.2) para validar `check() → dialog → download → install → relaunch`. No se puede testear con un solo release. F5 del SPEC F8 corrió 2 veces: bump 0.1.1 (baseline) + bump 0.1.2 (update target).
- **Hook JS `useAutoUpdate` se monta en ambas ventanas main + capture.** Guard `label !== "main"` obligatorio al inicio — las capabilities `updater:default` / `process:*` solo están scopeadas a `"windows": ["main"]`, pero la llamada desde capture generaría errores de permiso visibles en consola. Doble guard (capability + JS label) es defensivo y correcto.
- **Tray command → emit event → JS handler** es el patrón post-F7 que F8 reutilizó. `app.emit_to("main", "check-for-updates", ())` desde Rust + `listen("check-for-updates")` en el hook JS. Evita duplicar lógica updater en Rust y JS.
- **Capacitor 8 exige Node >=22 y JDK 21 en el runner Android.** `setup-node@v5` con `node-version: 22` (Capacitor CLI requirement) y `setup-java@v5` con `java-version: 21` (Capacitor genera `capacitor.build.gradle` con `sourceCompatibility=21`). Local pasa con 22 + JBR de Android Studio 2024+ pero los defaults del SPEC (20 + 17) fallan. `release-capacitor` queda asymétrico con `release-tauri` en Node 20 — aceptable, tauri-action no invoca Capacitor CLI.
- **Prerelease guard dinámico para tags `-rc`/`-beta` (F13).** El step `Build & Release Tauri` usa `prerelease: ${{ contains(github.ref_name, '-rc') || contains(github.ref_name, '-beta') }}` en vez de hardcoded `false`. GitHub resuelve el endpoint `/releases/latest/...` al último NON-prerelease por default — los RCs quedan publicados pero invisibles para el updater. Pattern base para validar cambios al workflow sin impactar usuarios.
- **Patrón RC-tag + cleanup para validar workflow changes end-to-end (F13).** Cualquier modificación al `release.yml` (bumps de actions, nuevos steps, cambio de build params) se valida pusheando `v<X.Y.Z>-rc1` desde la feature branch antes del merge a main. El workflow corre completo (ambos jobs Tauri + Capacitor, ~9 min) → verificar con `gh release view <tag> --json isPrerelease` que es `true` y `gh release list` sigue mostrando el release previo como "Latest" → cleanup `gh release delete <tag> --cleanup-tag --yes`. Valida 100% del pipeline sin riesgo de disparar updater ni notificar a testers de App Distribution de algo roto. Aplicado por primera vez en F13 con `v0.1.8-rc1` para el bump a Node 24 actions.
- **Actions del workflow pineadas a major o version inmutable, nunca a `@v0` / tags movibles (F13).** Actions oficiales de GitHub (`actions/checkout`, `actions/setup-node`, `actions/setup-java`) se pinean a major (`@v5`). Third-party (`tauri-apps/tauri-action`, `wzieba/Firebase-Distribution-Github-Action`) se pinean a version inmutable (`@v0.6.2`, `@v1.7.1`) para evitar regresiones silenciosas en un minor update. Tag movible como `@v0` en tauri-action era deuda técnica — pineado en F13.
- **`gradlew` pierde el bit executable tras `git checkout` en `ubuntu-latest`.** Step `chmod +x gradlew` antes del primer `./gradlew` invocation. Windows local no lo expone (se invoca `gradlew.bat`). Gotcha universal para cualquier pipeline Android multi-OS.
- **SHA-1 del release keystore debe registrarse en Firebase Console ANTES del primer CI release** para apps con Google Sign-In nativo. Sin eso, el APK firma correctamente pero `SocialLogin.login()` devuelve `DEVELOPER_ERROR` en runtime — parece bug de código, es config de consola. Firebase auto-provisiona el Android OAuth client en GCP al agregar el SHA-1. Al rotar keystore (por ejemplo en nueva máquina de dev), re-registrar el nuevo SHA-1 es parte del ritual, como bumpear versión. Repetir en Firebase Console → Project Settings → app Android → SHA fingerprints.
- **`versionName`/`versionCode` del APK via Gradle props `-P` derivados del tag.** CI computa `VERSION_NAME=${GITHUB_REF_NAME#v}` y `VERSION_CODE=$((MAJOR*10000 + MINOR*100 + PATCH))`, pasa `./gradlew assembleRelease -PversionName=$VERSION_NAME -PversionCode=$VERSION_CODE`. `android/app/build.gradle` usa `project.hasProperty('versionName') ? project.versionName : "1.0"` como fallback. versionCode semver-encoded es legible (0.1.6 → 106) y elimina `build.gradle` de la lista de bump manual por release — el tag es la única source of truth. Lista de bump por release queda solo en `package.json` + `Cargo.toml` + `Cargo.lock` + `tauri.conf.json`.
- **`google-services.json` inyectado via secret base64 (no committed)** aunque Firebase lo considere no-secret. Decode en CI: `echo "${{ secrets.ANDROID_GOOGLE_SERVICES_JSON_BASE64 }}" | base64 -d > android/app/google-services.json`. `android/app/build.gradle` aplica el plugin `com.google.gms.google-services` condicionalmente con `try { file('google-services.json').text }` — sin el archivo, Firebase Analytics + push + Google Sign-In nativo quedan silenciosamente sin inicializar. Mismo patrón para el release keystore (`ANDROID_KEYSTORE_BASE64` → `android/app/release.keystore`).

### Capacitor Mobile (Fase 5.2)

- **`android/` commiteado al repo.** Incluye `app/src/`, `variables.gradle`, Gradle wrapper. Gitignored: `android/app/build/`, `*.apk`, `*.keystore`. Primera build requiere Android Studio + SDK 36 + `ANDROID_HOME` + `JAVA_HOME`.
- **`server.androidScheme: 'https'` obligatorio** en `capacitor.config.ts`. Sin esto, Firebase Auth rechaza el WebView por origen HTTP.
- **Google Sign-In nativo: patrón universal** `SocialLogin.login({ provider: 'google' }) → idToken → GoogleAuthProvider.credential(idToken) → signInWithCredential(auth, credential)`. Mismo patrón que Tauri y Chrome Extension — solo cambia cómo se obtiene el idToken.
- **Web Client ID compartido para todas las plataformas.** Android Client ID de GCP solo valida SHA-1 del keystore; no se usa en código. `VITE_GOOGLE_WEB_CLIENT_ID` en `.env.local` + `<string name="server_client_id">` en `strings.xml`.
- **`MainActivity.java implements ModifiedMainActivityForSocialLoginPlugin`** con `onActivityResult` forwarding a `SocialLoginPlugin.handleGoogleLoginIntent`. Obligatorio por design del plugin Capgo — sin esto la promesa queda huérfana.
- **Share Intent reusa QuickCaptureProvider.** A diferencia de Tauri `/capture` (ventana efímera), en Capacitor la app completa ya está cargada con el provider montado. `useShareIntent` llama `quickCapture.open(content, { source, sourceUrl })` → meta stasheado en `pendingMetaRef` (ref, no state) → `save()` lo consume como defaults. Callers previos no cambian (params opcionales).
- **Ícono Android: VectorDrawable extraído del `public/favicon.svg`.** `@capacitor/assets generate` distorsiona íconos. Solución: copiar `<path d="">` del SVG a `<path android:pathData="">` del VectorDrawable, `<group android:translateX/Y>` para normalizar viewBox. Background `#171617`. PNG maskable en mipmap-\* como fallback para Android <8.
- **Splash: drawable XML simple `@color/splashBackground` (`#878bf9`).** Los PNGs generados usaban fondo gris default ignorando el flag. XML con color sólido es más simple y confiable.
- **Edge-to-edge via `env(safe-area-inset-*)` en el `body`.** Inocuo en web (env() = 0 sin `viewport-fit=cover`). Capacitor 8 aplica edge-to-edge automáticamente.
- **Capacitor CLI `cap run android` falla en Windows por `gradlew` sin `.bat`.** Workaround en `Docs/SETUP-WINDOWS.md`. `--legacy-peer-deps` también para `@capacitor/*` y `@capgo/*`.
- **HTML entities en share intent.** Chrome Android envía títulos con `&#34;` en vez de `"`. Decoder via `DOMParser` o `textarea.innerHTML = title` es trivial. No implementado — pulir si molesta en uso real.
- **Auth branching order: `isCapacitor()` ANTES de `isTauri()` ANTES de web.** Mutuamente excluyentes por plataforma; el orden importa porque web es el fallback implícito. Aplica a cualquier código cross-plataforma que deba bifurcar behavior (auth, capture window, share intent).
- **Launcher cache Android no invalida ícono tras reinstalar APK.** `adb install -r` deja el launcher con el ícono viejo cacheado. Workaround confiable: `adb uninstall com.secondmind.app` + `adb install` fresh. Relevante cuando se prueba rebranding o cambios visuales de la app.
- **Primer build Gradle descarga ~400 deps + distribución Gradle 8.14.3 (~3min).** Incrementales después son 5-10s. Impacto solo en primer clone del repo o CI runner nuevo; no es un problema operativo de sesión.

---

## Cloud Functions

4 CFs desplegadas en `us-central1`, todas con `retry: false`:

- **`processInboxItem`** — `onDocumentCreated('users/{userId}/inbox/{itemId}')`, `timeoutSeconds: 60`. Claude Haiku con tool `classify_inbox` + `INBOX_CLASSIFICATION_SCHEMA`. Escribe 6 campos flat `aiSuggested*` + `aiProcessed: true`.
- **`autoTagNote`** — `onDocumentWritten('users/{userId}/notes/{noteId}')`, `timeoutSeconds: 60`. Claude Haiku con tool `tag_note` + `NOTE_TAGGING_SCHEMA`. Escribe `aiTags`, `aiSummary`, `aiProcessed: true`.
- **`generateEmbedding`** — `onDocumentWritten('users/{userId}/notes/{noteId}')`, `timeoutSeconds: 60`. OpenAI `text-embedding-3-small` (1536 dims). Guard por `contentPlain` vacío + `contentHash` SHA-256. Escribe a `users/{userId}/embeddings/{noteId}`.
- **`embedQuery`** — `onCall` v2 (`firebase-functions/v2/https`), `timeoutSeconds: 10`. Input `{ text: string }` ≤500 chars, output `{ vector: number[] }`. Mismo modelo que `generateEmbedding`.

### Tool use con schema enforcement (Fase 3.1)

Ambas CFs con Claude usan `tools` + `tool_choice: { type: 'tool', name: '...' }` para forzar JSON válido. `enum` y `required` del JSON Schema garantizan valores a nivel de decoder — no depende de obediencia al prompt. Schemas compartidos en [`src/functions/src/lib/schemas.ts`](../src/functions/src/lib/schemas.ts). Eliminó fallbacks null, stripJsonFence, código defensivo de parsing.

### Guards y edge cases

- **`aiProcessed` guard en `autoTagNote`:** `if (after.aiProcessed) return` — evita re-procesamiento. Early return sin log (frecuente).
- **`onDocumentWritten` en vez de `onDocumentCreated`** para notas: notas desde `/notes` se crean con `contentPlain: ''` y el texto llega en el auto-save (2s después). `onDocumentWritten` detecta el primer write con contenido.
- **`convertToNote` setea `aiProcessed: true` cuando hay tags del inbox.** Sin esto, `autoTagNote` sobrescribiría tags aceptados. Condición: `aiProcessed: !!(overrides?.tags?.length > 0)`.
- **Secret management:** `defineSecret('ANTHROPIC_API_KEY')` / `defineSecret('OPENAI_API_KEY')` + `secrets: [...]` en el trigger. `.value()` dentro del handler, no top-level.
- **`contentHash` guard en `generateEmbedding`:** compara SHA-256 del `contentPlain` actual con el hash almacenado. A diferencia de `autoTagNote`, embeddings deben regenerarse cuando el contenido cambia.
- **Mismatch Node 20 vs 22 en functions.** `firebase.json.runtime: nodejs20` vs `src/functions/package.json.engines.node: 22`. `firebase.json` manda en deploy — runtime efectivo es Node 20.
- **`firebase-functions` v7 obligatorio.** v6 fallaba con timeout en el discovery protocol de la CLI.
- **`.gitignore` de functions: `/lib/` con anchor.** Sin anchor, matchea `src/lib/` (sources) además de `lib/` (compiled).

---

## Patrones establecidos

- **"Three similar lines beat premature abstraction"** — duplicar 8 líneas triviales es OK hasta el 4to uso. No extraer helpers prematuramente.
- **Helpers compartidos existentes:** `formatDate`, `startOfDay`, `isSameDay`, `getWeekStart`, `addDays` en [`src/lib/dateUtils.ts`](../src/lib/dateUtils.ts); `parseIds`, `stringifyIds` en [`src/lib/tinybase.ts`](../src/lib/tinybase.ts).
- **Popup wikilinks sin `tippy.js`** — `createPortal` + virtual anchor del `clientRect()` de TipTap. ~30 líneas, sin dep extra.
- **Tokens de popup styling unificados:** todos los menus flotantes del editor (WikilinkMenu, SlashMenu, BubbleToolbar, LinkInput, LinkHoverView) usan `rounded-lg border border-border bg-popover text-popover-foreground shadow-xl` + `p-1`.
- **Tap target 44×44 en desktop también** (Feature 5). Un solo tamaño facilita lectura y mantiene convención con TaskCard, HabitRow, DistillIndicator.
- **Full rebuild de índices < 50ms** para ~100 entidades. Patrón `addTableListener` + rebuild completo, sin sync incremental.
- **Command Palette: Orama rebuild con debounce 100ms** para agrupar los 3 store listeners iniciales.

---

## Gotchas de tooling

- **TypeScript LSP plugin requiere patch en Windows.** `child_process.spawn()` no resuelve wrappers `.cmd` de npm global. Fix: `marketplace.json` con `command: "node"` + ruta absoluta a `cli.mjs`. Procedimiento en `Docs/SETUP-WINDOWS.md`.
- **Firebase MCP: `node` directo al CLI local, no `npx`.** `npx firebase@latest` falla con "Invalid Version". Configurado en `.mcp.json`.
- **Brave Search: `BRAVE_API_KEY` como variable de sistema Windows**, no en `.env.local`.
- **ui-ux-pro-max symlinks rotos en Windows** sin Developer Mode. Scripts reales en `src/ui-ux-pro-max/scripts/search.py`. Fix: Developer Mode + `git config --global core.symlinks true` + reinstalar plugin.

---

## Dependencias clave con historia

| Paquete                         | Versión   | Nota                                                                               |
| ------------------------------- | --------- | ---------------------------------------------------------------------------------- |
| `firebase-functions`            | `^7.2.5`  | v6 fallaba con timeout en discovery                                                |
| `@anthropic-ai/sdk`             | `^0.40.1` | Soporta `tools` + `tool_choice` para schema enforcement                            |
| `tinybase`                      | v8        | Sin `persister-firestore` nativo. Custom persister con `createCustomPersister`     |
| `@orama/orama`                  | v3        | `search()` es sync at runtime aunque el tipo diga `Promise`                        |
| `reagraph`                      | latest    | WebGL graph viz (Three.js). Compatible React 19. ~1.3MB bundle                     |
| `openai`                        | `^4.85`   | SDK para embeddings en CF `generateEmbedding`. Solo en `src/functions/`            |
| `ts-fsrs`                       | latest    | FSRS spaced repetition. Client-side (~15KB)                                        |
| `vite-plugin-pwa`               | `^1.2.0`  | Requiere `--legacy-peer-deps` con Vite 8. `generateSW` + `autoUpdate`              |
| `@crxjs/vite-plugin`            | `^2.4.0`  | Named export `{ crx }`. Soporta Vite 8 + MV3 + React + HMR                         |
| `@tauri-apps/cli`               | `^2.10.1` | CLI para scaffold/dev/build. Requiere Rust + MSVC Build Tools en Windows           |
| `@tauri-apps/api`               | `^2.10.1` | Window management, webview, event system. Import dinámico para no romper build web |
| `tauri-plugin-global-shortcut`  | `2.3.1`   | Registro OS-level de hotkeys. Rust-side con `with_handler` en `setup()` (post F7)  |
| `tauri-plugin-autostart`        | `2.5.1`   | Autostart con Windows (registry key HKCU Run)                                      |
| `tauri-plugin-window-state`     | `2.4.1`   | Persiste pos/size. `.with_denylist(&["capture"])` para excluir la ventana efímera  |
| `tauri-plugin-single-instance`  | `2.4.1`   | Previene múltiples procesos simultáneos. Crítico con autostart                     |
| `@capacitor/core`               | `^8.3.0`  | Runtime Cap 8. Requiere Node 22+ y Android Studio Otter+                           |
| `@capacitor/cli`                | `^8.3.0`  | `cap run android` falla en Windows por `gradlew` sin `.bat` (workaround en SETUP)  |
| `@capacitor/android`            | `^8.3.0`  | Plataforma Android. `minSdk 24`, `compileSdk 36`, `targetSdk 36`                   |
| `@capacitor/splash-screen`      | `^8.0.1`  | `launchAutoHide: false` + `SplashScreen.hide()` manual                             |
| `@capgo/capacitor-social-login` | `^8.3.14` | Google Sign-In nativo. Sucesor oficial del abandonado `codetrix-studio`            |
| `@capgo/capacitor-share-target` | `^8.0.27` | Listener `shareReceived` + intent-filter SEND. Único con soporte Cap 8 free        |

---

## Candidatos próximos

Lista curada sin compromiso de orden ni scope. La próxima feature se decide con Sebastián al arrancar la sesión.

- **Command Palette con tab "semántico"** — toggle opcional sobre `useHybridSearch` si el uso real lo justifica.
- **AI-suggested links en el editor** — embeddings para sugerir wikilinks inline mientras se escribe, debounced.
- **Floating menu al inicio de línea vacía** — complementa bubble menu con hint "press `/` for commands".
- **Botón "Convertir en nota" en bubble menu** cuando hay selección — atomización Zettelkasten directa con backlink automático.
- **AI-suggested highlights** — cuidado: el valor cognitivo de Progressive Summarization está en destilar manualmente.
- **Code blocks con syntax highlighting** — `@tiptap/extension-code-block-lowlight` + Prism/highlight.js.
- **Task items del editor → Tasks reales** — comando que crea un `task` en TaskStore con `sourceId = noteId`.
- **Drag & drop de imágenes al editor** — upload a Firebase Storage, Node custom `image` con attrs `{ src, alt, width }`.
- **Temas de acento** — elegir color de acento (azul/verde/naranja) cambiando solo `--primary-*` tokens.
- **Sync de preferencias cross-device** via Firestore `users/{uid}/preferences.theme` si demanda aparece.
- **Visual regression baselines** con Playwright si se introduce screenshot testing.
- **Distribución:** code signing Windows para MSI, Play Store publish (AAB + $25 one-time + privacy policy).
