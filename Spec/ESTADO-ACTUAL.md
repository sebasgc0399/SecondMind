# Estado Actual — SecondMind (Snapshot consolidado)

> Última actualización: Feature 1 Responsive & Mobile UX (Abril 2026)
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

3 Cloud Functions v2 desplegadas en `us-central1`, todas con `retry: false`, `timeoutSeconds: 60`:

- **processInboxItem** — `onDocumentCreated('users/{userId}/inbox/{itemId}')`. Llama a Claude Haiku con tool `classify_inbox` + `INBOX_CLASSIFICATION_SCHEMA`. Escribe 6 campos flat `aiSuggested*` + `aiProcessed: true`.
- **autoTagNote** — `onDocumentWritten('users/{userId}/notes/{noteId}')`. Llama a Claude Haiku con tool `tag_note` + `NOTE_TAGGING_SCHEMA`. Escribe `aiTags`, `aiSummary`, `aiProcessed: true`.
- **generateEmbedding** — `onDocumentWritten('users/{userId}/notes/{noteId}')`. Genera embedding con OpenAI `text-embedding-3-small` (1536 dims). Guard por `contentPlain` vacío + `contentHash` SHA-256 para evitar regeneraciones. Escribe a `users/{userId}/embeddings/{noteId}`.

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

11. **Embeddings NO van en TinyBase.** Vectores de 1536 floats (~6KB c/u) son demasiado grandes para store in-memory. Carga on-demand desde Firestore con cache en `useRef`. Para <500 notas (~1.2MB total), fetch all es viable.

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

**Feature 1 (Responsive & Mobile UX) ✅ completada.** SecondMind es ahora usable en todos los viewports: mobile (375px+), tablet (768px+) y desktop (1024px+), tanto en web como en Capacitor Android.

Próximas iteraciones candidatas:

- **Polish UX**: templates de notas, slash commands del editor, mejoras de búsqueda semántica híbrida (Orama + embeddings)
- **Distribución**: code signing Windows para MSI, Play Store publish (requiere AAB + $25 one-time + privacy policy)
- **iOS**: requiere macOS + Apple Developer ID ($99/año) + Share Extension más compleja que Android intent filter
- **Release keystore Android**: crear SHA-1 de release y registrar en GCP para APKs firmados distribuibles fuera de debug
