# SPEC — SecondMind · Fase 5: PWA + Chrome Extension

> Alcance: SecondMind instalable como app (desktop/mobile) con soporte offline + captura desde cualquier página web vía Chrome Extension
> Dependencias: Fase 4 completada
> Estimado: 2-3 semanas (solo dev)
> Stack relevante: vite-plugin-pwa, Workbox, Chrome Extension Manifest V3, Firebase Auth (web-extension), Vite

---

## Objetivo

El usuario puede instalar SecondMind como app nativa en desktop y mobile (PWA), usarla offline con datos cacheados, y capturar contenido de cualquier página web directamente al inbox sin salir del navegador (Chrome Extension).

---

## Features

### F1: PWA — Manifest + Icons + Install Prompt

**Qué:** Configurar `vite-plugin-pwa` con web app manifest completo, iconos en múltiples tamaños, y un componente de UI que invite al usuario a instalar la app cuando el navegador lo permita.

**Criterio de done:**

- [ ] `vite-plugin-pwa` instalado y configurado en `vite.config.ts`
- [ ] Manifest generado con `name`, `short_name`, `start_url`, `display: standalone`, `theme_color`, `background_color`
- [ ] Iconos PWA en `public/`: 192×192 y 512×512 (+ maskable)
- [ ] Componente `InstallPrompt` muestra banner "Instalar SecondMind" cuando `beforeinstallprompt` se dispara
- [ ] El banner se oculta permanentemente con `localStorage` tras dismiss o instalación
- [ ] En desktop Chrome y Android Chrome, la app es instalable (verificar con Lighthouse PWA audit)

**Archivos a crear/modificar:**

- `vite.config.ts` — agregar `VitePWA()` al array de plugins
- `public/pwa-192x192.png` — icono 192×192
- `public/pwa-512x512.png` — icono 512×512 (purpose: any maskable)
- `public/apple-touch-icon.png` — icono 180×180 para iOS
- `src/components/layout/InstallPrompt.tsx` — banner de instalación
- `src/app/layout.tsx` — montar `InstallPrompt`

**Notas de implementación:**

- `registerType: 'autoUpdate'` — el SW se actualiza automáticamente sin prompt de "nueva versión disponible". Para single-user, la simplicidad vale más que el control granular.
- `includeAssets: ['favicon.ico', 'apple-touch-icon.png']` para precachear assets estáticos.
- Iconos: generar desde un SVG base con herramientas como `pwa-asset-generator` o Figma. El logo SM del sidebar puede servir como base.
- `beforeinstallprompt` se guarda en `useRef` y se invoca con `prompt()` al click del banner. El evento solo se dispara una vez por sesión — capturarlo en el layout.

---

### F2: PWA — Service Worker + Offline

**Qué:** Configurar Workbox vía `vite-plugin-pwa` para precachear el app shell y cachear respuestas de API con estrategias apropiadas. Agregar indicador visual de estado offline/online.

**Criterio de done:**

- [ ] El app shell (HTML, JS, CSS, fonts) se precachea en el SW al primer load
- [ ] Al perder conexión, la app sigue cargando desde cache (shell completo)
- [ ] Los datos de TinyBase (ya en memoria) siguen disponibles offline — el usuario puede navegar notas, tareas, proyectos
- [ ] Las escrituras offline se encolan en TinyBase y se sincronizan al reconectar (comportamiento existente del persister, solo verificar)
- [ ] Indicador `OfflineBadge` visible en el header cuando `navigator.onLine === false`
- [ ] Features que requieren red (AI processing, embeddings) muestran mensaje "Disponible cuando vuelva la conexión" en vez de error críptico
- [ ] Lighthouse PWA score ≥ 90

**Archivos a crear/modificar:**

- `vite.config.ts` — configurar `workbox.runtimeCaching` con estrategias por ruta
- `src/hooks/useOnlineStatus.ts` — hook reactivo para `navigator.onLine` + eventos `online`/`offline`
- `src/components/layout/OfflineBadge.tsx` — indicador visual en header
- `src/app/layout.tsx` — montar `OfflineBadge`
- `src/components/capture/QuickCapture.tsx` — verificar que funciona offline (write a TinyBase/Firestore local)
- `src/app/inbox/process/page.tsx` — guard de red para el botón "Procesar con AI"

**Notas de implementación:**

- Estrategia de cache Workbox:
  - **Precache:** app shell (HTML, JS, CSS) — se invalida por hash en cada build.
  - **StaleWhileRevalidate:** Google Fonts, CDN assets.
  - **NetworkFirst:** llamadas a Firestore (el SDK de Firestore maneja su propio cache, no competir).
- TinyBase ya actúa como offline layer — los datos en memoria sobreviven a la pérdida de red. El persister Firestore con `autoSave` encola writes. No se necesita lógica adicional para offline data.
- **NO habilitar** `enableOfflineDataPersistence()` de Firestore — D2 del doc de arquitectura ya decidió que TinyBase es el offline layer, no Firestore.
- Cloud Functions (processInboxItem, autoTagNote, generateEmbedding) son inherentemente online. El guard es UI-only: deshabilitar botones + mostrar tooltip.
- `useOnlineStatus` usa `navigator.onLine` (inmediato) + `addEventListener('online'/'offline')` (reactivo). Devuelve `boolean`.

---

### F3: Chrome Extension — Scaffold + Popup UI

**Qué:** Crear la estructura del Chrome Extension con Manifest V3 como proyecto separado dentro del repo (`extension/`). Popup minimalista con textarea para captura rápida + botón para capturar la selección actual de la página.

**Criterio de done:**

- [ ] Directorio `extension/` con su propio `package.json`, `tsconfig.json`, y build con Vite + CRXJS
- [ ] `manifest.json` v3 con permisos: `identity`, `activeTab`, `storage`
- [ ] Popup UI funcional: textarea + botón "Guardar en Inbox" + botón "Capturar selección"
- [ ] Content script inyectable que extrae: texto seleccionado, título de la página, URL
- [ ] Al hacer click en "Capturar selección", el popup se llena con el texto seleccionado + URL de la pestaña activa
- [ ] La UI del popup sigue el design system de SecondMind (mismos colores, tipografía)
- [ ] El extension se carga como "unpacked" en Chrome y funciona

**Archivos a crear:**

- `extension/package.json` — deps: react, firebase, vite, @crxjs/vite-plugin
- `extension/vite.config.ts` — config con CRXJS plugin
- `extension/tsconfig.json` — TypeScript config
- `extension/manifest.json` — Manifest V3
- `extension/src/popup/Popup.tsx` — UI principal del popup
- `extension/src/popup/index.html` — entry point del popup
- `extension/src/popup/index.tsx` — mount React
- `extension/src/popup/popup.css` — estilos (subset de los tokens de SecondMind)
- `extension/src/content/getSelection.ts` — content script para extraer selección
- `extension/src/lib/firebaseConfig.ts` — config Firebase (mismos valores que la app principal)

**Notas de implementación:**

- **CRXJS Vite Plugin** (`@crxjs/vite-plugin`) — transforma un proyecto Vite en Chrome Extension con HMR en dev. Soporta React + TypeScript + Manifest V3 out of the box. Alternativa: build manual con Vite multi-entry, pero CRXJS ahorra configuración.
- El popup es deliberadamente simple: solo captura. No intenta replicar la app completa.
- Content script: `chrome.scripting.executeScript({ target: { tabId }, func: () => ({ text: window.getSelection()?.toString(), title: document.title, url: location.href }) })` desde el popup vía `chrome.tabs.query({ active: true, currentWindow: true })`. No necesita content script persistente.
- CSS: copiar los CSS custom properties del `src/index.css` de la app principal (colores oklch, font family, border-radius) a `popup.css`. No importar Tailwind completo — es overkill para un popup de 200×300px. Estilos manuales con las variables.
- Icono del extension: reutilizar los iconos PWA (16, 48, 128).

---

### F4: Chrome Extension — Auth + Firestore Write

**Qué:** Autenticar al usuario con Google (via `chrome.identity`) y escribir las capturas directamente a la colección `inbox/` de Firestore, usando el mismo schema que Quick Capture.

**Criterio de done:**

- [ ] Al abrir el popup por primera vez, muestra botón "Conectar con Google"
- [ ] `chrome.identity.getAuthToken({ interactive: true })` obtiene token OAuth
- [ ] `signInWithCredential(auth, GoogleAuthProvider.credential(null, token))` autentica con Firebase
- [ ] El estado auth persiste entre aperturas del popup (no pedir login cada vez)
- [ ] Al guardar, se crea doc en `users/{userId}/inbox/{itemId}` con `source: 'web-clip'` y `sourceUrl`
- [ ] El item aparece en el Inbox de la app web en < 5 segundos
- [ ] Feedback visual en popup: spinner → check ✓ → cierra tras 500ms
- [ ] Si no hay conexión, muestra error "Sin conexión" (no encolar — el popup es efímero)

**Archivos a crear/modificar:**

- `extension/src/lib/auth.ts` — lógica de auth con `chrome.identity` + Firebase
- `extension/src/lib/firestore.ts` — write a inbox collection
- `extension/src/popup/Popup.tsx` — integrar auth state + write + feedback
- `extension/manifest.json` — agregar `oauth2.client_id` y `oauth2.scopes`

**Notas de implementación:**

- **Auth flow:** `chrome.identity.getAuthToken()` devuelve un OAuth access token del Google account del browser. Se pasa a `GoogleAuthProvider.credential(null, accessToken)` y luego `signInWithCredential()`. Es el approach más limpio para MV3 — no requiere offscreen documents ni iframes.
- **Prerequisito GCP:** Crear un OAuth 2.0 Client ID tipo "Chrome app" en la consola de Google Cloud del proyecto `secondmindv1`. El `client_id` va en `manifest.json` bajo `oauth2.client_id`. El `key` del extension (public key) se obtiene al publicar o cargar como unpacked en `chrome://extensions`.
- **Firebase import:** usar `firebase/auth/web-extension` en vez de `firebase/auth` para compatibilidad con el service worker context del extension.
- **Schema del inbox item:** reusar la interfaz existente:
  ```typescript
  {
    id: crypto.randomUUID(),
    rawContent: string,           // texto capturado
    source: 'web-clip',
    sourceUrl: string,            // URL de la página
    aiProcessed: false,
    status: 'pending',
    createdAt: serverTimestamp(),
  }
  ```
- **No encolar offline:** a diferencia de la app web (que tiene TinyBase como buffer), el popup del extension es efímero — se destruye al cerrar. Encolar en `chrome.storage.local` es posible pero agrega complejidad sin valor real para uso personal. Si no hay red, mostrar error.
- Agregar `chrome-extension://<extension-id>` a los Authorized Domains en Firebase Auth console.

---

## Orden de implementación

1. **F1** → Fundamento: manifest + iconos + install prompt. Sin esto no hay PWA.
2. **F2** → Depende de F1: el SW generado por vite-plugin-pwa es lo que habilita offline. Se configura el caching y el indicador de estado.
3. **F3** → Independiente de F1/F2 pero se implementa después para no abrir dos frentes simultáneos. Scaffold del extension con popup funcional (sin auth aún).
4. **F4** → Depende de F3: agrega auth y escritura a Firestore. Es la feature que conecta el extension con la app.

---

## Estructura de archivos

```
# PWA (archivos nuevos en el proyecto existente)
public/
├── pwa-192x192.png
├── pwa-512x512.png
└── apple-touch-icon.png

src/
├── hooks/
│   └── useOnlineStatus.ts
├── components/
│   └── layout/
│       ├── InstallPrompt.tsx
│       └── OfflineBadge.tsx

# Chrome Extension (proyecto separado en el repo)
extension/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── manifest.json
├── src/
│   ├── popup/
│   │   ├── index.html
│   │   ├── index.tsx
│   │   ├── Popup.tsx
│   │   └── popup.css
│   ├── content/
│   │   └── getSelection.ts
│   └── lib/
│       ├── firebaseConfig.ts
│       ├── auth.ts
│       └── firestore.ts
└── icons/
    ├── icon-16.png
    ├── icon-48.png
    └── icon-128.png
```

---

## Definiciones técnicas

### D1: ¿Por qué vite-plugin-pwa y no SW manual?

- **Opciones:** Workbox CLI manual, vite-plugin-pwa, custom service worker
- **Decisión:** vite-plugin-pwa
- **Razón:** Genera manifest + SW + precache manifest automáticamente desde la config de Vite. Zero-config para el caso base, extensible para caching custom. El proyecto ya usa Vite — agregar un plugin es una línea. Un SW manual requeriría mantener la lista de precache a mano.

### D2: ¿Por qué CRXJS y no build manual del extension?

- **Opciones:** CRXJS Vite plugin, Plasmo framework, Webpack manual, Vite multi-entry manual
- **Decisión:** CRXJS Vite plugin
- **Razón:** Integra directamente con Vite (ya en el stack), soporta React + TypeScript + MV3 con HMR en dev. Plasmo es más opinado y agrega una capa de abstracción innecesaria para un extension minimal. Build manual con Vite requiere config multi-entry + copy de manifest + resolución de paths — CRXJS lo resuelve.

### D3: ¿Por qué chrome.identity y no offscreen document para auth?

- **Opciones:** `chrome.identity.getAuthToken()`, offscreen document con `signInWithPopup`, `firebase/auth/web-extension` directo
- **Decisión:** `chrome.identity.getAuthToken()` + `signInWithCredential()`
- **Razón:** Es el approach más simple para Google sign-in en MV3. No requiere offscreen documents, ni hosting de una página auth, ni postMessage entre frames. Funciona porque el usuario ya tiene su Google account en Chrome. Para app personal de single-user, esta simplicidad es ideal.

### D4: ¿Por qué el extension es proyecto separado y no monorepo integrado?

- **Opciones:** subfolder con su propio package.json, monorepo con workspace, todo en el mismo build
- **Decisión:** subfolder `extension/` con package.json independiente
- **Razón:** El extension tiene su propio build target (Chrome Extension vs SPA), su propio manifest, y se despliega diferente (Chrome Web Store o unpacked, no Firebase Hosting). Compartir el mismo build complicaría ambos. Lo que se comparte (Firebase config, tipos) se copia — son 10 líneas, no vale abstraer.

---

## Checklist de completado

Al terminar esta fase, TODAS estas condiciones deben ser verdaderas:

- [ ] `npm run build` genera bundle con manifest.webmanifest y SW funcional
- [ ] La app es instalable en Chrome desktop (botón de instalar en address bar)
- [ ] La app es instalable en Chrome Android (banner "Agregar a pantalla de inicio")
- [ ] Con la app instalada y sin red, la app carga y muestra los datos cacheados en TinyBase
- [ ] El badge "Offline" aparece al perder conexión y desaparece al reconectar
- [ ] Quick Capture funciona offline (guarda en TinyBase, synca después)
- [ ] Los botones de AI (Procesar inbox, etc.) se deshabilitan offline con tooltip explicativo
- [ ] Lighthouse PWA audit ≥ 90
- [ ] El Chrome Extension se carga como unpacked y muestra el popup
- [ ] El popup permite login con Google y muestra el nombre del usuario
- [ ] Capturar texto seleccionado + URL de la página activa funciona
- [ ] El item capturado aparece en el Inbox de la app web con `source: 'web-clip'`
- [ ] El deploy a Firebase Hosting sigue funcionando sin breaking changes

---

## Siguiente fase

Fase 5.1: Wrappers Nativos — Tauri para desktop (global hotkey Quick Capture, system tray) y Capacitor para mobile (Share Intent Android para capturar desde cualquier app). Esta fase habilita la PWA como base sólida sobre la que los wrappers agregan features nativas de conveniencia.
