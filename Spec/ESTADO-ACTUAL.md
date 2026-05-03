# Estado Actual — SecondMind (Snapshot consolidado)

> Última actualización: Feature 38 Clean Arch cleanup post-F37 (Mayo 2026). F38.1 `linksRepo` + `syncLinksFromEditor` orquestador cross-entity (factory + diff puro extraído + `Promise.all` paralelo, zero behavior change vs `lib/editor/syncLinks.ts` pre-F10 eliminado). F38.2 `notesRepo.subscribeSuggestions` + migración `useNoteSuggestions` (cierra import directo `firebase/firestore` en `src/hooks/`, salvo excepción documentada `useNote.ts`). F38.3 `inboxRepo.createFromCapture` + migración `app/capture/page.tsx` (factory gana retry F30 via `saveInboxQueue`; `Date.now()` reemplaza `serverTimestamp()`). F38.4 ESLint `no-restricted-imports` guard rail mandatory (bloquea `firebase/firestore` y `firebase/auth` en capa 2 con `allowTypeImports: true` + globs de excepción `useNote.ts`/`useAuth.ts`/tests). 157 tests pasando (+16 vs F37). E2E Playwright validó wikilinks (Backlinks 0→1→0), capture page (inbox item con source desktop-capture + CF processing), guard rail negativo (archivo temporal con import prohibido falla con mensaje custom). QuickCaptureProvider sigue con `inboxStore.setRow` directo + persister F12 — path canónico, no drift (D4 F38.3).
> Snapshot de arquitectura vigente, gotchas por dominio, patrones, deps clave.
> Se actualiza al cerrar cada feature con la regla de escalación de CLAUDE.md:
> gotchas nacen en SPEC → suben acá si aplican a >1 feature → suben a CLAUDE.md si son universales.
> Nunca se duplica entre niveles.

---

## Fases completadas

Cada feature comprimida a 1 línea con pointer al SPEC archivado. Para detalles de implementación (decisiones, snippets, lecciones), abrir el SPEC referenciado.

- **Fase 0 — Setup base:** Vite + React 19 + TS strict + Tailwind v4 + Firebase + TinyBase v8.
- **Fase 0.1 — Toolkit:** MCPs (Firebase, Context7, Playwright, Brave) + Prettier/ESLint hooks + protección `main`. → [SPEC](SPEC-fase-0.1-toolkit.md).
- **Fase 1 — MVP:** Quick Capture (Alt+N) + TipTap con wikilinks + backlinks + Orama FTS + inbox + dashboard.
- **Fase 2 — Ejecución:** tareas, proyectos, objetivos, hábitos. → [SPEC](SPEC-fase-2-ejecucion.md).
- **Fase 3 — AI Pipeline:** CFs `processInboxItem` + `autoTagNote` (Claude Haiku) + Command Palette (Ctrl+K) Orama global. → [SPEC](SPEC-fase-3-ai-pipeline.md).
- **Fase 3.1 — Schema Enforcement:** tool use con JSON Schema en CFs, eliminó nulls/parsing defensivo. → [SPEC](SPEC-fase-3.1-ai-provider.md).
- **Fase 4 — Grafo + Resurfacing:** knowledge graph (Reagraph WebGL) + CF `generateEmbedding` (OpenAI) + notas similares + FSRS + Daily Digest. → [SPEC](SPEC-fase-4-grafo-resurfacing.md).
- **Fase 5 — PWA + Extension:** PWA instalable + Chrome Extension MV3 (CRXJS, `firestore/lite`). → [SPEC](SPEC-fase-5-pwa-extension.md).
- **Fase 5.1 — Tauri Desktop:** wrapper Windows con tray + autostart + shortcut global `Ctrl+Shift+Space` + ventana frameless `/capture`. MSI + NSIS. → [SPEC](SPEC-fase-5.1-tauri-desktop.md).
- **Fase 5.2 — Capacitor Mobile (Android):** Google Sign-In nativo + Share Intent + adaptive icon + edge-to-edge. → [SPEC](SPEC-fase-5.2-capacitor-mobile.md).
- **Feature 1 — Responsive & Mobile UX:** shell con BottomNav/FAB/NavigationDrawer mobile + Sidebar collapsed tablet. → [SPEC](features/SPEC-feature-1-responsive-mobile.md).
- **Feature 2 — Editor Polish:** `@` para menciones (reemplaza `[[`) + slash commands `/` con 12 items + templates Zettelkasten. → [SPEC](features/SPEC-feature-2-editor-polish.md).
- **Feature 3 — Búsqueda Híbrida:** keyword (Orama BM25) + semántica (embeddings + cosine client-side). Primera CF callable `embedQuery`. → [SPEC](features/SPEC-feature-3-busqueda-hibrida.md).
- **Feature 4 — Progressive Summarization:** 3 niveles de destilación L0→L1→L2→L3 sobre TipTap + badge con popover. → [SPEC](features/SPEC-feature-4-progressive-summarization.md).
- **Feature 5 — Bubble Menu + Link:** toolbar flotante en selección con 6 botones inline. → [SPEC](features/SPEC-feature-5-bubble-menu.md).
- **Feature 6 — Theme System + Paleta Violet:** 3 modos (Claro/Auto/Oscuro) con paleta oklch hue 285° + script anti-flash. → [SPEC](features/SPEC-feature-6-theme-system.md).
- **Feature 7 — Capture Multi-Monitor:** ventana `/capture` centrada en monitor del cursor (Rust-side `tray.rs::show_capture`). → [SPEC](features/SPEC-feature-7-multi-monitor-capture.md).
- **Feature 8 — Tauri Auto-Updater:** auto-update in-app con tag-based CI + firma ed25519 + tray trigger. → [SPEC](features/SPEC-feature-8-tauri-auto-updater.md).
- **Feature 9 — Capacitor Auto-Update (Android):** mismo flujo F8 para APK Android via Firebase App Distribution. → [SPEC](features/SPEC-feature-9-capacitor-auto-update.md).
- **Feature 10 — Capa de Repos (`src/infra/repos/`):** factory `createFirestoreRepo` (sync→async) + 6 repos por entidad, hooks delegan persistencia. → [SPEC](features/SPEC-feature-10-repos-layer.md).
- **Feature 11 — Store isolation + gating correcto:** `useStoreInit` con `delTable` cleanup + `useStoreHydration` Provider, cierra cross-user data leak. → [SPEC](features/SPEC-feature-11-store-isolation-gating.md).
- **Feature 12 — Persister diff-based:** `setPersisted` consume `changes` de TinyBase v8, write amplification O(N) → O(cambios). → [SPEC](features/SPEC-feature-12-persister-diff-based.md).
- **Feature 13 — GitHub Actions Node 24 migration:** bump actions a major v5 + prerelease guard `-rc`/`-beta`. → [SPEC](features/SPEC-feature-13-actions-node24-migration.md).
- **Feature 14 — Editor UX polish:** paste sanitization + slash menu flip dinámico + `padding-bottom: 50vh`. → [SPEC](features/SPEC-feature-14-editor-ux-polish.md).
- **Feature 15 — UI polish post-dogfooding:** scrollbar fantasma, shell skeleton responsive, copy imperativo neutro, H1 mobile oculto. → [SPEC](features/SPEC-feature-15-ui-polish.md).
- **Feature 16 — Code blocks scroll horizontal:** fix CSS preflight Tailwind v4 pisaba `white-space: pre`. → [SPEC](features/SPEC-feature-16-code-block-scroll.md).
- **Feature 17 — useEditorPopup hook unificado:** unifica popups slash + wikilink, encapsula Floating UI + lifecycle + close-on-scroll. → [SPEC](features/SPEC-feature-17-editor-popup-hook.md).
- **Feature 18 — Notas favoritas y soft delete:** `isFavorite` + `deletedAt` + cluster top-right en NoteCard + `ConfirmDialog`. → [SPEC](features/SPEC-feature-18-notas-favoritos-y-delete.md).
- **Feature 19 — Papelera con auto-purga configurable:** segmento 3 tabs en `/notes` + `trashAutoPurgeDays` + primera CF scheduled `autoPurgeTrash` + cleanup cascada via `onNoteDeleted`. → [SPEC](features/SPEC-feature-19-papelera-de-notas.md).
- **Feature 20 — Search en papelera + preferencia defaultNoteType:** search en 3 tabs (preferencia revertida en F21). → [SPEC](features/SPEC-feature-20-trash-search-y-prefs.md).
- **Feature 21 — aiSummary fleeting default:** revierte F20 F3/F4 + surfacea `aiSummary` huérfano en NoteCard. → [SPEC](features/SPEC-feature-21-aisummary-fleeting-default.md).
- **Feature 22 — Distill levels descubribilidad:** badge L0 visible + popover auto-abre primer mount + banner ascendente per-nivel. → [SPEC](features/SPEC-feature-22-distill-discoverability.md).
- **Feature 23 — AI suggestions:** banner contextual en editor con accept/dismiss + AI server-side via `autoTagNote` extendida + heurística client-side. → [SPEC](features/SPEC-feature-23-ai-suggestions.md).
- **Feature 24 — FSRS Widget Mejorado:** ReviewCard separado de hubs con copy `Te toca/Te tocan N`, botón "Ver todas las due" cuando >5, tab "Por revisar" en `/notes` con search local + deep-link. → [SPEC](features/SPEC-feature-24-fsrs-widget.md).
- **Feature 26 — Inbox: batch processing + confidence:** CF `processInboxItem` devuelve `confidence: number (0..1)` global, UI agrupa items en buckets "Alta confianza ≥0.85" / "Revisar" con botón "Aceptar N items" sobre el bucket alto. → [SPEC](features/SPEC-feature-26-inbox-batch-confidence.md).
- **Feature 27 — Cleanup deuda QA Inbox+Notas:** borra campo muerto `relatedNoteIds` de `InboxAiResult`, cleanup `setTimeout` batchStatus en unmount con `useEffect` (patrón canónico F22), borra embedding stale en `generateEmbedding` cuando `contentPlain` queda vacío con guard de existencia. → [SPEC](features/SPEC-feature-27-cleanup-deuda-qa.md).
- **Feature 28 — `saveContent` retry/rollback:** retry queue in-memory en `src/lib/saveQueue.ts` con backoff `[1s, 2s, 4s]` sobre 4 attempts máximos, `SaveStatus` extendido a 5 estados derivado vía `useSyncExternalStore`, banner top-of-page con [Reintentar / Descartar / Copiar contenido] tras 4 fallos consecutivos. Listeners `beforeunload` + `online` para flush + recovery instantáneo, Tauri close-to-tray con timeout 2s. Cierra silent data loss del path `notesRepo.saveContent`. → [SPEC](features/SPEC-feature-28-savecontent-retry.md).
- **Feature 29 — Retry queue extendido al factory `createFirestoreRepo`:** lleva el patrón F28 al factory entero con 7 singletons (`saveContentQueue` + 6 meta queues por entidad) en `src/lib/saveQueue.ts`. `RepoConfig<Row>` parametrizado con `queue?: SaveQueue<Partial<Row>>` inyectable; `update`/`remove` delegan al queue cuando existe. Bypasses notes (`acceptSuggestion`/`dismissSuggestion`) reusan `saveNotesMetaQueue` con composite keys. `<PendingSyncIndicator />` en sidebar/header con popover per-entity counts + [Reintentar / Descartar]. Sign-out mid-retry guard (recheck uid). `removeRaw` bypass para `purgeAll` (LRU cap). `clear()` separado de `dispose()` para test isolation. Row types extraídos a leaf `src/types/repoRows.ts`. → [SPEC](features/SPEC-feature-29-factory-retry-queue.md).
- **Feature 30 — Retry queue extendido a los creates:** cierra el silent data loss en `create*` del factory. 4 nuevos singletons dedicados por entidad (`saveNotesCreatesQueue`, `saveTasksCreatesQueue`, `saveProjectsCreatesQueue`, `saveObjectivesCreatesQueue`) con queue dedicado por entidad para evitar upsert collision con metas. `RepoConfig.createsQueue?` opcional + sign-out guard idéntico a update/remove (G1). `create` retorna id sync sin await del enqueue, preservando contrato `Promise<string>`. `useNote` subscribe via `useSyncExternalStore` con `createEntryStatus` en deps del effect → re-fetch automático al status='synced' (G3'). `page.tsx` cross-check en useEffect redirect Y skeleton condition. `notesRepo.saveContent` migra de `updateDoc` a `setDoc(merge:true)` (D9) para tolerar `not-found` durante create-pending. `ENTITY_LABELS` con 4 entries custom ("nota nueva" vs "edición de nota", D8). `createsQueueBindings` exportado para que `handleDiscardAll` haga `delRow` ANTES de `clear()` (G4). Race onSnapshot post-error documentado y aceptado v1 (G6). → [SPEC](features/SPEC-feature-30-creates-retry-queue.md).
- **Feature 31 — Hidden Sidebar Mode (desktop):** pref `sidebarHidden: boolean` en `UserPreferences` (mismo shape que `distillIntroSeen` de F22). Layout `src/app/layout.tsx` consume `usePreferences()` y deriva `showSidebar`/`showTopBar` con AND-gate sobre `prefsLoaded` (D7 anti-flash, revisada en F32.4). Componente nuevo `<TopBar />` con `<img src="/favicon.svg" />` (asset oficial del repo) + `<PendingSyncIndicator compact />` + botón Buscar ⌘K + `<QuickCaptureButton />`. Gate `{!sidebarHidden && <QuickCaptureButton/>}` en `src/app/page.tsx` evita duplicación del CTA en hidden mode (D8, riesgo #1 flagueado por Plan agent). Hook nuevo `useSidebarVisibilityShortcut` con 3 guards (foco `activeElement.matches('input, textarea, select, [contenteditable]')`, auth `if (!user) return`, breakpoint `=== 'desktop'`) usando `event.code === 'KeyB'` para independencia del layout físico. `SidebarVisibilitySelector` en `/settings` con wrapper `hidden lg:block`. `QUICK_ACTIONS` del CommandPalette pasa de 4 a 8 entries (suma Dashboard/Hábitos/Objetivos/Settings) con iconos armonizados a `navItems.ts` (Tareas → CheckSquare, Proyectos → FolderKanban). → [SPEC](features/SPEC-feature-31-hidden-sidebar.md).
- **Feature 32 — Hidden Sidebar Mode Improvements:** cierre de las cuatro deudas explícitas de F31. F32.2 migra Cmd+K (CommandPaletteProvider) y Alt+N (QuickCaptureProvider) a `event.code === 'KeyK'`/`'KeyN'` para layout-independence universal (paridad con F31.5; sin guards de `activeElement` agregados — Cmd+K/Alt+N no colisionan con atajos del editor). F32.4 cierra D7 anti-flash con localStorage hint por uid (`secondmind:sidebarHidden:${uid}`) en `src/lib/preferences.ts`; `usePreferences` hidrata `sidebarHidden` síncronamente pre-subscribe + escribe hint solo cuando `loaded === true` (evita pisar hint válido con DEFAULT pre-snapshot del cache compartido). `layout.tsx` quita AND-gate sobre `prefsLoaded` para `sidebarHidden`. F32.1 suma 9ª entry dinámica al CommandPalette ("Ocultar sidebar" / "Mostrar sidebar" según estado), solo desktop con sesión; `QuickAction` pasa a discriminated union `{ kind: 'navigate' | 'handler' }`; `quickActions` se compute con `useMemo` deps `[breakpoint, user, preferences.sidebarHidden]` para reactividad si el toggle se dispara desde otro entrypoint con palette abierto. F32.3 anima el componente entrante (sidebar `slide-in-from-left` o TopBar `slide-in-from-top`, `duration-200`) solo en cambios subsecuentes de `preferences.sidebarHidden` — mount inicial NO anima (clave post-F32.4 anti-flash). Approach asimétrico: el saliente desmonta instantáneo. `useLayoutEffect` (no useEffect) en `layout.tsx` dispara setAnimateLayoutSwap pre-paint para que el entrante reciba la clase en su PRIMER frame visible — descubierto en E2E sampling DOM cada 30ms (gap de ~30ms con useEffect generaba blip retro-anim). → [SPEC](features/SPEC-feature-32-hidden-sidebar-improvements.md).
- **Feature 34 — Sidebar reorganización + dashboard cleanup:** Sidebar nav agrupado en 3 secciones (Ejecución/Captura/Conocimiento) en `src/components/layout/navItems.ts` con `navSections` + `navItems` derivado por flatMap. Buscar como input-shaped trigger embebido al tope del nav abriendo CommandPalette. Capturar como botón primary full-width abriendo QuickCapture; `QuickCaptureButton` movido de `components/dashboard/` a `components/capture/`. Dashboard header simplificado al solo Greeting (eliminado el botón "Capturar" redundante con la prop del sidebar). Drawer + modal nested resuelto con `onClose() + requestAnimationFrame(open)` handshake (escalado a gotchas). → [SPEC](features/SPEC-feature-34-sidebar-reorg.md).
- **Feature 35 — Polish swap chrome (sidebar↔TopBar):** F35.1 extiende `useMountedTransition` con `justMounted: boolean` state-based + `setTimeout` matching `durationMs` (no `useRef + 1-render-only` — animation flags deben sobrevivir re-renders mid-animación, escalado a gotchas). El consumer pasa `animateEntry={animateLayoutSwap && transition.justMounted}` cerrando el blip animate-in en toggle rápido <200ms. F35.2 sidebar always-floating overlay en desktop (`floating={!isMobile && !isTablet}` aplica `absolute inset-y-0 left-0 z-30`) + `transition-[padding-left] duration-200` en main column con `paddingLeft: showSidebar ? '16rem' : '0'`. `overflow-x-hidden` defensivo en outer flex. Cierra escenarios A (visible→hidden pop) y B (hidden→visible shift). D2 Option B (always-floating) chosen sobre conditional floating del plan original — el conditional causaba timing issues con la transition de padding-left. Tablet inline `w-16` sin overlay; mobile NavigationDrawer intacto. → [SPEC](features/SPEC-feature-35-swap-chrome-polish.md).
- **Feature 33 — Hidden Sidebar Mode Polish:** cierra dos deudas residuales del out-of-scope de F32. F33.1 introduce hook reutilizable `useMountedTransition(visible: boolean, durationMs: number): { shouldRender, isExiting }` ([src/hooks/useMountedTransition.ts](../src/hooks/useMountedTransition.ts)) con patrón `setState durante render` (paridad `useExpandThenCollapse:19-38`) — state combinado `{ shouldRender, isExiting, prevVisible }` + check `if (state.prevVisible !== visible)` durante render. Skip-initial gratis sin `useRef`, pre-paint timing sin `useLayoutEffect` (D7). Sidebar y TopBar suman prop opcional `animateExit?: boolean`; cuando `true` aplican `animate-out slide-out-to-X fill-mode-forwards duration-200` vía `cn()`. `fill-mode-forwards` obligatorio sin el cual el componente revierte 1 frame pre-unmount (D4). Layout coordina con `animateEntry={animateLayoutSwap && !transition.isExiting}` (mutua exclusión G1) + `animateExit={transition.isExiting}`. `showSidebar`/`showTopBar` movidos arriba del early return de `isLoading` para compatibilidad con rules-of-hooks (G2). F33.2 suma botón explícito "Mostrar menú" al TopBar a la izquierda del logo, icono `PanelLeftOpen`, `aria-label="Mostrar menú"` + `title`, click → `setPreferences(uid, { sidebarHidden: false })`. Wrapper `<div className="flex items-center gap-1">` agrupa botón + Link en cluster izquierdo del header. 6 tests unitarios + 7 E2E con sampling DOM cada 30ms validados; mutua exclusión `animateEntry`/`animateExit` confirmada en Tests 1-2 (saliente NO recibe animate-in espurio). → [SPEC](features/SPEC-feature-33-hidden-sidebar-polish.md).
- **Feature 36 — Cache stale + flujo de update sin intervención manual:** ataque a 5 capas que se manifestaban como "no me permite crear ideas" tras update. F1 headers no-cache + immutable. F2-F4 PWA `registerType: 'prompt'` + `<UpdateBanner>` + `flushAll()` antes de reload. F7 hook JS-side `useVersionCheck` (defense in depth web/Capacitor). F7.1 purga Rust-side ANTES del WebView load — chicken-and-egg con SW residual cohorte pre-F36 fase B (workbox `skipWaiting: true`); QA empírica confirmó msedgewebview2 file locks durante setup callback (PermissionDenied 32 ratio 100% incluso post-taskkill) → F9.A cleanup dejó solo `clear_all_browsing_data()` puro en `version_check.rs`. F8 schema versioning independiente TinyBase + UserPreferences con purge-on-mismatch asimétrico (D-F8.1: TinyBase null=mismatch=purge zero data loss; preferences `_schemaVersion` ausente=compat V1 para no resetear cohorte v0.2.4). F9.B release v0.2.5 coordinado expuso bug latente CI (`VITE_GOOGLE_OAUTH_CLIENT_ID/SECRET` faltaban en `release-tauri` heredoc, oculto desde release inicial porque sesión Firebase persistida del user nunca disparaba el sign-in screen) → hotfix v0.2.6. F5/F6 Sentry + F9.C web E2E + F9.D Android E2E descartados del backlog activo (single-user, sin trigger). → [SPEC](features/SPEC-feature-36-cache-stale-update-flow.md).
- **Feature 37 — Optimización del corpus de gotchas (split + skill BM25):** `Spec/ESTADO-ACTUAL.md` se splittea en (a) índice de features liviano + (b) índice de gotchas con 1 línea por entry apuntando a canon en `Spec/gotchas/<dominio>.md` (15 archivos por dominio). Skill local `~/.claude/skills/gotchas-search/` con BM25 stdlib (k1=1.5 b=0.75, peso título 2× body) sobre `corpus.json` autogenerado. Hook PostToolUse reindex sobre edits a `Spec/gotchas/*.md`. CLAUDE.md gana 5 pointers acotados sin imponer flujo de subagentes (Fase C original diferida hasta evidencia de fricción manual). → [SPEC](features/SPEC-feature-37-gotchas-flow-optimization.md).
- **Feature 38 — Clean Arch cleanup post-F37:** cierra 3 deudas localizadas detectadas en audit + agrega guard rail. F38.1 `linksRepo` (factory + método custom `syncLinks` con `Promise.all` paralelo) + orquestador `src/infra/syncLinksFromEditor.ts` (Opción A pragmática, plano sin `operations/` YAGNI) reemplazan `lib/editor/syncLinks.ts` (126 líneas pre-F10 eliminadas). `LinkRow` agregado a `repoRows.ts`. Gotcha cross-entity nuevo en `gotchas/relaciones-entidades.md`. F38.2 `notesRepo.subscribeSuggestions(noteId, callback): () => void` + interface `NoteSuggestionsSnapshot` exportada; `useNoteSuggestions` elimina imports `firebase/firestore` + `@/lib/firebase`, useEffect 22→4 líneas. F38.3 `inboxRepo.createFromCapture(rawContent, source: InboxSource)` enumera 14 cells defaults explícitos del schema + delega al factory (gana retry F30 via `saveInboxQueue`); `app/capture/page.tsx` `handleSave` simplificado a 1 await, `serverTimestamp()` → `Date.now()`. `QuickCaptureProvider.save` queda con `inboxStore.setRow` directo + persister F12 (path canónico, D4). F38.4 ESLint `no-restricted-imports` mandatory bloquea `firebase/firestore`/`firebase/auth` en `src/components/**` y `src/hooks/**` con `allowTypeImports: true` (D5 — cubre excepción #3 type imports cross-layer sin globs adicionales) + globs de excepción `**/useNote.ts` (#2 lectura MVP), `**/useAuth.ts` (#1 multi-plataforma), tests. `Docs/04 § Reglas a setear` línea 424 anotada como implementada. E2E Playwright validó 4 escenarios (wikilinks crear/borrar, suggestions vía proxy unit tests + 0 console errors, capture page con CF processing, guard rail negativo con archivo temporal). 157 tests pasando (+16 vs F37). → [SPEC](features/SPEC-feature-38-clean-arch-cleanup.md).
- **Feature 40 — Splash Screen Android (system + branded):** reemplaza el splash legacy violeta (`#878bf9` sin logo, ícono del launcher genérico) por flujo en dos capas. Capa 1 (system splash, Android 12+ SplashScreen API): `styles.xml` migra de `android:background="@drawable/splash"` legacy (que `Theme.SplashScreen` ignora) a los attrs canónicos `windowSplashScreenBackground=@color/splashBackground` + `windowSplashScreenAnimatedIcon=@drawable/ic_launcher_foreground` + `postSplashScreenTheme=@style/AppTheme.NoActionBar`. Light/dark via `values/colors.xml` (`#ffffff`) + `values-night/colors.xml` (`#0a0a0a`). Capa 2 (branded React, post-system-handoff): `<AppBootSplash>` con `<img src="/favicon.svg" h-[174px] w-[174px]>` posicionado absoluto centrado (`top-1/2 left-1/2 -translate-x/y-1/2`) + `<h1>SecondMind</h1>` a `top-[calc(50%+7rem)]`. Tamaño 174px calibrado empíricamente para matchear el icon del system splash en Samsung (no aplica masking circular sin `windowSplashScreenIconBackgroundColor`, así que la teoría 192dp×0.6=115dp underestima visible). `useHideSplashWhenReady` simplificado a `useEffect(() => { void hideSplash(); }, [])` — dispara al primer mount del Layout para que el system splash desaparezca apenas React puede pintar (incluso con `isLoading=true` el AppBootSplash ya está rendereado). Min duration 800ms via `bootSplashMinElapsed` state asegura que el branded splash sea perceptible en cold starts rápidos. Safety timeout 5s en `main.tsx` para crash pre-mount. F1 `@capacitor/assets generate` con `--logoSplashScale 0.2` produjo PNG splash drawables (densidades light + dark) que quedan inertes con la API attrs nuevas pero se mantienen committeados; recovery proactivo `git checkout HEAD -- mipmap-anydpi-v26/` post-tool restaura los XML adaptive icon (vector drawable nítido API 26+) que la tool sobrescribe por PNGs rasterizados. QA en Samsung R5CW30T2FDV requirió `adb install -r --user 0 app-debug.apk` + `am start --user 0` (default va a user 150 Secure Folder por DUAL_APP). 5 gotchas escalados a `gotchas/capacitor-mobile.md`. → [SPEC](features/SPEC-feature-40-splash-android.md).

- **Feature 39 — Fix grafo en Tauri (CSP `worker-src`):** el knowledge graph (`/notes/graph`) renderizaba canvas vacío en build Tauri v0.2.6 con header "N notas · M conexiones" + dos errores en consola: `Creating a worker from 'blob:http://tauri.localhost/<uuid>' violates Content Security Policy` y `Attribute undefined is not a number for node <noteId>`. Cadena causal: CSP de Tauri no declara `worker-src` (cae al fallback `script-src` que no incluye `blob:`) → `graphology-layout-forceatlas2` (dep transitiva de Reagraph 4.30.8) no puede crear su Web Worker desde `URL.createObjectURL(new Blob([code]))` → nodos del grafo Graphology nunca reciben coords `x`/`y` → renderer Three.js falla. Fix mínimo en [`src-tauri/tauri.conf.json:43-44`](../src-tauri/tauri.conf.json) — agregar `"worker-src": "'self' blob:"` como key explícita y sumar `blob:` a `script-src`. `blob:` en `script-src` es **requisito**, no defensivo: troika-three-text usa `importScripts()` heredado del worker que necesita `blob:` en `script-src` del worker context. Web (Firebase Hosting sin `<meta CSP>`) y Capacitor Android (sin policy) no aplican CSP custom — bug 100% Tauri-only. Release v0.2.7 vía tag `v*` dispara `release-tauri` (objetivo: MSI/NSIS + updater) y `release-capacitor` (APK funcionalmente idéntico, solo bump versionName); web manual sigue v0.2.6. Gotcha nuevo en `gotchas/graph-webgl.md` (anchor `reagraph-crea-web-workers-desde-blob-uris-tauri-requiere-worker-src-y-blob-en-script-src-del-csp-post-f39`). → [SPEC](features/SPEC-feature-39-grafo-tauri-csp-workers.md).

---

## Cloud Functions

6 CFs desplegadas en `us-central1` (Node.js 22), todas con `retry: false`:

- **`processInboxItem`** — `onDocumentCreated('users/{userId}/inbox/{itemId}')`, `timeoutSeconds: 60`. Claude Haiku con tool `classify_inbox` + `INBOX_CLASSIFICATION_SCHEMA`. Escribe 6 campos flat `aiSuggested*` + `aiProcessed: true`.
- **`autoTagNote`** — `onDocumentWritten('users/{userId}/notes/{noteId}')`, `timeoutSeconds: 60`. Claude Haiku con tool `tag_note` + `NOTE_TAGGING_SCHEMA`. Escribe `aiTags`, `aiSummary`, `aiProcessed: true`.
- **`generateEmbedding`** — `onDocumentWritten('users/{userId}/notes/{noteId}')`, `timeoutSeconds: 60`. OpenAI `text-embedding-3-small` (1536 dims). Guard por `contentPlain` vacío + `contentHash` SHA-256. Escribe a `users/{userId}/embeddings/{noteId}`.
- **`embedQuery`** — `onCall` v2 (`firebase-functions/v2/https`), `timeoutSeconds: 10`. Input `{ text: string }` ≤500 chars, output `{ vector: number[] }`. Mismo modelo que `generateEmbedding`.
- **`onNoteDeleted`** — `onDocumentDeleted('users/{userId}/notes/{noteId}')`, cleanup cascada (embeddings + links bidireccionales) con WriteBatch chunked.
- **`autoPurgeTrash`** — `onSchedule('0 3 * * *', timeZone: 'UTC')`, scheduled hard-delete de notas en papelera tras `trashAutoPurgeDays`.

---

## Gotchas por dominio (índice)

> Cada gotcha vive como `## <título>` en su archivo de dominio. Para detalle (cuerpo, código, paths), abrir el archivo correspondiente.
> Para búsqueda BM25 sobre el corpus, usar la skill local `gotchas-search` (CLI Python — `python ~/.claude/skills/gotchas-search/search.py <query>`).

### TinyBase + Firestore sync — [`gotchas/tinybase-firestore.md`](gotchas/tinybase-firestore.md)

- [Persister con `merge: true` es precondición global](gotchas/tinybase-firestore.md#persister-con-merge-true-es-precondición-global)
- [Capa de repos en `src/infra/repos/` centraliza el patrón optimistic (desde F10)](gotchas/tinybase-firestore.md#capa-de-repos-en-srcinfrarepos-centraliza-el-patrón-optimistic-desde-f10)
- [TinyBase v8 muta el objeto pasado a `setRow` y `setPartialRow`](gotchas/tinybase-firestore.md#tinybase-v8-muta-el-objeto-pasado-a-setrow-y-setpartialrow)
- [Creación de recursos con navegación inmediata: `await repo.create(...)` → `navigate()`](gotchas/tinybase-firestore.md#creación-de-recursos-con-navegación-inmediata-await-repocreate-navigate)
- [Content largo (TipTap JSON) sigue yendo solo a Firestore, NO a TinyBase](gotchas/tinybase-firestore.md#content-largo-tiptap-json-sigue-yendo-solo-a-firestore-no-a-tinybase)
- [Write amplification resuelto por F12 (persister diff-based)](gotchas/tinybase-firestore.md#write-amplification-resuelto-por-f12-persister-diff-based)
- [Cross-user data leak resuelto por F11](gotchas/tinybase-firestore.md#cross-user-data-leak-resuelto-por-f11)
- [Limitación TinyBase v8 (post-F12): `changes` NO incluye row IDs eliminados](gotchas/tinybase-firestore.md#limitación-tinybase-v8-post-f12-changes-no-incluye-row-ids-eliminados)
- [Items de inbox nunca se borran físicamente](gotchas/tinybase-firestore.md#items-de-inbox-nunca-se-borran-físicamente)
- [Embeddings NO van en TinyBase](gotchas/tinybase-firestore.md#embeddings-no-van-en-tinybase)
- [Gate de hidratación: `useStoreHydration()` (signal real, post-F11)](gotchas/tinybase-firestore.md#gate-de-hidratación-usestorehydration-signal-real-post-f11)
- [TinyBase Cell types no soportan `null` (post-F18)](gotchas/tinybase-firestore.md#tinybase-cell-types-no-soportan-null-post-f18)
- [Doc único reactivo (no-collection): `onSnapshot` directo con cache module-level + dedupe (post-F19)](gotchas/tinybase-firestore.md#doc-único-reactivo-no-collection-onsnapshot-directo-con-cache-module-level-dedupe-post-f19)
- [`setDoc({merge: true})` con dot-notation NO crea path nested (post-F22)](gotchas/tinybase-firestore.md#setdocmerge-true-con-dot-notation-no-crea-path-nested-post-f22)
- [Backwards-compat de jobs scheduled con datos pre-feature: hardcodear `FIRST_DEPLOY_TS` (post-F19)](gotchas/tinybase-firestore.md#backwards-compat-de-jobs-scheduled-con-datos-pre-feature-hardcodear-first_deploy_ts-post-f19)
- [`arrayUnion` requires `updateDoc`, NO `setDoc(merge:true)` (post-F23)](gotchas/tinybase-firestore.md#arrayunion-requires-updatedoc-no-setdocmergetrue-post-f23)
- [Factory entero retry-protected via queue inyectado per-entidad (post-F29)](gotchas/tinybase-firestore.md#factory-entero-retry-protected-via-queue-inyectado-per-entidad-post-f29)
- [`SaveQueue<T>.clear()` separado de `dispose()` para test isolation (post-F29)](gotchas/tinybase-firestore.md#savequeuetclear-separado-de-dispose-para-test-isolation-post-f29)
- [`useSyncExternalStore` agregado: subscribe app-lifetime + `getSnapshot` cached-by-version (post-F29)](gotchas/tinybase-firestore.md#usesyncexternalstore-agregado-subscribe-app-lifetime-getsnapshot-cached-by-version-post-f29)
- [Discard de cambios locales no persistidos: key bump del componente padre + re-fetch del hook one-shot (post-F28)](gotchas/tinybase-firestore.md#discard-de-cambios-locales-no-persistidos-key-bump-del-componente-padre-re-fetch-del-hook-one-shot-post-f28)
- [Campos CF-write-only con persister F12 quedan FUERA del schema TinyBase (post-F23)](gotchas/tinybase-firestore.md#campos-cf-write-only-con-persister-f12-quedan-fuera-del-schema-tinybase-post-f23)
- [Schema versioning local de cache (post-F36.F8 — v0.2.4+)](gotchas/tinybase-firestore.md#schema-versioning-local-de-cache-post-f36f8-v024)

### Relaciones entre entidades — [`gotchas/relaciones-entidades.md`](gotchas/relaciones-entidades.md)

- [Vinculaciones 1:N: el lado singular es autoritativo](gotchas/relaciones-entidades.md#vinculaciones-1n-el-lado-singular-es-autoritativo)
- [Links bidireccionales con IDs determinísticos](gotchas/relaciones-entidades.md#links-bidireccionales-con-ids-determinísticos)
- [ID determinístico `YYYY-MM-DD` para hábitos](gotchas/relaciones-entidades.md#id-determinístico-yyyy-mm-dd-para-hábitos)
- [`useBacklinks` auto-refresca `sourceTitle`](gotchas/relaciones-entidades.md#usebacklinks-auto-refresca-sourcetitle)
- [Orquestador cross-entity toca stores directo, no via repo (post-F38.1)](gotchas/relaciones-entidades.md#orquestador-cross-entity-toca-stores-directo-no-via-repo-post-f381)

### Editor (TipTap) — [`gotchas/editor-tiptap.md`](gotchas/editor-tiptap.md)

- [TipTap WikiLinks son Nodes, no Marks](gotchas/editor-tiptap.md#tiptap-wikilinks-son-nodes-no-marks)
- [`extractLinks()` se ejecuta en cada save](gotchas/editor-tiptap.md#extractlinks-se-ejecuta-en-cada-save)
- [Auto-save debounce 2s](gotchas/editor-tiptap.md#auto-save-debounce-2s)
- [Múltiples `@tiptap/suggestion` plugins necesitan `pluginKey` explícito](gotchas/editor-tiptap.md#múltiples-tiptapsuggestion-plugins-necesitan-pluginkey-explícito)
- [`@` trigger con `allow()` blacklist alfanumérica](gotchas/editor-tiptap.md#-trigger-con-allow-blacklist-alfanumérica)
- [Popups del editor encapsulados en `useEditorPopup<TItem>` (post-F17)](gotchas/editor-tiptap.md#popups-del-editor-encapsulados-en-useeditorpopuptitem-post-f17)
- [Scroll listener tras char trigger requiere defer 1 task tick](gotchas/editor-tiptap.md#scroll-listener-tras-char-trigger-requiere-defer-1-task-tick)
- [`scroll` events no burbujean](gotchas/editor-tiptap.md#scroll-events-no-burbujean)
- [Slash menu items con `keywords?: string[]`](gotchas/editor-tiptap.md#slash-menu-items-con-keywords-string)
- [Slash menu NO sirve para inline marks (highlight/link)](gotchas/editor-tiptap.md#slash-menu-no-sirve-para-inline-marks-highlightlink)
- [Templates como `JSONContent[]`, no HTML/Markdown](gotchas/editor-tiptap.md#templates-como-jsoncontent-no-htmlmarkdown)
- [StarterKit v3 incluye Link, Underline y ListKeymap por default](gotchas/editor-tiptap.md#starterkit-v3-incluye-link-underline-y-listkeymap-por-default)
- [`@tiptap/react/menus` es el import v3 correcto](gotchas/editor-tiptap.md#tiptapreactmenus-es-el-import-v3-correcto)
- [`useEditorState` obligatorio para reactividad de `isActive()` en React](gotchas/editor-tiptap.md#useeditorstate-obligatorio-para-reactividad-de-isactive-en-react)
- [`shouldShow` de BubbleMenu definido module-level](gotchas/editor-tiptap.md#shouldshow-de-bubblemenu-definido-module-level)
- [`extendMarkRange('link')` antes de `setLink`/`unsetLink`](gotchas/editor-tiptap.md#extendmarkrangelink-antes-de-setlinkunsetlink)
- [`e.preventDefault() + e.stopPropagation()` en Enter/Escape dentro de inputs en floating menus](gotchas/editor-tiptap.md#epreventdefault-estoppropagation-en-enterescape-dentro-de-inputs-en-floating-menus)
- [Node ProseMirror `atom: true` + `contenteditable="false"` NO emite textContent en DOM](gotchas/editor-tiptap.md#node-prosemirror-atom-true-contenteditablefalse-no-emite-textcontent-en-dom)
- [Pill `.wikilink::before { content: '@' }` no se copia al clipboard](gotchas/editor-tiptap.md#pill-wikilinkbefore-content-no-se-copia-al-clipboard)
- [`SlashCommand.configure({ noteId })` y `Wikilink.configure({ noteId })` dependen de remount por nota](gotchas/editor-tiptap.md#slashcommandconfigure-noteid-y-wikilinkconfigure-noteid-dependen-de-remount-por-nota)
- [Textarea auto-resize: `el.style.height = '0px'` antes de `scrollHeight`](gotchas/editor-tiptap.md#textarea-auto-resize-elstyleheight-0px-antes-de-scrollheight)
- [Progressive Summarization: `computeDistillLevel(doc, summaryL3)` usa walk recursivo](gotchas/editor-tiptap.md#progressive-summarization-computedistillleveldoc-summaryl3-usa-walk-recursivo)
- [BubbleMenu v3 NO anima entrada/salida automáticamente](gotchas/editor-tiptap.md#bubblemenu-v3-no-anima-entradasalida-automáticamente)
- [iOS Safari selection toolbar coexiste con BubbleMenu](gotchas/editor-tiptap.md#ios-safari-selection-toolbar-coexiste-con-bubblemenu)
- [Paste sin `transformPastedHTML` preserva atributos HTML del nodo aunque el schema filtre marks](gotchas/editor-tiptap.md#paste-sin-transformpastedhtml-preserva-atributos-html-del-nodo-aunque-el-schema-filtre-marks)
- [Menús anchored en cursor position usan `@floating-ui/dom` con virtual element + `autoUpdate` (post-F14)](gotchas/editor-tiptap.md#menús-anchored-en-cursor-position-usan-floating-uidom-con-virtual-element-autoupdate-post-f14)
- [`padding-bottom: 50vh` en `.note-editor .ProseMirror` para breathing room al final de notas largas](gotchas/editor-tiptap.md#padding-bottom-50vh-en-note-editor-prosemirror-para-breathing-room-al-final-de-notas-largas)
- [Popup wikilinks sin `tippy.js`](gotchas/editor-tiptap.md#popup-wikilinks-sin-tippyjs)
- [Tokens de popup styling unificados](gotchas/editor-tiptap.md#tokens-de-popup-styling-unificados)
- [Marks viven en text nodes, no en containers](gotchas/editor-tiptap.md#marks-viven-en-text-nodes-no-en-containers)

### UI y componentes — [`gotchas/ui-componentes.md`](gotchas/ui-componentes.md)

- [Base-UI `@base-ui/react` para Dialog y Popover](gotchas/ui-componentes.md#base-ui-base-uireact-para-dialog-y-popover)
- [Base-UI usa `data-open` + `data-starting-style`/`data-ending-style`](gotchas/ui-componentes.md#base-ui-usa-data-open-data-starting-styledata-ending-style)
- [`npx shadcn@latest add <componente>` con style `base-nova` genera Base UI primitives, NO Radix](gotchas/ui-componentes.md#npx-shadcnlatest-add-componente-con-style-base-nova-genera-base-ui-primitives-no-radix)
- [`setIsOpen(true) → requestAnimationFrame → focus()` obligatorio para colapsables](gotchas/ui-componentes.md#setisopentrue-requestanimationframe-focus-obligatorio-para-colapsables)
- [Empty state con filtros activos: no hacer early return](gotchas/ui-componentes.md#empty-state-con-filtros-activos-no-hacer-early-return)
- [Quick Capture shortcut `Alt+N`](gotchas/ui-componentes.md#quick-capture-shortcut-altn)
- [Shortcuts globales con modificador: `event.code` (post-F31, universal post-F32.2)](gotchas/ui-componentes.md#shortcuts-globales-con-modificador-eventcode-post-f31-universal-post-f322)
- [localStorage hint por uid para flags solo-UI con persistencia Firestore que afectan layout (post-F32.4)](gotchas/ui-componentes.md#localstorage-hint-por-uid-para-flags-solo-ui-con-persistencia-firestore-que-afectan-layout-post-f324)
- [`Intl.DateTimeFormat('es', { weekday: 'narrow' })`](gotchas/ui-componentes.md#intldatetimeformates-weekday-narrow-)
- [TypeScript infiere el tipo de evento en handlers inline (post React 19)](gotchas/ui-componentes.md#typescript-infiere-el-tipo-de-evento-en-handlers-inline-post-react-19)
- [`overflow-x-auto` sin `overflow-y-hidden` explícito dispara scrollbar vertical fantasma en Chrome/Edge Windows (post-F15)](gotchas/ui-componentes.md#overflow-x-auto-sin-overflow-y-hidden-explícito-dispara-scrollbar-vertical-fantasma-en-chromeedge-windows-post-f15)
- [Copy UI en imperativo neutro (post-F15)](gotchas/ui-componentes.md#copy-ui-en-imperativo-neutro-post-f15)
- [`useEffect` cleanup compartido entre side-effect y auto-dismiss timer = anti-patrón (post-F22, reconfirmado F28)](gotchas/ui-componentes.md#useeffect-cleanup-compartido-entre-side-effect-y-auto-dismiss-timer-anti-patrón-post-f22-reconfirmado-f28)
- [`role="region"` para banners persistentes; `role="status" aria-live="polite"` solo para efímeros (post-F23)](gotchas/ui-componentes.md#roleregion-para-banners-persistentes-rolestatus-aria-livepolite-solo-para-efímeros-post-f23)
- [Optimistic state vive en una sola fuente (hook), no duplicado en componente (post-F23)](gotchas/ui-componentes.md#optimistic-state-vive-en-una-sola-fuente-hook-no-duplicado-en-componente-post-f23)
- [H1 duplicado en mobile oculto con estrategia granular (post-F15)](gotchas/ui-componentes.md#h1-duplicado-en-mobile-oculto-con-estrategia-granular-post-f15)
- [Anchor scroll en React Router NO es automático (post-F19)](gotchas/ui-componentes.md#anchor-scroll-en-react-router-no-es-automático-post-f19)
- [Tap target 44×44 en desktop también](gotchas/ui-componentes.md#tap-target-4444-en-desktop-también)
- [Patrón `setState durante render` con state combinado `{ value, key }` para detectar cambios de prop en hooks reutilizables (post-F33)](gotchas/ui-componentes.md#patrón-setstate-durante-render-con-state-combinado-value-key-para-detectar-cambios-de-prop-en-hooks-reutilizables-post-f33)
- [`fill-mode-forwards` obligatorio en `animate-out` aplicado vía `cn()` con boolean (post-F33)](gotchas/ui-componentes.md#fill-mode-forwards-obligatorio-en-animate-out-aplicado-vía-cn-con-boolean-post-f33)
- [Drawer + modal nested: `onClose() + requestAnimationFrame(open)` handshake (post-F34)](gotchas/ui-componentes.md#drawer-modal-nested-onclose-requestanimationframeopen-handshake-post-f34)
- [`@custom-variant dark (&:is(.dark *))` NO matchea `<html class="dark">` por sí mismo](gotchas/ui-componentes.md#custom-variant-dark-isdark-no-matchea-html-classdark-por-sí-mismo)
- [`color-scheme: light/dark` property obligatoria](gotchas/ui-componentes.md#color-scheme-lightdark-property-obligatoria)
- [Script inline anti-flash en `<head>` antes del `<script type="module">`](gotchas/ui-componentes.md#script-inline-anti-flash-en-head-antes-del-script-typemodule)
- [`resolvedTheme` snapshot DEBE leer del DOM](gotchas/ui-componentes.md#resolvedtheme-snapshot-debe-leer-del-dom)
- [Custom event `sm-theme-change` para notificación same-tab](gotchas/ui-componentes.md#custom-event-sm-theme-change-para-notificación-same-tab)
- [Theme default = `auto`, no `dark`](gotchas/ui-componentes.md#theme-default-auto-no-dark)
- [localStorage del tema es per-plataforma](gotchas/ui-componentes.md#localstorage-del-tema-es-per-plataforma)
- [Tokens `--shadow-modal`, `--background-deep`, `--border-strong`](gotchas/ui-componentes.md#tokens---shadow-modal---background-deep---border-strong)

### Responsive & Mobile UX — [`gotchas/responsive-mobile-ux.md`](gotchas/responsive-mobile-ux.md)

- [Breakpoint detection via `useSyncExternalStore` + `matchMedia`](gotchas/responsive-mobile-ux.md#breakpoint-detection-via-usesyncexternalstore-matchmedia)
- [Render condicional JSX para shell, CSS para layouts internos](gotchas/responsive-mobile-ux.md#render-condicional-jsx-para-shell-css-para-layouts-internos)
- [`SidebarContent` exportado y reusado por `NavigationDrawer`](gotchas/responsive-mobile-ux.md#sidebarcontent-exportado-y-reusado-por-navigationdrawer)
- [`viewport-fit=cover` en `index.html`](gotchas/responsive-mobile-ux.md#viewport-fitcover-en-indexhtml)
- [Tap targets ≥44×44 via wrapper label](gotchas/responsive-mobile-ux.md#tap-targets-4444-via-wrapper-label)
- [`<table>` + sticky `th/td:first-child` para HabitGrid](gotchas/responsive-mobile-ux.md#table-sticky-thtdfirst-child-para-habitgrid)
- [BottomNav fixed + `calc(80px + var(--sai-bottom))` height](gotchas/responsive-mobile-ux.md#bottomnav-fixed-calc80px-var--sai-bottom-height)
- [Cache del SW persiste entre reinstalaciones del APK en Capacitor](gotchas/responsive-mobile-ux.md#cache-del-sw-persiste-entre-reinstalaciones-del-apk-en-capacitor)
- [Grid mobile-first con `grid-cols-1` explícito](gotchas/responsive-mobile-ux.md#grid-mobile-first-con-grid-cols-1-explícito)
- [`@media (hover: hover)` se evalúa por input device, NO por viewport](gotchas/responsive-mobile-ux.md#media-hover-hover-se-evalúa-por-input-device-no-por-viewport)

### Knowledge Graph y WebGL — [`gotchas/graph-webgl.md`](gotchas/graph-webgl.md)

- [Ruta `notes/graph` ANTES de `notes/:noteId` en router.tsx](gotchas/graph-webgl.md#ruta-notesgraph-antes-de-notesnoteid-en-routertsx)
- [Three.js NO procesa strings `oklch()`](gotchas/graph-webgl.md#threejs-no-procesa-strings-oklch)
- [Reagraph `<GraphCanvas>` tiene canvas blanco hardcoded](gotchas/graph-webgl.md#reagraph-graphcanvas-tiene-canvas-blanco-hardcoded)
- [Reagraph en Tauri requiere CSP de 3 canales: `worker-src` + `blob:` en `script-src` + `cdn.jsdelivr.net` en `connect-src` (post-F39)](gotchas/graph-webgl.md#reagraph-en-tauri-requiere-csp-de-3-canales-worker-src--blob-en-script-src--cdnjsdelivrnet-en-connect-src-post-f39)

### Búsqueda Híbrida — [`gotchas/busqueda-hibrida.md`](gotchas/busqueda-hibrida.md)

- [Primera CF callable del proyecto usa `onCall` v2](gotchas/busqueda-hibrida.md#primera-cf-callable-del-proyecto-usa-oncall-v2)
- [Cache de embeddings module-level compartido](gotchas/busqueda-hibrida.md#cache-de-embeddings-module-level-compartido)
- [Threshold empírico con `text-embedding-3-small` + notas cortas en español: 0.30](gotchas/busqueda-hibrida.md#threshold-empírico-con-text-embedding-3-small-notas-cortas-en-español-030)
- [Pipeline semántico en orden estricto, per-note dentro del loop](gotchas/busqueda-hibrida.md#pipeline-semántico-en-orden-estricto-per-note-dentro-del-loop)
- [Race handling con snapshot del query, no `AbortController`](gotchas/busqueda-hibrida.md#race-handling-con-snapshot-del-query-no-abortcontroller)
- [Command Palette: Orama rebuild con debounce 100ms](gotchas/busqueda-hibrida.md#command-palette-orama-rebuild-con-debounce-100ms)
- [Orama sync: full rebuild en cada `addTableListener` es el patrón](gotchas/busqueda-hibrida.md#orama-sync-full-rebuild-en-cada-addtablelistener-es-el-patrón)
- [Full rebuild de índices < 50ms](gotchas/busqueda-hibrida.md#full-rebuild-de-índices-50ms)

### FSRS y resurfacing — [`gotchas/fsrs-resurfacing.md`](gotchas/fsrs-resurfacing.md)

- [FSRS opt-in requiere botón explícito](gotchas/fsrs-resurfacing.md#fsrs-opt-in-requiere-botón-explícito)
- [`Math.random()` no es seedable en JavaScript](gotchas/fsrs-resurfacing.md#mathrandom-no-es-seedable-en-javascript)

### PWA + Offline — [`gotchas/pwa-offline.md`](gotchas/pwa-offline.md)

- [`vite-plugin-pwa` con `generateSW` y `autoUpdate`](gotchas/pwa-offline.md#vite-plugin-pwa-con-generatesw-y-autoupdate)
- [TinyBase es el offline layer](gotchas/pwa-offline.md#tinybase-es-el-offline-layer)
- [Guards offline solo en features AI](gotchas/pwa-offline.md#guards-offline-solo-en-features-ai)
- [`useOnlineStatus` usa `useSyncExternalStore`](gotchas/pwa-offline.md#useonlinestatus-usa-usesyncexternalstore)
- [`maximumFileSizeToCacheInBytes: 4MB` en workbox config](gotchas/pwa-offline.md#maximumfilesizetocacheinbytes-4mb-en-workbox-config)

### Chrome Extension — [`gotchas/chrome-extension.md`](gotchas/chrome-extension.md)

- [Proyecto separado en `extension/`](gotchas/chrome-extension.md#proyecto-separado-en-extension)
- [CRXJS 2.4.0 + Vite 8](gotchas/chrome-extension.md#crxjs-240-vite-8)
- [Auth: `chrome.identity.getAuthToken()` + `signInWithCredential()`](gotchas/chrome-extension.md#auth-chromeidentitygetauthtoken-signinwithcredential)
- [Firebase SDK lite](gotchas/chrome-extension.md#firebase-sdk-lite)
- [Items del extension se crean con `source: 'web-clip'`](gotchas/chrome-extension.md#items-del-extension-se-crean-con-source-web-clip)
- [Sin encolamiento offline](gotchas/chrome-extension.md#sin-encolamiento-offline)

### Tauri Desktop — [`gotchas/tauri-desktop.md`](gotchas/tauri-desktop.md)

- [`src-tauri/` integrado en el raíz del proyecto](gotchas/tauri-desktop.md#src-tauri-integrado-en-el-raíz-del-proyecto)
- [Ventana `/capture` como ruta top-level, fuera de Layout](gotchas/tauri-desktop.md#ventana-capture-como-ruta-top-level-fuera-de-layout)
- [Hook JS en `main.tsx` se monta en TODAS las ventanas del bundle](gotchas/tauri-desktop.md#hook-js-en-maintsx-se-monta-en-todas-las-ventanas-del-bundle)
- [Global shortcut registrado Rust-side](gotchas/tauri-desktop.md#global-shortcut-registrado-rust-side)
- [Close-to-tray en JS via `onCloseRequested`](gotchas/tauri-desktop.md#close-to-tray-en-js-via-oncloserequested)
- [Single-instance plugin obligatorio con autostart](gotchas/tauri-desktop.md#single-instance-plugin-obligatorio-con-autostart)
- [Window-state plugin con denylist `["capture"]`](gotchas/tauri-desktop.md#window-state-plugin-con-denylist-capture)
- [Feature `tray-icon` obligatorio en `Cargo.toml`](gotchas/tauri-desktop.md#feature-tray-icon-obligatorio-en-cargotoml)
- [Capabilities Tauri v2 NO soportan wildcards](gotchas/tauri-desktop.md#capabilities-tauri-v2-no-soportan-wildcards)
- [IDE marca capabilities "not accepted" tras agregar plugin](gotchas/tauri-desktop.md#ide-marca-capabilities-not-accepted-tras-agregar-plugin)
- [CSP Firebase explícito en `tauri.conf.json`](gotchas/tauri-desktop.md#csp-firebase-explícito-en-tauriconfjson)
- [Auth en Tauri NO usa `signInWithPopup`](gotchas/tauri-desktop.md#auth-en-tauri-no-usa-signinwithpopup)
- [Shortcut global `Ctrl+Shift+Space`](gotchas/tauri-desktop.md#shortcut-global-ctrlshiftspace)
- [`--legacy-peer-deps` también para `@tauri-apps/*`](gotchas/tauri-desktop.md#--legacy-peer-deps-también-para-tauri-apps)
- [Bundle MSI + NSIS ambos activos](gotchas/tauri-desktop.md#bundle-msi-nsis-ambos-activos)
- [Capture multi-monitor (Feature 7)](gotchas/tauri-desktop.md#capture-multi-monitor-feature-7)
- [Drag de capture window fue revertido (F7 round 3)](gotchas/tauri-desktop.md#drag-de-capture-window-fue-revertido-f7-round-3)
- [Menu items inmutables post-build en Tauri](gotchas/tauri-desktop.md#menu-items-inmutables-post-build-en-tauri)
- [`Tauri 2.10 clear_all_browsing_data()` es nuclear sin parámetros (post-F36.F7.1)](gotchas/tauri-desktop.md#tauri-210-clear_all_browsing_data-es-nuclear-sin-parámetros-post-f36f71)
- [msedgewebview2.exe mantiene file locks activos durante el setup callback (post-F36.F7.1)](gotchas/tauri-desktop.md#msedgewebview2exe-mantiene-file-locks-activos-durante-el-setup-callback-post-f36f71)
- [`tauri-plugin-log` debe registrarse unconditional para visibilidad en release builds (post-F36.F7.1)](gotchas/tauri-desktop.md#tauri-plugin-log-debe-registrarse-unconditional-para-visibilidad-en-release-builds-post-f36f71)
- [MSI uninstaller borra `%LOCALAPPDATA%\<bundle_id>\` completo automáticamente (post-F36.F7.1, menor)](gotchas/tauri-desktop.md#msi-uninstaller-borra-localappdatabundle_id-completo-automáticamente-post-f36f71-menor)
- [tauri-action NO propaga env vars del step `env:` al subprocess `beforeBuildCommand` en Windows runners](gotchas/tauri-desktop.md#tauri-action-no-propaga-env-vars-del-step-env-al-subprocess-beforebuildcommand-en-windows-runners)
- [`createUpdaterArtifacts` en `tauri.conf.json` acepta `true`/`false`/`"v1Compatible"` solamente](gotchas/tauri-desktop.md#createupdaterartifacts-en-tauriconfjson-acepta-truefalsev1compatible-solamente)
- [Tauri `plugin-updater` trata HTTP 404 como error](gotchas/tauri-desktop.md#tauri-plugin-updater-trata-http-404-como-error)
- [DevTools desactivadas en production builds de Tauri](gotchas/tauri-desktop.md#devtools-desactivadas-en-production-builds-de-tauri)
- [`gh release delete <tag> --cleanup-tag --yes`](gotchas/tauri-desktop.md#gh-release-delete-tag---cleanup-tag---yes)
- [`gh` CLI con PAT default no puede cancelar workflow runs](gotchas/tauri-desktop.md#gh-cli-con-pat-default-no-puede-cancelar-workflow-runs)
- [Update flow E2E requiere ≥2 releases secuenciales](gotchas/tauri-desktop.md#update-flow-e2e-requiere-2-releases-secuenciales)
- [Hook JS `useAutoUpdate` se monta en ambas ventanas main + capture](gotchas/tauri-desktop.md#hook-js-useautoupdate-se-monta-en-ambas-ventanas-main-capture)
- [Tray command → emit event → JS handler](gotchas/tauri-desktop.md#tray-command-emit-event-js-handler)
- [Capacitor 8 exige Node >=22 y JDK 21 en el runner Android](gotchas/tauri-desktop.md#capacitor-8-exige-node-22-y-jdk-21-en-el-runner-android)
- [Prerelease guard dinámico para tags `-rc`/`-beta` (F13)](gotchas/tauri-desktop.md#prerelease-guard-dinámico-para-tags--rc-beta-f13)
- [Patrón RC-tag + cleanup para validar workflow changes end-to-end (F13)](gotchas/tauri-desktop.md#patrón-rc-tag-cleanup-para-validar-workflow-changes-end-to-end-f13)
- [Actions del workflow pineadas a major o version inmutable, nunca a `@v0` / tags movibles (F13)](gotchas/tauri-desktop.md#actions-del-workflow-pineadas-a-major-o-version-inmutable-nunca-a-v0-tags-movibles-f13)
- [`gradlew` pierde el bit executable tras `git checkout` en `ubuntu-latest`](gotchas/tauri-desktop.md#gradlew-pierde-el-bit-executable-tras-git-checkout-en-ubuntu-latest)
- [SHA-1 del release keystore debe registrarse en Firebase Console ANTES del primer CI release](gotchas/tauri-desktop.md#sha-1-del-release-keystore-debe-registrarse-en-firebase-console-antes-del-primer-ci-release)
- [`versionName`/`versionCode` del APK via Gradle props `-P` derivados del tag](gotchas/tauri-desktop.md#versionnameversioncode-del-apk-via-gradle-props--p-derivados-del-tag)
- [`google-services.json` inyectado via secret base64 (no committed)](gotchas/tauri-desktop.md#google-servicesjson-inyectado-via-secret-base64-no-committed)
- [Toda nueva `VITE_*` requiere bumpear el heredoc `.env.production` en cada job CI que la consume (post-F36.F9.B)](gotchas/tauri-desktop.md#toda-nueva-vite_-requiere-bumpear-el-heredoc-envproduction-en-cada-job-ci-que-la-consume-post-f36f9b)

### Capacitor Mobile — [`gotchas/capacitor-mobile.md`](gotchas/capacitor-mobile.md)

- [`android/` commiteado al repo](gotchas/capacitor-mobile.md#android-commiteado-al-repo)
- [`server.androidScheme: 'https'` obligatorio](gotchas/capacitor-mobile.md#serverandroidscheme-https-obligatorio)
- [Google Sign-In nativo: patrón universal](gotchas/capacitor-mobile.md#google-sign-in-nativo-patrón-universal)
- [Web Client ID compartido para todas las plataformas](gotchas/capacitor-mobile.md#web-client-id-compartido-para-todas-las-plataformas)
- [`MainActivity.java implements ModifiedMainActivityForSocialLoginPlugin`](gotchas/capacitor-mobile.md#mainactivityjava-implements-modifiedmainactivityforsocialloginplugin)
- [Share Intent reusa QuickCaptureProvider](gotchas/capacitor-mobile.md#share-intent-reusa-quickcaptureprovider)
- [Ícono Android: VectorDrawable extraído del `public/favicon.svg`](gotchas/capacitor-mobile.md#ícono-android-vectordrawable-extraído-del-publicfaviconsvg)
- [System splash adaptativo via SplashScreen API attrs (post-F40)](gotchas/capacitor-mobile.md#system-splash-adaptativo-via-splashscreen-api-attrs-post-f40)
- [Android 12+ SplashScreen API limita branded splash a icon centrado sobre color (post-F40)](gotchas/capacitor-mobile.md#android-12-splashscreen-api-limita-branded-splash-a-icon-centrado-sobre-color)
- [`useHideSplashWhenReady` dispara al primer mount, NO al fin del bootstrap (post-F40)](gotchas/capacitor-mobile.md#usehidesplashwhenready-dispara-al-primer-mount-no-al-fin-del-bootstrap)
- [`@capacitor/assets generate` sobrescribe `mipmap-anydpi-v26/ic_launcher{,_round}.xml` (post-F40)](gotchas/capacitor-mobile.md#capacitorassets-generate-sobrescribe-mipmap-anydpi-v26ic_launcher_roundxml)
- [Samsung multi-user: `adb install` default va a user 150 (Secure Folder), no user 0 (post-F40)](gotchas/capacitor-mobile.md#samsung-multi-user-adb-install-default-va-a-user-150-secure-folder-no-user-0)
- [Edge-to-edge via `env(safe-area-inset-*)` en el `body`](gotchas/capacitor-mobile.md#edge-to-edge-via-envsafe-area-inset--en-el-body)
- [Capacitor CLI `cap run android` falla en Windows por `gradlew` sin `.bat`](gotchas/capacitor-mobile.md#capacitor-cli-cap-run-android-falla-en-windows-por-gradlew-sin-bat)
- [Auth branching order: `isCapacitor()` ANTES de `isTauri()` ANTES de web](gotchas/capacitor-mobile.md#auth-branching-order-iscapacitor-antes-de-istauri-antes-de-web)
- [Launcher cache Android no invalida ícono tras reinstalar APK](gotchas/capacitor-mobile.md#launcher-cache-android-no-invalida-ícono-tras-reinstalar-apk)

### Tooling local — [`gotchas/tooling-local.md`](gotchas/tooling-local.md)

- [Helpers compartidos existentes](gotchas/tooling-local.md#helpers-compartidos-existentes)
- [`vi.mock(...)` se hoistea al top del archivo de test por Vitest](gotchas/tooling-local.md#vimock-se-hoistea-al-top-del-archivo-de-test-por-vitest)
- [TypeScript LSP plugin requiere patch en Windows](gotchas/tooling-local.md#typescript-lsp-plugin-requiere-patch-en-windows)
- [Firebase MCP: `node` directo al CLI local, no `npx`](gotchas/tooling-local.md#firebase-mcp-node-directo-al-cli-local-no-npx)
- [Brave Search: `BRAVE_API_KEY` como variable de sistema Windows](gotchas/tooling-local.md#brave-search-brave_api_key-como-variable-de-sistema-windows)
- [ui-ux-pro-max symlinks rotos en Windows](gotchas/tooling-local.md#ui-ux-pro-max-symlinks-rotos-en-windows)

### Cloud Functions — Tool use con schema enforcement — [`gotchas/cloud-functions-schema.md`](gotchas/cloud-functions-schema.md)

- [Anthropic enforce `enum` en JSON Schema, NO `minimum`/`maximum`](gotchas/cloud-functions-schema.md#anthropic-enforce-enum-en-json-schema-no-minimummaximum)
- [Confidence retornada por Haiku 4.5 varía con la claridad del input, no es plana](gotchas/cloud-functions-schema.md#confidence-retornada-por-haiku-45-varía-con-la-claridad-del-input-no-es-plana)
- [Prompt caching `cache_control: { type: 'ephemeral' }` en system block de CFs Anthropic](gotchas/cloud-functions-schema.md#prompt-caching-cache_control-type-ephemeral-en-system-block-de-cfs-anthropic)

### Cloud Functions — Guards y edge cases — [`gotchas/cloud-functions-guards.md`](gotchas/cloud-functions-guards.md)

- [`aiProcessed` guard en `autoTagNote`](gotchas/cloud-functions-guards.md#aiprocessed-guard-en-autotagnote)
- [`onDocumentWritten` en vez de `onDocumentCreated` para notas](gotchas/cloud-functions-guards.md#ondocumentwritten-en-vez-de-ondocumentcreated-para-notas)
- [`convertToNote` setea `aiProcessed: true` cuando hay tags del inbox](gotchas/cloud-functions-guards.md#converttonote-setea-aiprocessed-true-cuando-hay-tags-del-inbox)
- [Secret management](gotchas/cloud-functions-guards.md#secret-management)
- [`contentHash` guard en `generateEmbedding`](gotchas/cloud-functions-guards.md#contenthash-guard-en-generateembedding)
- [Runtime Node.js 22 en functions](gotchas/cloud-functions-guards.md#runtime-nodejs-22-en-functions)
- [`firebase-functions` v7 obligatorio](gotchas/cloud-functions-guards.md#firebase-functions-v7-obligatorio)
- [`.gitignore` de functions: `/lib/` con anchor](gotchas/cloud-functions-guards.md#gitignore-de-functions-lib-con-anchor)
- [`autoTagNote` y `generateEmbedding` se disparan en CADA write a una nota (post-F18)](gotchas/cloud-functions-guards.md#autotagnote-y-generateembedding-se-disparan-en-cada-write-a-una-nota-post-f18)
- [`aiSummary` queda stale tras edición de la nota (post-F21)](gotchas/cloud-functions-guards.md#aisummary-queda-stale-tras-edición-de-la-nota-post-f21)
- [CFs `onDocumentWritten` son no-op-safe ante delete si chequean `if (!event.data?.after?.data()) return` al inicio (post-F19)](gotchas/cloud-functions-guards.md#cfs-ondocumentwritten-son-no-op-safe-ante-delete-si-chequean-if-eventdataafterdata-return-al-inicio-post-f19)
- [`retry: false` es decisión consciente en CFs trigger-based con LLM calls](gotchas/cloud-functions-guards.md#retry-false-es-decisión-consciente-en-cfs-trigger-based-con-llm-calls)
- [Cleanup en cascada de deletes via CF `onDocumentDeleted` + WriteBatch chunked (post-F19)](gotchas/cloud-functions-guards.md#cleanup-en-cascada-de-deletes-via-cf-ondocumentdeleted-writebatch-chunked-post-f19)
- [CFs scheduled con `onSchedule` v2 (post-F19, primer uso)](gotchas/cloud-functions-guards.md#cfs-scheduled-con-onschedule-v2-post-f19-primer-uso)
- [Firestore `firestore.rules` catch-all `match /users/{userId}/{document=**}`](gotchas/cloud-functions-guards.md#firestore-firestorerules-catch-all-match-usersuseriddocument)
- [Firestore RECHAZA single-field indexes en `firestore.indexes.json` (post-F19)](gotchas/cloud-functions-guards.md#firestore-rechaza-single-field-indexes-en-firestoreindexesjson-post-f19)
- [Bulk delete masivo: chunkear de 50; sleep 200ms entre chunks SOLO en CFs scheduled (post-F19)](gotchas/cloud-functions-guards.md#bulk-delete-masivo-chunkear-de-50-sleep-200ms-entre-chunks-solo-en-cfs-scheduled-post-f19)

---

## Dependencias clave

Tabla de versiones + notas operativas movida a [`Docs/01-arquitectura-hibrida-progresiva.md`](../Docs/01-arquitectura-hibrida-progresiva.md#dependencias-clave-con-historia) (sección "Dependencias clave con historia" dentro del stack técnico). Es referencia estática que rara vez se consulta — vive con el resto del stack.

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
- **Decodificar HTML entities en share intent (Capacitor Android)** — Chrome Android envía títulos con `&#34;` en vez de `"`. Trivial: `DOMParser` o `textarea.innerHTML = title`. Pendiente hasta que moleste en uso real.
- **Mover OAuth token exchange a Rust-side (`src-tauri/src/oauth.rs`)** — `tauriAuth.ts:118` hace `POST oauth2.googleapis.com/token` con `client_secret` inlineado del bundle JS distribuido. Anti-pattern de seguridad incluso para Desktop con PKCE: el secret queda inspeccionable descomprimiendo el MSI/NSIS. Refactor: el frontend invoca `invoke('exchange_code_for_id_token', { code, codeVerifier })`; Rust hace el POST con `client_secret` embebido en el binary (todavía descompilable pero menos accesible que en bundle JS). Alternativa equivalente: migrar el OAuth client GCP de tipo "Web app" a "Desktop app" puro y usar solo PKCE sin secret (Google permite oficialmente). Trigger: auditoría de seguridad o compliance. Origen: F36.F9.B post-mortem.
- **Distribución:** code signing Windows para MSI, Play Store publish (AAB + $25 one-time + privacy policy).
