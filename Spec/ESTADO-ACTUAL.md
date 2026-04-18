# Estado Actual — SecondMind (Snapshot consolidado)

> Última actualización: Feature 5 Bubble Menu + Link (Abril 2026)
> Este archivo consolida el conocimiento no-obvio de todas las fases completadas.
> Se actualiza al cerrar cada fase. Para detalle de features → README.md.
> Para detalle de implementación → Spec/SPEC-fase-X.md individual.

---

## Fases completadas

- **Fase 0** — Setup base: Vite + React 19 + TS strict + Tailwind v4 + Firebase + TinyBase v8
- **Fase 0.1** — Toolkit: MCPs (Firebase, Context7, Playwright, Brave), hooks Prettier/ESLint, protección main
- **Fase 1** — MVP: Quick Capture (Alt+N), TipTap editor con wikilinks, backlinks, Orama FTS, inbox, dashboard
- **Fase 2** — Ejecución: tareas con prioridad/fecha, proyectos con progreso, objetivos con deadline, habit tracker semanal
- **Fase 3** — AI Pipeline: CF processInboxItem + autoTagNote con Claude Haiku, InboxProcessor one-by-one, Command Palette (Ctrl+K)
- **Fase 3.1** — Schema Enforcement: tool use con JSON Schema en ambas CFs, eliminó nulls/stripJsonFence/fallbacks
- **Fase 4** — Grafo + Resurfacing: Knowledge graph (Reagraph), embeddings (OpenAI), notas similares, FSRS spaced repetition, Daily Digest
- **Fase 5** — PWA + Extension: PWA instalable (manifest, SW, offline support, install prompt), Chrome Extension MV3 (captura web, auth Google, write a inbox)
- **Fase 5.1** — Tauri Desktop: wrapper nativo Windows con system tray, close-to-tray, global shortcut `Ctrl+Shift+Space`, ventana de captura frameless, autostart opcional, window-state persistido, single-instance
- **Fase 5.2** — Capacitor Mobile (Android): wrapper nativo con Google Sign-In nativo (bottom sheet), Share Intent que pre-llena Quick Capture desde el sheet de Android, adaptive icon VectorDrawable extraído del SVG del PWA, splash purple, safe-area CSS edge-to-edge
- **Feature 1 — Responsive & Mobile UX**: shell responsive con breakpoints `mobile <768` / `tablet 768–1023` / `desktop ≥1024`. Mobile sin sidebar: MobileHeader + BottomNav (Dashboard/Notas/Tareas/Inbox/Más) + FAB para Quick Capture + NavigationDrawer (Dialog slide-in). Tablet con Sidebar collapsed 64px iconos-only + hamburger que abre el mismo NavigationDrawer. Desktop idéntico al previo. Tap targets ≥44×44, safe-area top/bottom/left/right, `viewport-fit=cover`. HabitGrid `<table>` con sticky `th/td:first-child` + botones 44×44 con visual 28×28 interno. QuickCapture con botones "Cancelar/Guardar" visibles en mobile (hints de teclado ocultos).
- **Feature 2 — Editor Polish**: `@` reemplaza `[[` como trigger de menciones con `allow()` blacklist alfanumérica (no dispara en emails/URLs), pill styling via CSS `::before: '@'` sin migración de datos (nodos `wikilink` existentes rehidratan con el nuevo look). Slash commands `/` con 12 items en 5 categorías (Texto, Listas, Bloques, Menciones, Templates) usando el mismo listener pattern + `createPortal` que WikilinkMenu, con `pluginKey` explícito por plugin para no colisionar. Templates Zettelkasten Literature y Permanent insertan scaffolding como `JSONContent[]` + actualizan `noteType` en TinyBase + Firestore via `auth.currentUser?.uid` en runtime. Fix Vite `dedupe: ['react', 'react-dom']` agregado para eliminar pantalla blanca por React duplicada desde `extension/node_modules/`. Deps nuevas: `@tiptap/extension-task-list` + `@tiptap/extension-task-item` (con `--legacy-peer-deps`).
- **Feature 3 — Búsqueda Híbrida**: `/notes` combina keyword (Orama BM25, instant) con semántica (embeddings existentes + cosine client-side, debounced 500ms). Primera CF callable del proyecto (`embedQuery` con `onCall` v2 de `firebase-functions/v2/https`, valida `request.auth` + text ≤500 chars, reusa secret `OPENAI_API_KEY` y modelo `text-embedding-3-small`). Cliente extendido con `getFunctions(app, 'us-central1')` + `httpsCallable`. Cache de embeddings module-level compartido entre `useSimilarNotes` y `useHybridSearch` (deduplica fetches, invalida en `signOut`). Hook `useHybridSearch` compone `useNoteSearch` + pipeline semántico: `filter isArchived → exclude keyword IDs → sort score desc → slice(0, 5)`. Race handling por snapshot del query (sin `AbortController` porque callable no lo expone). Degradación graceful: error de CF → `semanticResults: []` sin toast. UI: sección "Semánticamente similares" con heading + badge violet `bg-violet-500/10 text-violet-500` + Sparkles + score %. Si keyword vacío pero semántico presente: leyenda "No hay coincidencias exactas, pero estas notas son temáticamente similares." Threshold 0.30 calibrado empíricamente en E2E (0.45 del SPEC dejaba los matches genuinos justo debajo).
- **Feature 5 — Bubble Menu + Link**: Toolbar flotante al seleccionar texto con 6 botones inline (Bold, Italic, Strike, Code, Highlight, Link) — elimina el bloqueo de "mobile sin formato" y destapa el Link que ya venía en StarterKit v3 pero estaba sin UI. `@tiptap/react/menus` v3 (import `'@tiptap/react/menus'`, no `@tiptap/react`) con `@floating-ui/dom` direct dep aunque ya estaba transitivo vía `@base-ui/react`. `StarterKit.configure({ link: {...}, underline: false })` — StarterKit v3 incluye Link por default (verificado en `.d.ts`), el SPEC original que decía "instalar `@tiptap/extension-link`" quedó desactualizado; Underline también viene pero se deshabilita para preservar principio "en web se confunde con links". API `options` de BubbleMenu v3 expone middlewares como keys individuales (`{ offset: 8, flip: true, shift: { padding: 8 } }`), NO array. `useEditorState` con selector de **primitivos** (booleans + strings) → shallow compare automático. `shouldShow` **module-level** (fuera del componente) → referencia estable sin `useCallback`. State machine de 2 modos (`default` | `link-edit`) + branch de render en default para link-hover (cursor dentro de link sin selección muestra URL truncada + Abrir + Editar + Desvincular). `extendMarkRange('link')` antes de `setLink`/`unsetLink` para que aplique a todo el rango del link cuando el cursor está adentro. `LinkInput` hace `e.preventDefault() + e.stopPropagation()` en Enter y Escape para no burbujear al editor. Sin animación de entrada/salida (Notion tampoco anima). Tap targets 44×44 en todos los breakpoints — bubble de 291×54 cabe en 375 con `shift({ padding: 8 })`. iOS Safari selection toolbar coexiste con el bubble (known limitation sin workaround).
- **Feature 4 — Progressive Summarization**: 3 niveles de destilación de Tiago Forte sobre TipTap. L0 sin marcas → L1 bold (StarterKit) → L2 highlight (`@tiptap/extension-highlight` con `Ctrl+Shift+H`, default config, sin multicolor) → L3 resumen ejecutivo (textarea colapsable arriba del editor, autosave via hook unificado). `computeDistillLevel(doc, summaryL3)` es una función pura que recorre recursivamente el JSON de ProseMirror leyendo `marks` en los **text nodes** (no containers) — si solo inspeccionara paragraphs, siempre devolvería 0. `useNoteSave` extendido para manejar editor + textarea con un solo timer compartido (un `updateDoc` atómico por debounce, evita race de writes paralelos con `distillLevel` stale). Orden optimistic invertido: `setPartialRow` sincrónico antes de `await updateDoc` (reduce latency percibido del badge de "2s + red" a "2s puros"). DistillIndicator con `@base-ui/react/popover` (primer uso de Popover en el proyecto, convención idéntica al Dialog ya usado en 7 archivos) muestra badge L0/L1/L2/L3 con colores progresivos + tip contextual + botón "Escribir resumen L3". El botón del popover llama `setIsOpen(true) → requestAnimationFrame → focus()` (rAF obligatorio — si el colapsable está cerrado, el textarea no existe en DOM todavía). Orama schema + `NoteOramaDoc` + `rowToOramaDoc` extended con `distillLevel` para el badge en NoteCard (L0 oculto, L1 azul, L2 amarillo, L3 verde con paleta `bg-<color>-500/15 text-<color>-700 dark:text-<color>-400`). Slash menu item "Resaltar" DESCARTADO (desviación del SPEC): los slash commands disparan sin selección activa → `toggleHighlight` es no-op silencioso. Único entrypoint a L2: `Ctrl+Shift+H`. Cero migración (schema de TinyBase + type `Note` ya tenían `summaryL3` + `distillLevel`).

---

## Arquitectura y decisiones vigentes

### TinyBase + Firestore sync

- **Persister con `merge: true` es precondición global.** Sin merge, el persister borra campos escritos fuera del schema TinyBase (como `content` de notas, campos `ai*` de CFs). Descubierto en Fase 1; aplica a todo persister nuevo.
- **Content largo de notas (TipTap JSON) va directo a Firestore, NO en TinyBase.** `useNoteSave` es el único punto que escribe `content`. Nuevas features no deben tocar ese campo.
- **Creación de recursos: orden estricto** — `await setDoc(Firestore)` → `store.setRow(TinyBase)` → `navigate()`. Invertir causa race con `useNote.getDoc` en la página destino.
- **Items de inbox nunca se borran físicamente** — se marcan `status: 'processed'` o `'dismissed'`. El filter pending los oculta. Preserva historial.

### Relaciones entre entidades

- **Vinculaciones 1:N: el lado singular es autoritativo.** `project.objectiveId === objective.id` es más robusto que `objective.projectIds.includes(projectId)` para render. Evita drift visual si el usuario reasigna.
- **Links bidireccionales con IDs determinísticos** — `source__target` como docId en `links/`. `extractLinks()` se ejecuta en cada save del editor y sincroniza la colección.

### Optimistic updates

- **Local-first: `setPartialRow` sync ANTES de `setDoc` async.** Invertir causa races en clicks rápidos porque click N+1 lee `existingRow` stale. Bug encontrado en `useHabits.toggleHabit` (Fase 2). Los demás hooks mantienen orden inverso pero deberían revisarse si aparecen síntomas similares.

### PWA + Offline

- **`vite-plugin-pwa` con `generateSW` y `autoUpdate`.** El SW se genera automaticamente en build. `navigateFallback: 'index.html'` permite SPA routing offline. `navigateFallbackDenylist: [/^\/api/, /^\/__\//]` evita interceptar rutas Firebase internas.
- **TinyBase es el offline layer.** Los datos en memoria sobreviven a la perdida de red. El persister con `autoSave` sincroniza al reconectar. No se usa `enableOfflineDataPersistence()` de Firestore.
- **Guards offline solo en features AI.** Las escrituras locales (notas, tareas, habitos) funcionan via TinyBase. Solo "Procesar" inbox (Cloud Functions + Claude) y SimilarNotesPanel (embeddings Firestore) se deshabilitan offline.
- **`useOnlineStatus` usa `useSyncExternalStore`** — mas correcto semanticamente que useState+useEffect para suscripciones a APIs del browser.

### Tauri Desktop (Fase 5.1)

- **`src-tauri/` integrado en el raíz del proyecto** — no es un proyecto separado. Tauri consume el output de Vite (`dist/`) tal cual. `tauri:dev` lanza Vite + Tauri juntos.
- **Ventana `/capture` como ruta top-level, fuera de Layout.** Layout hidrata sidebar + TinyBase + editor pesado; capture debe abrir en <200ms. Top-level = solo auth + textarea + `setDoc` directo.
- **Escritura directa a Firestore (no TinyBase) desde `/capture`.** Mismo patrón que la extension — la ventana es efímera, no tiene sentido hidratar el persister. Main window recibe el snapshot reactivo vía `onSnapshot` en ~200-800ms y reconcilia solo.
- **Global shortcut registrado en JS con `@tauri-apps/plugin-global-shortcut`.** Más simple que Rust-side. El callback hace `show() + setFocus()` de la webview `capture` desde `getAllWebviewWindows()`. Cleanup con `unregister()` en unmount.
- **Close-to-tray en JS via `onCloseRequested`.** Hook `useCloseToTray` en `main.tsx` llama `event.preventDefault()` + `getCurrentWebviewWindow().hide()`. Se monta en cada ventana del bundle (main y capture comparten `main.tsx`), así ambas hacen hide en vez de cerrar proceso.
- **Single-instance plugin obligatorio con autostart.** Sin él, doble-click tras boot (autostart + click manual) crea dos procesos, dos trays, y el segundo falla al registrar el global shortcut. `tauri_plugin_single_instance::init` intercepta el segundo lanzamiento y hace `show() + set_focus()` de la instancia existente.
- **Window-state plugin con denylist `["capture"]`.** `Builder::default().with_denylist(&["capture"]).build()` — capture siempre centrada (nunca recuerda pos). Main sí persiste pos/size automáticamente.
- **`CheckMenuItemBuilder` para autostart toggle.** Menu items de Tauri v2 son inmutables post-build. El estado checked se actualiza via handle guardado: `item.set_checked(!enabled)` en el handler. No requiere rebuild del menu.
- **Feature `tray-icon` obligatorio en `Cargo.toml`.** `tauri::tray` está gated detrás de `features = ["tray-icon"]` — sin esta feature, `cargo check` falla con "could not find tray in tauri".
- **Shortcut global `Ctrl+Shift+Space`** (no `Alt+Shift+N` del SPEC original). Cero conflictos en Windows: Chrome no lo usa, VS Code solo con editor enfocado ("parameter hints"). UX tipo Spotlight.
- **`Alt+N` local sigue intacto** — listener en QuickCaptureProvider funciona con main window enfocada. `Ctrl+Shift+Space` es OS-level, combo distinto, sin colisión.
- **CSP Firebase explícito en `tauri.conf.json`.** Incluye `https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://apis.google.com` en `connect-src` + `frame-src` para auth popups. Sin esto, auth + firestore fallan en release build.
- **Capabilities separadas por ventana.** `default.json` → `windows: ["main"]` con tray/menu/window/global-shortcut/autostart. `capture.json` → `windows: ["capture"]` con solo window show/hide/focus. Principio de mínimo privilegio.
- **Capabilities schema en v2 NO soporta wildcards.** Usar `core:tray:default`, `core:menu:default`, `core:window:allow-*` enumerado. Nada de `core:tray:*`.
- **IDE diagnostics de capabilities pueden estar stale.** El schema generado (`src-tauri/gen/schemas/desktop-schema.json`) se regenera en `cargo build`. Si la IDE marca permissions como "not accepted" tras agregar un plugin, correr `cargo check` una vez y recargar la IDE.
- **`data-tauri-drag-region`** en el header de `/capture` permite arrastrar ventana frameless sin JS.
- **`--legacy-peer-deps` también para `@tauri-apps/*` packages.** Mismo issue con Vite 8 que vite-plugin-pwa.
- **Bundle MSI + NSIS ambos activos** en `tauri.conf.json` targets. MSI para distribución corporativa, NSIS para auto-updater futuro. Output en `src-tauri/target/release/bundle/{msi,nsis}/`.
- **Primer `cargo build` tarda 5-10 min** (compila ~400 crates). Incrementales después son 10-30s.
- **Auth en Tauri NO usa `signInWithPopup`.** Firebase popup auth usa `window.open` + `postMessage`, pero Tauri WebView2 abre `window.open` en el navegador del sistema y el popup no puede comunicarse de vuelta (procesos distintos). El fix: OAuth Desktop flow custom — `useAuth` detecta `isTauri()` y usa `signInWithTauri` que (1) arranca HTTP listener local en Rust via comando `start_oauth_listener` en `src-tauri/src/oauth.rs`, (2) abre Google OAuth URL en browser del sistema via `@tauri-apps/plugin-shell`, (3) escucha el evento `oauth://callback`, (4) intercambia code por `id_token` en `oauth2.googleapis.com/token`, (5) `signInWithCredential` con `GoogleAuthProvider.credential(id_token)`. PKCE (code_challenge S256) + state CSRF.
- **Credenciales OAuth Desktop en `.env.local` (gitignored):** `VITE_GOOGLE_OAUTH_CLIENT_ID` + `VITE_GOOGLE_OAUTH_CLIENT_SECRET`. OAuth Client tipo "Desktop app" creado en Google Cloud Console (proyecto `secondmindv1`). Google acepta redirect URIs loopback (`http://127.0.0.1:*`) automáticamente sin listarlas.
- **Capability scoped `shell:allow-open`** con allowlist `accounts.google.com/**` y `oauth2.googleapis.com/**`. Sin scope, cualquier URL podría abrirse desde JS; con scope solo los dominios OAuth.
- **OAuth listener es one-shot.** El thread del `TcpListener` acepta una conexión y termina. Si el usuario retry (cierra browser, reabre), hay que volver a llamar `start_oauth_listener` (pasa automáticamente porque el botón Sign in re-invoca el flujo completo).

### Capacitor Mobile (Fase 5.2)

- **`android/` commiteado al repo** — patrón Capacitor estándar: incluye `app/src/`, `variables.gradle`, `build.gradle`, Gradle wrapper. Gitignored: `android/app/build/`, `android/.gradle/`, `android/local.properties`, `*.apk`, `*.keystore`. Primera build requiere Android Studio + SDK 36 + `ANDROID_HOME` y `JAVA_HOME` env vars (Capacitor CLI `cap run android` falla silenciosamente sin ellas en Windows porque llama a `gradlew` sin `.bat`; workaround: `./gradlew.bat assembleDebug` directo + `adb install` + `adb shell am start`).
- **`server.androidScheme: 'https'` obligatorio** en `capacitor.config.ts`. Sin esto, Firebase Auth rechaza el WebView por origen HTTP.
- **Google Sign-In nativo: `SocialLogin.login({ provider: 'google' })` → `idToken` → `GoogleAuthProvider.credential(idToken)` → `signInWithCredential(auth, credential)`.** Mismo patrón universal que Tauri (`signInWithTauri`) y Chrome Extension (`signInWithChrome`) — solo cambia cómo se obtiene el idToken. El `signInWithPopup` de Firebase NO funciona en WebView Android (no hay proceso de browser para el popup).
- **Web Client ID compartido para todas las plataformas.** El Android Client ID de GCP solo sirve para validar el SHA-1 del keystore; no se usa en código. `VITE_GOOGLE_WEB_CLIENT_ID` en `.env.local` + `<string name="server_client_id">` en `strings.xml` (necesario para el plugin nativo de Capgo).
- **`MainActivity.java` implementa `ModifiedMainActivityForSocialLoginPlugin`** con `onActivityResult` forwarding a `SocialLoginPlugin.handleGoogleLoginIntent`. Obligatorio por design del plugin Capgo — sin esto, el intent result del Google Sign-In queda huérfano y la promesa nunca resuelve.
- **Share Intent reusa QuickCaptureProvider (no ruta separada).** A diferencia de Tauri `/capture` (ventana efímera) o la Extension (popup), en Capacitor la app completa ya está cargada con el provider montado. `useShareIntent` llama `quickCapture.open(content, { source, sourceUrl })` → meta stasheado en `pendingMetaRef` → `save()` lo consume como defaults.
- **`QuickCaptureProvider.open(content?, { source?, sourceUrl? })` y `save(rawContent)`**: los meta son stasheados en `pendingMetaRef` (ref, no state, para evitar re-renders) y consumidos por `save` como defaults. Callers previos (Alt+N, QuickCaptureButton) no cambian — todos los params son opcionales.
- **Ícono Android: VectorDrawable extraído del `public/favicon.svg`.** `@capacitor/assets generate` distorsiona los íconos (recorta para adaptive icon v26+ sin respetar el diseño original). Solución: copiar los `<path d="">` del SVG a `<path android:pathData="">` del VectorDrawable (formato compatible), `<group android:translateX/Y>` para normalizar el viewBox del SVG. Background `#171617` (dark, matching el logo PWA). `pwa-maskable-512x512.png` en mipmap-\* como fallback para Android <8.
- **Splash screen: drawable XML simple `@color/splashBackground` (`#878bf9`).** Los PNGs generados por `@capacitor/assets` usaban fondo gris default ignorando el flag `--splashBackgroundColor`. Un drawable XML con color sólido es más simple y confiable.
- **Edge-to-edge via `env(safe-area-inset-*)` en el `body`** de `src/index.css`. Inocuo en web (env() evalúa a 0 sin `viewport-fit=cover`). Capacitor 8 aplica edge-to-edge automáticamente.
- **`--legacy-peer-deps` también para todo `@capacitor/*` y `@capgo/*`** con Vite 8. Mismo issue que Tauri y vite-plugin-pwa.
- **Gotcha HTML entities en share intent.** Chrome Android envía títulos con `&#34;` en vez de `"`. Decodeo via `DOMParser` o `textarea.innerHTML = title; title = textarea.innerText` es trivial. No implementado en la base — pulir si molesta en uso real.

### Chrome Extension

- **Proyecto separado en `extension/`** con su propio package.json, tsconfig, vite.config. No comparte build con la app principal.
- **CRXJS 2.4.0 + Vite 8** para el build. Named export: `import { crx } from '@crxjs/vite-plugin'`.
- **Auth: `chrome.identity.getAuthToken()` + `signInWithCredential()`** — el approach mas simple para Google sign-in en MV3. No requiere offscreen documents.
- **Firebase SDK lite:** `firebase/auth/web-extension` + `firebase/firestore/lite`. Bundle total 342KB (105KB gzip).
- **Items del extension se crean con `source: 'web-clip'`** y `sourceUrl` del tab activo. El campo `id` se incluye en el document data ademas del docId.
- **Sin encolamiento offline** — el popup es efimero, si no hay red muestra error.
- **OAuth2 Client ID:** `39583209123-fgs84i873hvghkf1u39tooc5n00du8d5.apps.googleusercontent.com` en `manifest.json`.

### Responsive & Mobile UX (Feature 1)

- **Breakpoint detection via `useSyncExternalStore` + `matchMedia`** — `useMediaQuery(query)` + `useBreakpoint()` en [src/hooks/useMediaQuery.ts](src/hooks/useMediaQuery.ts). Mismo patrón que `useOnlineStatus`. Evita el flash de useEffect+useState. Constantes en `src/lib/breakpoints.ts`.
- **Render condicional JSX para shell, CSS para layouts internos.** Sidebar oculta en mobile vía condicional (`!isMobile && <Sidebar>`); BottomNav/FAB ocultos en desktop igual. Dentro de cada página, responsive con clases Tailwind (`flex-col md:flex-row`). Mantener DOM consistente cuando solo cambia el layout; recortarlo cuando cambian componentes enteros.
- **`SidebarContent` exportado y reusado por `NavigationDrawer`.** El drawer mobile/tablet renderiza el mismo árbol del sidebar collapsed=false, con callback `onNavigate` que cierra el dialog al click en link. Evita duplicar array de nav items y handlers.
- **`<table>` + sticky `th/td:first-child` para HabitGrid.** No migrar a CSS grid — `position: sticky; left: 0; background: var(--background); z-index: 10` en la columna de nombres + wrapper con `overflow-x-auto` resuelve. Celdas externas con `<button class="h-11 w-11">` + `<span class="h-7 w-7">` interno para 44px de hit area con visual 28px.
- **`grid gap-4 lg:grid-cols-2` sin `grid-cols-1` explícito fuerza implicit grid que deja children crecer.** Bug raro: children con content largo (notas recientes) estiraban la implicit column auto a 1489px en viewport 375. Fix: siempre `grid-cols-1 lg:grid-cols-2` (primer `grid-cols-1` obligatorio). Aplica a todo grid responsive.
- **`min-w-0 flex-1 truncate` es obligatorio** en `<span>` dentro de `<a className="flex">`. Solo `truncate` no funciona si el padre no tiene `min-w-0` — el flex child se expande a content-size. Ya aplicado en DailyDigest, ProjectsActiveCard, RecentNotesCard, TasksTodayCard.
- **Radix checkbox con hit area via label wrapper**: el input `h-4 w-4` queda chico visualmente pero envuelto en `<label class="h-11 w-11 flex items-center justify-center">` da 44×44 de target. Patrón aplicado a `TaskCard`. El label recibe `onClick` del browser y toggles el checkbox por `htmlFor` implícito.
- **`viewport-fit=cover` en `index.html`** + `--sai-top/bottom/left/right: env(safe-area-inset-*)` en `src/index.css`. El body aplica `padding-left/right` globalmente; top/bottom se aplica granular en MobileHeader (top) y BottomNav/FAB (bottom) para no duplicar con el body.
- **MobileHeader lee título de la ruta con map estático** `path → title` dentro del componente. YAGNI: no hay context provider ni registry separado. El map reusa `navItems` exportado desde Sidebar.
- **Graph filters usa toggle con `useState`, no `<details>/<summary>`**: el componente existente ya tenía accordion con React state funcional. El plan original sugería `<details>` por YAGNI, pero el toggle existente ya cubre el caso, así que mantener en lugar de refactorizar.
- **BottomNav fixed + `calc(80px + var(--sai-bottom))` height**: el main tiene `padding-bottom: calc(80px + var(--sai-bottom))` para que el content no quede tapado por el nav. FAB bottom: `calc(80px + 16px + var(--sai-bottom))` para quedar por encima de BottomNav.
- **Cache del Service Worker persiste entre reinstalaciones del APK en Capacitor.** Al reinstalar un APK con `adb install -r` (o vía transferencia manual), el WebView puede retener el bundle viejo del SW de `vite-plugin-pwa` y servirlo al abrir — el layout se ve con la versión anterior del build. El `registerType: 'autoUpdate'` del plugin resuelve en reloads subsiguientes, pero la primera apertura puede engañar. Solución de debug: desde el celular, Ajustes → Apps → SecondMind → Almacenamiento → Borrar caché. Para E2E confiable, probar primero desinstalación completa + install fresh.

### IDs y timestamps

- **ID determinístico YYYY-MM-DD para hábitos** — como `rowId` en TinyBase Y `docId` en Firestore. Docs creados implícitamente al primer toggle. Patrón reutilizable para time-indexed entities.
- **Timestamps siempre `serverTimestamp()`** para `createdAt`/`updatedAt` en Firestore.

---

## Cloud Functions

### Estado del deployment

4 Cloud Functions v2 desplegadas en `us-central1`, todas con `retry: false`:

- **processInboxItem** — `onDocumentCreated('users/{userId}/inbox/{itemId}')`, `timeoutSeconds: 60`. Llama a Claude Haiku con tool `classify_inbox` + `INBOX_CLASSIFICATION_SCHEMA`. Escribe 6 campos flat `aiSuggested*` + `aiProcessed: true`.
- **autoTagNote** — `onDocumentWritten('users/{userId}/notes/{noteId}')`, `timeoutSeconds: 60`. Llama a Claude Haiku con tool `tag_note` + `NOTE_TAGGING_SCHEMA`. Escribe `aiTags`, `aiSummary`, `aiProcessed: true`.
- **generateEmbedding** — `onDocumentWritten('users/{userId}/notes/{noteId}')`, `timeoutSeconds: 60`. Genera embedding con OpenAI `text-embedding-3-small` (1536 dims). Guard por `contentPlain` vacío + `contentHash` SHA-256 para evitar regeneraciones. Escribe a `users/{userId}/embeddings/{noteId}`.
- **embedQuery** — `onCall` v2 (`firebase-functions/v2/https`), `timeoutSeconds: 10`. Primer callable del proyecto. Input `{ text: string }` ≤500 chars, output `{ vector: number[] }` 1536 dims. Mismo modelo que `generateEmbedding` para que los vectores sean comparables. Auth via `request.auth`, errores via `HttpsError`.

### Tool use con schema enforcement (Fase 3.1)

Ambas CFs usan `tools` + `tool_choice: { type: 'tool', name: '...' }` para forzar JSON válido. Los `enum` y `required` del JSON Schema garantizan valores a nivel de decoder — no depende de obediencia al prompt. Schemas compartidos en `src/functions/src/lib/schemas.ts`.

### Guards y edge cases

- **`aiProcessed` guard en autoTagNote:** `if (after.aiProcessed) return` — evita re-procesamiento en cada update de la nota. Early return sin log (frecuente).
- **`onDocumentWritten` en vez de `onDocumentCreated`:** las notas desde `/notes` se crean con `contentPlain: ''` y el texto llega en el auto-save (2s después). `onDocumentWritten` detecta el primer write con contenido.
- **`convertToNote` setea `aiProcessed: true` cuando hay tags del inbox.** Sin esto, autoTagNote sobrescribiría los tags que el usuario aceptó. Condición: `aiProcessed: !!(overrides?.tags?.length > 0)`.
- **Secret management:** `defineSecret('ANTHROPIC_API_KEY')` / `defineSecret('OPENAI_API_KEY')` + `secrets: [...]` en el trigger. `.value()` dentro del handler, no top-level.
- **`contentHash` guard en generateEmbedding:** compara SHA-256 del `contentPlain` actual con el hash almacenado en el embedding existente. Si coinciden, early return. No usa `aiProcessed` — a diferencia de autoTagNote, los embeddings deben regenerarse cuando el contenido cambia.

---

## Gotchas activos — Aplicación

### Data y state

1. **`isInitializing` de hooks (200ms) no es suficiente para gates de redirect.** Solo evita skeleton flash. Full-reload directo por URL tarda >200ms en hidratar. Para "¿recurso existe? → redirect" usar grace dedicado de 1500ms o observar `items.length > 0` como signal real.

2. **Orama sync: full rebuild en cada `addTableListener` es el patrón.** <50ms para ~100 notas. Evita edge cases de sync incremental. Aceptable hasta ~1k filas.

3. **`useBacklinks` auto-refresca sourceTitle** vía join in-memory con `useTable('notes')`. No hay que re-sincronizar cache de `links/`.

### UI y componentes

4. **Base-UI Dialog usa `data-starting-style` / `data-ending-style`**, no `data-state` como Radix. Las clases `animate-in`/`animate-out` de `tw-animate-css` no aplican a base-ui.

5. **`Intl.DateTimeFormat('es', { weekday: 'narrow' })`** devuelve "X" para miércoles, no "M". Usar resultado de Intl directamente, no hardcodear array de labels.

6. **Quick Capture shortcut es `Alt+N`** (no `Ctrl+Shift+N` que choca con Chrome incógnito).

7. **`React.FormEvent` deprecated en React 19.** Poner handler inline `onSubmit={(event) => { event.preventDefault(); void submit(); }}` para que TypeScript infiera el tipo sin importar el type deprecated.

### Data y links

8. **Self-links filtrados en `syncLinks`:** `targetId !== sourceId` es un guard activo. Sin este filtro, una nota que se referencia a sí misma con `[[wikilink]]` poluciona el grafo con loops. Aplica a cualquier refactor que toque `extractLinks` o `syncLinks`.

### Knowledge Graph y filtros

9. **Ruta `notes/graph` ANTES de `notes/:noteId` en router.tsx.** Si va después, React Router captura "graph" como noteId. Orden crítico en flat routes con parámetros dinámicos.

10. **Empty state con filtros activos: no hacer early return.** Renderizar siempre los controles de filtro y diferenciar mensaje: "sin datos" vs "filtros sin resultados" con botón de reseteo inline. Aplica a cualquier vista con filtros.

### Embeddings y similares

11. **Embeddings NO van en TinyBase.** Vectores de 1536 floats (~6KB c/u) son demasiado grandes para store in-memory. Carga on-demand desde Firestore con cache module-level en `src/lib/embeddings.ts`. Para <500 notas (~1.2MB total), fetch all es viable.

11.1 **Cache de embeddings es module-level, no per-hook.** Compartido entre `useSimilarNotes` (panel de nota) y `useHybridSearch` (lista). `getEmbeddingsCache(uid)` deduplica fetches concurrentes via `fetchPromise`; reusa si el uid no cambió. `invalidateEmbeddingsCache()` se llama en `signOut` (antes de `firebaseSignOut` — defensivo) para no filtrar embeddings entre cuentas en la misma sesión.

11.2 **Threshold empírico con `text-embedding-3-small` + notas cortas en español: 0.30.** El rango de cosine similarity satura en 0.15–0.45 para documentos cortos (vs `ada-002` que llegaba a 0.8+). `SimilarNotesPanel` usa 0.5 por comparar notas completas; `useHybridSearch` usa 0.3 porque queries son más cortas que documentos. Recalibrar si el corpus cambia de estilo.

### Búsqueda Híbrida (Feature 3)

11.3 **Primera Cloud Function callable del proyecto usa `onCall` v2.** `import { onCall, HttpsError } from 'firebase-functions/v2/https'`. Signature: `(request) => { request.auth?.uid; request.data }` — NO es v1 (`context.auth`). Cliente via `getFunctions(app, 'us-central1') + httpsCallable`. La referencia al callable se crea una vez a nivel de módulo, no en cada call.

11.4 **Pipeline semántico en orden estricto**: `filter isArchived → exclude keyword IDs → sort score desc → slice(0, 5)`. Si se slicea antes de excluir, con 5 keyword matches el `semanticResults` queda vacío aunque haya hits válidos. Aplica a cualquier feature que mezcle dos pipelines de resultados con filtros mutuamente excluyentes.

11.5 **Race handling con snapshot del query, no `AbortController`.** Firebase callable no expone abort. Patrón: `const frozenQuery = trimmed` al iniciar, `if (frozenQuery !== query.trim()) return` al volver del CF. Si el user ya está buscando otra cosa, el resultado obsoleto se descarta sin tocar state.

11.6 **`setIsLoadingSemantic(true)` dentro del `setTimeout` callback, no síncrono en el effect body.** La regla `react-hooks/set-state-in-effect` rechaza setState síncrono. Además alinea UX: skeleton aparece cuando arranca la llamada real, no durante los 500ms de debounce.

11.7 **Mismatch Node 20 vs 22 en functions.** `firebase.json.runtime: nodejs20` vs `src/functions/package.json.engines.node: 22`. `firebase.json` manda en deploy — runtime efectivo es Node 20. Si alguien alinea `firebase.json` a 22 sin coordinar, cambia el runtime de deploy sin otras señales visibles en CI.

### Progressive Summarization (Feature 4)

11.8 **Marks de TipTap viven en text nodes, no en containers.** Cualquier traversal que lea `node.marks` (como `computeDistillLevel`) debe recurrir hasta `node.type === 'text'`. Inspeccionar solo paragraphs/headings siempre da cero marks — bug silencioso clásico. Patrón consolidado: walk recursivo sobre `node.content` con early return en text nodes, idéntico en forma al walk de `extractLinks`.

11.9 **Hook `useNoteSave` es el único writer del doc de nota.** Maneja dos inputs (editor TipTap + textarea del `summaryL3`) con un solo timer compartido — el último keystroke de cualquiera de los dos reinicia el debounce. Un solo `save()` atómico por disparo del timer; un solo `updateDoc` con todos los campos (`content`, `contentPlain`, `title`, `summaryL3`, `distillLevel`, `updatedAt`). Separar en dos hooks paralelos haría race concurrente: dos `updateDoc` compitiendo con `distillLevel` distintos según el orden de llegada. Cualquier feature futura que quiera persistir campos por-save debe extender este hook, no crear uno nuevo.

11.10 **Optimistic `setPartialRow` ANTES de `await updateDoc` en `useNoteSave.save()`.** Invertido respecto al orden histórico para que el badge `distillLevel` refleje el nuevo estado sin esperar el round-trip de red (2s + red → 2s puros). Si `updateDoc` falla, `pendingRef` vuelve a true y el retry re-escribe los mismos datos (idempotente). Consistente con `useHabits.toggleHabit`. Regla general: para UI que reacciona al dato persistido vía `useCell`/`useRow`, optimistic es la opción default.

11.11 **`@base-ui/react/popover` para dropdowns contextuales.** Mismo paquete que Dialog (ya usado en 7 archivos), misma convención: `Root` / `Trigger` / `Portal` / `Positioner` / `Popup` + data-attrs `data-starting-style` / `data-ending-style` para animaciones. Primer uso de Popover en `DistillIndicator`. NO implementar dropdown manual con `useState + click-outside + escape + portal` — duplicar ~60 líneas ya provistas.

11.12 **`setIsOpen(true) → requestAnimationFrame → focus()` para colapsables.** Cuando un componente externo pide abrir un colapsable y enfocar su input, el input no existe en DOM en el mismo tick. Sin rAF, `ref.current` es null → el focus parece no hacer nada. Patrón aplicado en `handleOpenSummary` de `/notes/[noteId]/page.tsx`; reusar para cualquier disclosure + focus programático.

11.13 **Slash menu solo para block-level commands.** Los items del slash menu disparan sin selección activa (el `/` está en el cursor, no sobre un rango). Block-level (heading, list, divider) funciona porque opera sobre el bloque actual; inline marks como `highlight` requieren rango → no-op silencioso. Si se necesita un entrypoint a inline marks, usar shortcut + bubble menu (no slash). Aplicado: `toggleHighlight` solo via `Ctrl+Shift+H`, no `/resaltar`.

11.14 **Textarea auto-resize: `el.style.height = '0px'` antes de `scrollHeight`.** No usar `'auto'` — en iOS Safari el `scrollHeight` puede devolver valores pequeños tras deletes. Patrón aplicado en `SummaryL3.tsx` via `useLayoutEffect` (inicial) + `onChange` (en vivo). Alternativa `field-sizing: content` CSS no adoptada por soporte <2 años.

11.15 **`summaryL1` y `summaryL2` son dead weight intencional en el schema**. TinyBase los declara como strings pero ninguna feature los usa (L1/L2 se derivan de marks en `content`). No tocar en esta feature; registrar como tech-debt si aparece conflicto futuro.

### Bubble Menu + Link (Feature 5)

11.16 **StarterKit v3 incluye Link, Underline y ListKeymap por default.** `StarterKit.extensions` los carga automáticamente — verificado en `node_modules/@tiptap/starter-kit/dist/index.d.ts:10,97` que declara `link: Partial<LinkOptions> | false`. Para configurar Link usar `StarterKit.configure({ link: { openOnClick: false, autolink: true, linkOnPaste: true, defaultProtocol: 'https', HTMLAttributes: {...} } })` — NO instalar `@tiptap/extension-link` por separado. Para deshabilitar Underline: `underline: false` en la misma config. Para futuras features que necesiten Link (edición avanzada, comentarios), extender la misma config.

11.17 **`@tiptap/react/menus` es el import v3 correcto** (no `@tiptap/react` que es v2 legacy). `BubbleMenu` y `FloatingMenu` viven en ese subpath. Props: `{ editor, pluginKey?, shouldShow?, options? }`. El `options` acepta middlewares de Floating UI como **keys individuales** (`offset`, `flip`, `shift`, `arrow`, `size`, `autoPlacement`, `hide`, `inline`) con tipo `Parameters<typeof X>[0] | boolean`. Pasar array `middleware: [...]` falla con TS2353. Ejemplo correcto: `options={{ placement: 'top', offset: 8, flip: true, shift: { padding: 8 } }}`.

11.18 **`useEditorState` es obligatorio para reactividad de `isActive()` en React.** Sin el hook, `editor.isActive('bold')` dentro de un componente React queda congelado en el valor del primer render — los botones no reflejan cambios. Uso: `const state = useEditorState({ editor, selector: ({ editor }) => ({ isBold: editor?.isActive('bold') ?? false, ... }) })`. **Retornar solo primitivos** (booleans, strings) en el selector: TipTap hace shallow compare; un object anidado causa re-renders en cada keystroke. Aplica a cualquier UI que refleje estado del editor (toolbar, badge, selector de bloque).

11.19 **`shouldShow` definido module-level** (fuera del componente) da referencia estable sin overhead de `useCallback`. Inline en el JSX remonta el BubbleMenu en cada render del componente padre (y pierde el plugin de ProseMirror). Patrón: `function shouldShow({ editor, state }) { ... }` antes del `export default function BubbleToolbar()`.

11.20 **`extendMarkRange('link')` antes de `setLink`/`unsetLink`** cuando el cursor está sobre un link sin selección activa. Sin `extendMarkRange`, los comandos aplican solo al rango del cursor (1 char) y dejan parte del link inconsistente. Patrón: `editor.chain().focus().extendMarkRange('link').setLink({ href }).run()`.

11.21 **`e.preventDefault() + e.stopPropagation()` en Enter/Escape dentro de inputs dentro de BubbleMenu.** Sin `stopPropagation`, el keydown burbujea al editor y deshace la selección o dispara shortcuts (por ej. Enter inserta nueva línea). Patrón aplicado en `LinkInput.tsx`; reusar para cualquier input que viva dentro de un floating menu sobre el editor.

11.22 **BubbleMenu v3 NO anima entrada/salida automáticamente.** No aplica `data-starting-style` / `data-ending-style` como base-ui. Para animar requeriría Framer Motion o transitions CSS con mount delays — decisión tomada en Feature 5: no animar. Notion tampoco anima su bubble. Aparición instantánea es UX aceptable.

11.23 **iOS Safari selection toolbar coexiste con BubbleMenu.** Conocido, sin workaround confiable. El bubble aparece con `placement: 'top'` encima de la selección; iOS toolbar flota como overlay fijo del navegador. Known limitation, documentar si usuarios reportan fricción.

### FSRS y resurfacing

12. **FSRS opt-in requiere botón explícito.** Sin "Activar revisión periódica", la feature es invisible porque notas nuevas no tienen `fsrsDue`. ReviewBanner tiene 4 estados: activar, due, próxima fecha, confirmación post-review.

13. **`Math.random()` no es seedable en JavaScript.** Para orden determinístico diario de hubs en Daily Digest, usar hash numérico de `noteId + dateString`: `[...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)`.

### PWA y Extension

14. **`vite-plugin-pwa` requiere `--legacy-peer-deps` con Vite 8.** El peerDependency de v1.2.0 solo lista hasta Vite 7, pero funciona correctamente.

15. **`maximumFileSizeToCacheInBytes: 4MB` en workbox config.** El bundle principal es ~2.7MB por Reagraph/Three.js. Sin este override, Workbox rechaza precachear el JS principal. Cuando se haga code-splitting del grafo, se puede bajar o eliminar.

16. **CRXJS exporta `{ crx }` como named export**, no default. La documentacion y ejemplos pueden mostrar `import crx from` pero en v2.4.0 es `import { crx } from '@crxjs/vite-plugin'`.

17. **Chrome Extension usa `firebase/auth/web-extension`** (no `firebase/auth`). Obligatorio para MV3 — el import normal falla en service worker context.

18. **Chrome Extension usa `firebase/firestore/lite`** para un solo `setDoc`. Reduce bundle significativamente vs SDK completo.

### Tauri Desktop (Fase 5.1)

25. **Tauri v2 feature `tray-icon` gated.** `tauri = { version = "2.10", features = ["tray-icon"] }` obligatorio. Sin la feature, `tauri::tray::TrayIconBuilder` no existe.

26. **IDE marca capabilities como "not accepted" tras agregar plugin.** El schema `gen/schemas/desktop-schema.json` se regenera solo en `cargo build`/`cargo check`. Correr uno y recargar IDE. No es error real.

27. **Single-instance obligatorio para apps con autostart.** Sin él, autostart + click manual = dos instancias, segunda falla al registrar shortcut global.

28. **Auth popup en ventana Tauri requiere `frame-src` en CSP.** Sin `https://*.firebaseapp.com` y `https://accounts.google.com` en `frame-src`, el popup de Google signIn queda bloqueado en release. Dev funciona porque CSP está relaxed.

29. **Global shortcut registrado 2 veces falla silenciosamente.** Siempre chequear `isRegistered()` y `unregister()` antes de `register()` en el useEffect. HMR del dev re-monta y duplica el registro.

### Cloud Functions

19. **firebase-functions v7 obligatorio.** La v6 fallaba con timeout en el discovery protocol de la CLI. Importante al elegir versiones.

20. **`.gitignore` de functions: `/lib/` con anchor.** Sin anchor, matchea `src/lib/` (sources) además de `lib/` (compiled).

---

## Gotchas activos — Tooling de desarrollo

21. **TypeScript LSP plugin requiere patch en Windows.** `child_process.spawn()` sin `shell: true` no resuelve wrappers `.cmd` de npm global. Fix: parchear `marketplace.json` con `command: "node"` + ruta absoluta a `typescript-language-server/lib/cli.mjs`. Se pierde si Claude Code actualiza el marketplace.

22. **Firebase MCP: `node` directo al CLI local, no `npx`.** `npx firebase@latest` falla con "Invalid Version". Configurado en `.mcp.json`.

23. **Brave Search: `BRAVE_API_KEY` como variable de sistema Windows**, no en `.env.local`.

24. **ui-ux-pro-max symlinks rotos en Windows** sin Developer Mode. Los scripts reales viven en `src/ui-ux-pro-max/scripts/search.py`. Fix: Developer Mode + `git config --global core.symlinks true` + reinstalar plugin.

25. **Vite `resolve.dedupe` obligatorio para Firebase** (`firebase`, `@firebase/app`, `@firebase/component`, `@firebase/auth`, `@firebase/firestore`). Sin esto, el optimizer picks up paquetes `@firebase/*` desde `extension/node_modules/` (Chrome Extension tiene su propio npm install) y duplica el component registry — `getAuth` falla con `Component auth has not been registered yet` y React no monta. Configurado en `vite.config.ts`.

---

## Patrones establecidos

### Código

- **"Three similar lines beat premature abstraction"** — duplicar 8 líneas triviales es OK hasta el 4to uso. No extraer helpers prematuramente.
- **Helpers compartidos existentes:** `formatDate`, `startOfDay`, `isSameDay`, `getWeekStart`, `addDays` en `src/lib/dateUtils.ts`; `parseIds`, `stringifyIds` en `src/lib/tinybase.ts`.
- **Popup wikilinks sin tippy.js** — `createPortal` + virtual anchor del `clientRect()` de TipTap. ~30 líneas, sin dep extra.

### Editor Polish (Feature 2)

- **`@` como trigger de menciones, no `[[`.** El Node ProseMirror `wikilink` (atom + inline) sigue intacto — solo cambió el `char` del Suggestion plugin. Los documentos existentes rehidratan con el nuevo look sin migración. Pill styling via `.wikilink { bg: primary/12% + padding + border-radius }` + `::before { content: '@'; opacity: .6 }` CSS-only.
- **`allow()` custom con blacklist alfanumérica** (no whitelist). Rechaza solo si el char previo matchea `/[a-zA-Z0-9]/`. Cubre `sebas@gmail.com` (bloquea) pero permite `(@nota)`, `"@nota"`, `según: @nota`, `—@nota`, emoji. Menos false negatives que enumerar caracteres válidos.
- **`pluginKey` explícito por Suggestion plugin.** Múltiples instancias de `@tiptap/suggestion` en el mismo editor colisionan por `pluginKey` default (`suggestion$`) → `RangeError: Adding different instances of a keyed plugin`. Fix: `new PluginKey('wikilink-suggestion')` y `PluginKey('slash-command-suggestion')`. Aplica a cualquier extensión futura que sume Suggestion.
- **Listener pattern reusable para Suggestion → popup React.** Un archivo `*-suggestion.ts` tiene `let activeListener = null` módulo-level + `setXMenuListener()` export. El componente popup registra el listener en `useEffect` y delega `onStart/onUpdate/onKeyDown/onExit`. Render usa `createPortal(..., document.body)` + virtual anchor (`fixed top: rect.bottom + 6, left: rect.left`). Reusado en `WikilinkMenu` (Feature 1) y `SlashMenu` (Feature 2).
- **SlashCommand context vía `.configure({ noteId })`.** El `noteId` se captura en el closure de la factory `slashCommandSuggestion(ctx)` al construirse la extension. Stale-closure safe **solo si** el editor se remonta por nota — se cumple porque `src/app/notes/[noteId]/page.tsx` pasa `key={noteId}` al `<NoteEditor>`. Si en el futuro se comparte el editor entre notas sin remount, el contrato se rompe.
- **`currentUid` leído en runtime, no capturado en config.** `updateNoteType()` del slash menu lee `auth.currentUser?.uid` dentro de la función. Esto permite logout/login en la misma sesión sin re-instanciar la extension. Mismo patrón que `useNoteSave`.
- **Templates como `JSONContent[]`, no HTML/Markdown.** Array de nodos ProseMirror (H2, P, bulletList con listItems vacíos) que `insertContent()` aplica directamente. Sin parsing intermedio. Literature y Permanent son 6 nodos c/u en `src/components/editor/templates/`.
- **Slash menu filter con `keywords?: string[]`.** Haystack = `[label, id, ...keywords].join(' ').toLowerCase()`. Cubre `/h1`, `/h2`, `/h3`, `/ul`, `/ol`, `/tareas`, `/codigo`, `/cita`, `/hr` aunque el label no contenga la abreviación. Agregado durante E2E al notar que `/h2` no matcheaba "Heading 2".
- **Node `atom` + `contenteditable="false"` excluyen textContent del DOM.** El wikilink NO aparece en `document.querySelector('.ProseMirror').textContent`, pero SÍ en `editor.getText()` (TipTap serializa el node via su `renderText`). Importante para testing E2E con Playwright: usar `editor.getText()` si querés verificar que la mención está en el contenido plain.
- **Pill `::before: '@'` NO se copia al clipboard.** Chrome/Firefox excluyen pseudo-elementos del copy. Al pegar una mención en otro lugar sale solo el título, sin `@`.

### Bubble Menu + Link (Feature 5)

- **Un solo listener pattern NO aplica a BubbleMenu.** Wikilink y Slash menus usan `let activeListener = null` module-level porque el Suggestion plugin vive en la extensión y el popup es un componente React separado. BubbleMenu v3 recibe el `editor` como prop directa — NO replicar listener pattern; pasar `editor` y usar `useEditorState`. Patrón diferente porque el problema es diferente (popup reactivo a selección vs popup triggered por chars).
- **State machine de 2 modos + branch de render** es más simple que 3 modos separados. `useState<'default' | 'link-edit'>('default')` + un `if (selection.empty && isActive('link') && mode === 'default')` dentro del branch default cubre el caso "cursor sobre link sin selección" sin agregar un `'link-hover'` mode que no tiene acciones distintas al default más allá del render.
- **Tokens de popup styling unificados**: todos los menus flotantes del editor (WikilinkMenu, SlashMenu, BubbleToolbar, LinkInput, LinkHoverView) usan `rounded-lg border border-border bg-popover text-popover-foreground shadow-xl` + `p-1`. Cambiar estos tokens en el theme propaga a todos.
- **Tap target 44×44 en desktop también**. Decisión Feature 5: no diferenciar breakpoints. `h-11 w-11` en botones + icono `h-4 w-4` interno. Un solo tamaño facilita lectura y mantiene convención con TaskCard (checkbox wrapper), HabitRow (cells), DistillIndicator (trigger circular).

### Performance

- **Full rebuild de índices < 50ms** para ~100 entidades. Patrón `addTableListener` + rebuild completo, sin sync incremental.
- **Auto-save del editor: debounce 2s** (`AUTOSAVE_DEBOUNCE_MS = 2000`).
- **Command Palette: Orama rebuild con debounce 100ms** para agrupar los 3 store listeners iniciales.

---

## Dependencias clave con historia

| Paquete                         | Versión   | Nota                                                                                                                         |
| ------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `firebase-functions`            | `^7.2.5`  | v6 fallaba con timeout en discovery. Major bump obligatorio                                                                  |
| `@anthropic-ai/sdk`             | `^0.40.1` | Soporta `tools` + `tool_choice` para schema enforcement                                                                      |
| `tinybase`                      | v8        | Sin `persister-firestore` nativo. Custom persister con `createCustomPersister`                                               |
| `@orama/orama`                  | v3        | `search()` es sync at runtime aunque el tipo diga `Promise`. Cast a `Results<AnyDocument>`                                   |
| `reagraph`                      | latest    | WebGL graph viz (Three.js). Compatible React 19. ~1.3MB bundle. API declarativa `<GraphCanvas>`                              |
| `openai`                        | `^4.85`   | SDK para embeddings en CF generateEmbedding. Solo en `src/functions/`                                                        |
| `ts-fsrs`                       | latest    | FSRS spaced repetition. Client-side (~15KB). `createEmptyCard`, `fsrs().next()`                                              |
| `vite-plugin-pwa`               | `^1.2.0`  | Requiere `--legacy-peer-deps` con Vite 8. `generateSW` + `autoUpdate`                                                        |
| `@crxjs/vite-plugin`            | `^2.4.0`  | Named export `{ crx }`. Soporta Vite 8 + MV3 + React + HMR                                                                   |
| `@tauri-apps/cli`               | `^2.10.1` | CLI para scaffold/dev/build. Requiere Rust + MSVC Build Tools en Windows                                                     |
| `@tauri-apps/api`               | `^2.10.1` | Window management, webview, event system. Import dinámico para no romper build web                                           |
| `tauri-plugin-global-shortcut`  | `2.3.1`   | Registro OS-level de hotkeys. JS-side más simple que Rust-side                                                               |
| `tauri-plugin-autostart`        | `2.5.1`   | Autostart con Windows (registry key HKCU Run). `MacosLauncher::LaunchAgent` default                                          |
| `tauri-plugin-window-state`     | `2.4.1`   | Persiste pos/size. `.with_denylist(&["capture"])` para excluir la ventana efímera                                            |
| `tauri-plugin-single-instance`  | `2.4.1`   | Previene múltiples procesos simultáneos. Crítico con autostart                                                               |
| `@capacitor/core`               | `^8.3.0`  | Runtime Cap 8. Requiere Node 22+ y Android Studio Otter+                                                                     |
| `@capacitor/cli`                | `^8.3.0`  | CLI para init/sync. `cap run android` falla en Windows por `gradlew` sin `.bat` (workaround: `./gradlew.bat` directo)        |
| `@capacitor/android`            | `^8.3.0`  | Plataforma Android. `minSdk 24`, `compileSdk 36`, `targetSdk 36`                                                             |
| `@capacitor/splash-screen`      | `^8.0.1`  | `launchAutoHide: false` + `SplashScreen.hide()` manual                                                                       |
| `@capgo/capacitor-social-login` | `^8.3.14` | Google Sign-In nativo. Devuelve `idToken` → `signInWithCredential`. `codetrix-studio` abandonado, este es el sucesor oficial |
| `@capgo/capacitor-share-target` | `^8.0.27` | Listener `shareReceived` + intent-filter SEND en AndroidManifest. Único con soporte Cap 8 free                               |

---

## Siguiente fase

**Feature 5 (Bubble Menu + Link) ✅ completada.** Toolbar flotante al seleccionar texto con 6 formatos inline. Link extension de StarterKit v3 destapada con UI para crear/editar/desvincular/abrir. Mobile 375 funciona sin overflow. Cero regresiones en shortcuts existentes.

Próximas iteraciones candidatas:

- **Command Palette con tab "semántico"** — hoy Ctrl+K es keyword-only por velocidad. Agregar toggle opcional con el mismo `useHybridSearch` si el uso real muestra que vale.
- **AI-suggested links en el editor** — usar los embeddings para sugerir wikilinks mientras el usuario escribe. Inline, debounced.
- **Floating menu al inicio de línea vacía** — complementa el bubble menu con la misma affordance visual para los slash commands (hint "press `/` for commands").
- **Botón "Convertir en nota" en el bubble menu** cuando hay selección — atomización Zettelkasten directa. Crea una nota nueva con el texto seleccionado + backlink automático.
- **AI-suggested highlights** — sugerir qué resaltar con embeddings o tool use. Cuidado: el valor cognitivo de Progressive Summarization está en destilar manualmente.
- **Code blocks con syntax highlighting** — `@tiptap/extension-code-block-lowlight` + Prism/highlight.js.
- **Task items del editor → Tasks reales** — hoy TipTap TaskItem es rich-text; un comando podría crear un `task` en TaskStore con sourceId = noteId.
- **Drag & drop de imágenes al editor** — upload a Firebase Storage, Node custom `image` con attrs `{ src, alt, width }`.
- **Distribución**: code signing Windows para MSI, Play Store publish (AAB + $25 one-time + privacy policy).
- **iOS**: macOS + Apple Developer ID ($99/año) + Share Extension nativa (más compleja que Android intent filter).
- **Release keystore Android**: SHA-1 de release registrado en GCP para APKs distribuibles fuera de debug.
