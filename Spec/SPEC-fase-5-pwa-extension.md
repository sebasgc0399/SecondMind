# SPEC — SecondMind · Fase 5: PWA + Chrome Extension (Completada)

> Alcance: SecondMind instalable como app (desktop/mobile) con soporte offline + captura desde cualquier pagina web via Chrome Extension
> Completada: Abril 2026
> Stack: vite-plugin-pwa, Workbox, Chrome Extension Manifest V3, CRXJS, Firebase Auth (web-extension), firebase/firestore/lite

---

## Features implementadas

### F1: PWA — Manifest + Icons + Install Prompt

Configuracion de `vite-plugin-pwa` con manifest inline, iconos PWA en multiples tamanos (brain-circuit icon generado en Recraft), y componente InstallPrompt que captura `beforeinstallprompt` y persiste dismiss en localStorage. `registerType: 'autoUpdate'` para actualizaciones silenciosas del SW.

**Archivos:**

- `vite.config.ts` — VitePWA plugin con manifest, workbox config
- `index.html` — apple-touch-icon, meta theme-color `#7b2ad1`, title "SecondMind"
- `src/hooks/useInstallPrompt.ts` — hook para beforeinstallprompt + localStorage
- `src/components/layout/InstallPrompt.tsx` — banner fijo bottom-right
- `public/` — favicon.svg (brain icon), pwa-192x192.png, pwa-512x512.png, pwa-maskable-512x512.png, apple-touch-icon.png, brain-original.svg, brain-fullbleed.svg, favicon-32x32.png, icon-16.png, icon-48.png, icon-128.png

**Criterio de done:**

- [x] `vite-plugin-pwa` instalado y configurado (con `--legacy-peer-deps` por Vite 8)
- [x] Manifest con name, short_name, start_url, display: standalone, theme_color `#7b2ad1`
- [x] Iconos PWA: 192x192, 512x512, maskable 512x512 (iconos separados, no combined purpose)
- [x] Apple touch icon 180x180 + meta theme-color
- [x] InstallPrompt con beforeinstallprompt + localStorage dismiss
- [x] Favicon reemplazado de rayo Vite a brain-circuit icon

---

### F2: PWA — Service Worker + Offline

Configuracion de Workbox con `navigateFallback` para SPA routing offline, `runtimeCaching` para Google Fonts, hook `useOnlineStatus` con `useSyncExternalStore`, componente OfflineBadge, y guards de UI en features que requieren red (AI processing, embeddings).

**Archivos:**

- `vite.config.ts` — navigateFallback, navigateFallbackDenylist, runtimeCaching, maximumFileSizeToCacheInBytes 4MB
- `src/hooks/useOnlineStatus.ts` — useSyncExternalStore para navigator.onLine
- `src/components/layout/OfflineBadge.tsx` — badge fijo con WifiOff icon
- `src/app/layout.tsx` — monta OfflineBadge
- `src/app/inbox/page.tsx` — "Procesar" disabled offline con title tooltip
- `src/components/dashboard/InboxCard.tsx` — "Procesar →" disabled offline
- `src/components/editor/SimilarNotesPanel.tsx` — mensaje offline

**Criterio de done:**

- [x] navigateFallback: 'index.html' para SPA routing offline
- [x] runtimeCaching para Google Fonts (StaleWhileRevalidate + CacheFirst)
- [x] maximumFileSizeToCacheInBytes 4MB (bundle ~2.7MB por Reagraph/Three.js)
- [x] useOnlineStatus hook con useSyncExternalStore
- [x] OfflineBadge visible cuando navigator.onLine === false
- [x] "Procesar" en inbox deshabilitado offline
- [x] SimilarNotesPanel muestra "Disponible cuando vuelva la conexion" offline
- [x] TinyBase data en memoria sigue accesible offline

---

### F3: Chrome Extension — Scaffold + Popup UI

Proyecto separado en `extension/` con CRXJS Vite Plugin, Manifest V3, popup React minimalista con textarea y captura de seleccion via `chrome.scripting.executeScript()`. CSS manual con tokens oklch del design system, dark mode via `prefers-color-scheme`.

**Archivos:**

- `extension/package.json` — react, react-dom, @crxjs/vite-plugin, vite, typescript, @types/chrome
- `extension/tsconfig.json` — strict, types: ["chrome", "vite/client"]
- `extension/vite.config.ts` — CRXJS plugin (`{ crx }` named export)
- `extension/manifest.json` — MV3, permisos: identity, activeTab, storage, scripting
- `extension/src/popup/index.html` — entry point
- `extension/src/popup/index.tsx` — React mount
- `extension/src/popup/Popup.tsx` — textarea + captura + auth + save
- `extension/src/popup/popup.css` — tokens oklch + dark mode
- `extension/src/content/getSelection.ts` — funcion pura inyectable
- `extension/icons/` — icon-16.png, icon-48.png, icon-128.png

**Criterio de done:**

- [x] extension/ con package.json, tsconfig, vite config independientes
- [x] Popup renderiza con textarea + botones
- [x] "Capturar seleccion" extrae texto + titulo + URL via chrome.scripting.executeScript
- [x] CSS con design system tokens (dark mode via prefers-color-scheme)
- [x] Error handling en paginas restringidas (chrome://)
- [x] Build genera dist/ cargable como unpacked

---

### F4: Chrome Extension — Auth + Firestore Write

Auth con Google via `chrome.identity.getAuthToken()` + `signInWithCredential()`, escritura a Firestore inbox con `firebase/firestore/lite` (bundle reducido ~75%). Auth state persiste entre aperturas del popup.

**Archivos:**

- `extension/src/lib/firebaseConfig.ts` — Firebase init con firebase/auth/web-extension + firebase/firestore/lite
- `extension/src/lib/auth.ts` — signInWithChrome() + observeAuth()
- `extension/src/lib/firestore.ts` — saveToInbox() con schema: id, rawContent, source 'web-clip', sourceUrl, status, aiProcessed, createdAt
- `extension/manifest.json` — oauth2.client_id real
- `extension/src/popup/Popup.tsx` — auth state, "Conectar con Google", save con feedback spinner/check/auto-close
- `extension/src/popup/popup.css` — estilos para Google button, spinner, success

**Criterio de done:**

- [x] Firebase SDK lite instalado y configurado
- [x] Auth via chrome.identity + signInWithCredential funciona
- [x] manifest.json con oauth2.client_id real
- [x] saveToInbox escribe a users/{uid}/inbox/{itemId} con schema correcto
- [x] Feedback visual: spinner → check → auto-close (800ms)
- [x] Error handling: sin conexion, auth fallida
- [x] Bundle: 342KB (105KB gzip) con Firebase incluido

---

## Observaciones post-implementacion

1. **`vite-plugin-pwa@1.2.0` no lista Vite 8 en peerDependencies** pero funciona correctamente. Requiere `--legacy-peer-deps` en npm install. El PR para agregar Vite 8 al peer dep estaba abierto al momento de implementacion.

2. **Favicon original era el rayo de Vite**, no un logo de SecondMind. Se reemplazo con un brain-circuit icon generado en Recraft (color `#7b2ad1`). El `theme_color` del plan original era `#863bff` y se corrigio a `#7b2ad1` para coincidir con el icono real.

3. **`maximumFileSizeToCacheInBytes: 4MB`** necesario porque el bundle principal es ~2.7MB (Reagraph/Three.js ~1.3MB). Cuando se implemente code-splitting del grafo (lazy import), este override se puede reducir o eliminar.

4. **CRXJS exporta `{ crx }` como named export** en v2.4.0, no default export como muestran algunos ejemplos. Error comun al configurar.

5. **`scripting` permission** no estaba en el SPEC original (solo listaba identity, activeTab, storage). Es requerido por `chrome.scripting.executeScript()` — sin el, falla en runtime.

6. **`firebase/firestore/lite`** reduce el bundle del extension significativamente (~30KB vs ~120KB gzip para Firestore). Suficiente para un solo `setDoc`.

7. **OAuth2 setup requiere 4 pasos manuales en GCP Console** que no se pueden automatizar: crear client ID, obtener extension ID, agregar dominio autorizado en Firebase Auth, configurar manifest. Documentado en el plan como prerequisitos.

---

## Definiciones tecnicas

### D1: vite-plugin-pwa sobre SW manual

- **Decision:** vite-plugin-pwa con generateSW
- **Razon:** Zero-config para precache + manifest. Extensible con runtimeCaching para offline. No requiere mantener lista de precache manual.

### D2: CRXJS sobre build manual

- **Decision:** @crxjs/vite-plugin 2.4.0
- **Razon:** Soporta Vite 8 + React + TypeScript + MV3 con HMR en dev. Build manual con multi-entry era el plan B pero no fue necesario.

### D3: chrome.identity sobre offscreen document

- **Decision:** chrome.identity.getAuthToken() + signInWithCredential()
- **Razon:** Approach mas simple para Google sign-in en MV3. No requiere offscreen documents ni hosting de pagina auth.

### D4: Extension como proyecto separado

- **Decision:** extension/ con package.json independiente
- **Razon:** Build target diferente (Chrome Extension vs SPA), manifest propio, deploy diferente. Lo que se comparte (Firebase config) se copia — son 10 lineas.

### D5: firebase/firestore/lite sobre SDK completo

- **Decision:** firebase/firestore/lite para el extension
- **Razon:** Solo necesita setDoc. El lite SDK pesa ~75% menos. El extension no necesita listeners, snapshots, ni cache offline.
