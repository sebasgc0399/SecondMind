# SPEC — SecondMind · Fase 5.1: Tauri Desktop

> Alcance: SecondMind como app de escritorio nativa con Quick Capture global (hotkey desde cualquier app) y system tray (siempre disponible en segundo plano)
> Dependencias: Fase 5 completada (PWA + Chrome Extension)
> Estimado: 2-3 semanas (solo dev)
> Stack relevante: Tauri v2, Rust, @tauri-apps/plugin-global-shortcut, @tauri-apps/api/tray

---

## Objetivo

El usuario puede instalar SecondMind como app de escritorio nativa que vive en el system tray. Desde cualquier aplicación (navegador, editor, terminal), puede presionar un atajo global para abrir una ventana de captura rápida sin cambiar de contexto. La app se inicia con el sistema y está siempre lista.

---

## Prerequisitos manuales

Antes de implementar, el usuario debe instalar:

1. **Rust toolchain** — `rustup` + `cargo` (https://rustup.rs)
2. **Windows Build Tools** — MSVC build tools via Visual Studio Build Tools (C++ workload)
3. **WebView2** — generalmente pre-instalado en Windows 10/11. Si no: https://developer.microsoft.com/microsoft-edge/webview2

Verificar con:

```bash
rustc --version   # debe mostrar 1.70+
cargo --version
```

Claude Code puede ejecutar todo el scaffolding y código, pero estos 3 prerequisitos requieren instalación manual del usuario.

---

## Features

### F1: Tauri Setup — Scaffold + Integración con Vite

**Qué:** Agregar Tauri v2 al proyecto existente de SecondMind. El frontend es el mismo build de Vite (`dist/`). Tauri crea `src-tauri/` con la configuración Rust y el binary nativo.

**Criterio de done:**

- [ ] `@tauri-apps/cli` instalado como devDependency en el `package.json` raíz
- [ ] `src-tauri/` generado con `tauri.conf.json`, `Cargo.toml`, `src/main.rs`
- [ ] `tauri.conf.json` configurado: `frontendDist: "../dist"`, `devUrl: "http://localhost:5173"`, identifier `com.secondmind.app`
- [ ] Scripts en `package.json`: `"tauri:dev"` y `"tauri:build"`
- [ ] `npm run tauri:dev` abre la app SecondMind en una ventana nativa con el frontend de Vite
- [ ] `npm run tauri:build` genera un instalador `.msi` (Windows) o `.dmg` (macOS)
- [ ] El icono de la app usa el brain-circuit icon existente (`public/pwa-512x512.png`)

**Archivos a crear/modificar:**

- `src-tauri/tauri.conf.json` — configuración principal
- `src-tauri/Cargo.toml` — dependencias Rust (tauri, plugins)
- `src-tauri/src/main.rs` — entry point Rust
- `src-tauri/src/lib.rs` — setup de plugins y handlers
- `src-tauri/icons/` — iconos generados desde `public/pwa-512x512.png` via `tauri icon`
- `src-tauri/capabilities/default.json` — permisos del frontend (Tauri v2 capability system)
- `package.json` — scripts `tauri:dev` y `tauri:build`
- `vite.config.ts` — ajustes mínimos para compatibilidad Tauri (puerto fijo, clearScreen: false)

**Notas de implementación:**

- **Tauri v2 usa capability-based permissions** — el frontend debe declarar qué APIs nativas puede usar. En `capabilities/default.json` se listan: `global-shortcut:allow-register`, `tray:default`, `window:allow-show`, `window:allow-hide`, etc.
- **`npx tauri init`** dentro del proyecto existente genera `src-tauri/`. No crea un proyecto nuevo — se integra al Vite existente.
- **`npx tauri icon public/pwa-512x512.png`** genera todos los iconos necesarios para cada plataforma desde el PNG existente.
- **Vite config para Tauri:** agregar `server.strictPort: true` y `clearScreen: false`. El `envPrefix` con `TAURI_` permite acceder a variables de entorno de Tauri en el frontend.
- **El build de Vite no cambia** — Tauri usa el output de `dist/` tal cual. La app web sigue funcionando igual en el navegador.

---

### F2: System Tray — Icono + Menú Contextual

**Qué:** La app vive en el system tray (bandeja del sistema). El icono del tray muestra un menú contextual con opciones básicas. Cerrar la ventana la oculta al tray en vez de terminar el proceso.

**Criterio de done:**

- [ ] Icono de SecondMind visible en el system tray al iniciar la app
- [ ] Click izquierdo en el tray icon muestra/oculta la ventana principal
- [ ] Click derecho muestra menú contextual: "Abrir SecondMind", "Captura rápida", separador, "Salir"
- [ ] "Salir" cierra la app completamente (no solo oculta)
- [ ] Cerrar la ventana (botón X) la oculta al tray en vez de cerrar la app
- [ ] El tray icon usa el brain-circuit icon (16×16 o 32×32 según plataforma)

**Archivos a crear/modificar:**

- `src-tauri/src/lib.rs` — setup del tray con menú
- `src-tauri/src/tray.rs` — lógica del system tray (crear, manejar eventos)
- `src-tauri/icons/tray-icon.png` — icono 32×32 para el tray
- `src-tauri/capabilities/default.json` — agregar permisos de tray y window
- `src-tauri/tauri.conf.json` — configurar `"trayIcon"` y `"windows[0].closingPolicy": "hide"` (Tauri v2 maneja el close-to-tray via config, no via evento)

**Notas de implementación:**

- **Tauri v2 system tray** usa `TrayIconBuilder` en Rust. El menú se construye con `MenuBuilder` → items `MenuItem` y `PredefinedMenuItem::separator()`.
- **Close-to-tray** en Tauri v2: configurar la ventana con `close_requested` event que hace `window.hide()` en vez de `window.destroy()`. O usar el campo `closingPolicy` en `tauri.conf.json` si está disponible en la versión.
- **Tray icon**: debe ser PNG con fondo transparente. El brain-circuit icon funciona pero necesita versión sin fondo purple — solo el cerebro blanco sobre transparente. Generar con sharp desde el SVG fullbleed (reemplazar fondo purple por transparente).
- **Nota sobre Windows**: el tray icon en Windows debe ser `.ico` o PNG 32×32. Tauri convierte automáticamente si se provee PNG.

---

### F3: Global Shortcut — Quick Capture desde cualquier app

**Qué:** Registrar un atajo de teclado global (funciona incluso cuando SecondMind no tiene foco) que abre una ventana de captura rápida. El usuario puede capturar ideas sin cambiar de contexto.

**Criterio de done:**

- [ ] `Alt+Shift+N` registrado como global shortcut (funciona desde cualquier app)
- [ ] Al presionar el shortcut, se abre una ventana pequeña de captura (no la ventana principal)
- [ ] La ventana de captura es: siempre al frente (always on top), centrada, sin decoración (frameless), ~400×200px
- [ ] La ventana de captura contiene: textarea enfocado + Enter para guardar + Escape para cerrar
- [ ] Al guardar, el texto se escribe al inbox de Firestore (misma lógica que QuickCapture de la app web)
- [ ] Tras guardar, la ventana se cierra automáticamente con feedback visual (✓)
- [ ] Si la ventana de captura ya está abierta, el shortcut la enfoca en vez de abrir otra
- [ ] El shortcut se registra al iniciar la app y se libera al salir

**Archivos a crear/modificar:**

- `src-tauri/src/lib.rs` — registrar global shortcut
- `src-tauri/capabilities/default.json` — agregar `global-shortcut:allow-register`, `global-shortcut:allow-unregister`
- `src/app/capture/page.tsx` — nueva ruta `/capture` para la ventana de captura (React)
- `src-tauri/tauri.conf.json` — definir segunda ventana `"capture"` (label, tamaño, decorations: false, alwaysOnTop: true, visible: false)
- `src/hooks/useQuickCapture.ts` — modificar para detectar contexto Tauri y escribir a Firestore directo si la ventana es la de captura

**Notas de implementación:**

- **`Alt+Shift+N`** en vez de `Alt+N` — el shortcut global no debe colisionar con shortcuts de otras apps. `Alt+N` es demasiado genérico. `Alt+Shift+N` es más seguro y memorable ("N de Nota" con modificadores).
- **Plugin `@tauri-apps/plugin-global-shortcut`** — se instala como Cargo dependency + npm package. Se registra en Rust con `GlobalShortcutPlugin::default()` y se invoca desde JS o Rust.
- **Ventana de captura separada** — Tauri v2 soporta múltiples ventanas. La ventana `"capture"` se define en `tauri.conf.json` con `visible: false` (oculta por defecto). El global shortcut la muestra/oculta via `WebviewWindow::get_webview_window("capture")?.show()`.
- **Frameless window** — `decorations: false` + drag region CSS (un header con `-webkit-app-region: drag`). La ventana no tiene barra de título, solo el textarea y botones.
- **El frontend de la ventana de captura** es la misma app React pero en la ruta `/capture`. Tauri carga esa ruta específica en la segunda ventana via el campo `url` en la config de la ventana.
- **Firestore write desde la ventana de captura** — reutiliza `useInbox` o la función `createInboxItem` existente. No necesita lógica nueva — la ventana tiene acceso a Firebase Auth y Firestore igual que la ventana principal.
- **Detección de contexto Tauri** — `import { isTauri } from '@tauri-apps/api/core'` o `window.__TAURI__` para condicionales.

---

### F4: Auto-start + Polish

**Qué:** La app se inicia automáticamente con el sistema operativo (minimizada al tray) y tiene comportamientos pulidos de ventana.

**Criterio de done:**

- [ ] Plugin autostart configurado — la app se inicia con Windows (minimizada al tray)
- [ ] El usuario puede desactivar el autostart desde el menú del tray ("Iniciar con Windows" toggle)
- [ ] La ventana principal recuerda su tamaño y posición entre sesiones
- [ ] Doble click en el tray icon abre la ventana principal
- [ ] La app funciona sin conexión (TinyBase offline, misma lógica que la PWA)

**Archivos a crear/modificar:**

- `src-tauri/Cargo.toml` — agregar `tauri-plugin-autostart` y `tauri-plugin-window-state`
- `src-tauri/src/lib.rs` — registrar plugins autostart y window-state
- `src-tauri/src/tray.rs` — agregar item toggle "Iniciar con Windows" al menú del tray
- `src-tauri/capabilities/default.json` — agregar permisos de autostart

**Notas de implementación:**

- **`tauri-plugin-autostart`** — registra la app en el startup del OS. En Windows, agrega un registry key. El toggle en el menú del tray llama `autostart::enable()` / `autostart::disable()`.
- **`tauri-plugin-window-state`** — persiste posición, tamaño y estado de la ventana automáticamente. Zero config — solo registrar el plugin.
- **Sin conexión:** la app Tauri tiene el mismo comportamiento offline que la PWA — TinyBase en memoria, Workbox cache del shell. No se necesita lógica adicional.

---

## Orden de implementación

1. **F1** → Fundamento: sin Tauri configurado, nada funciona. El dev puede probar que la app web se ve correctamente en la ventana nativa.
2. **F2** → El system tray es la base para que la app sea "residente" — viva en segundo plano. F3 y F4 dependen de que la app no se cierre al presionar X.
3. **F3** → Depende de F1 (ventana secundaria) y F2 (app residente). El global shortcut es la feature hero de esta fase.
4. **F4** → Polish que solo tiene sentido cuando F1-F3 están completas. Autostart + window state son plugins drop-in.

---

## Estructura de archivos

```
src-tauri/                       # Tauri backend (Rust)
├── tauri.conf.json              # Config: ventanas, plugins, bundle, identifier
├── Cargo.toml                   # Deps Rust: tauri, plugins
├── build.rs                     # Build script (generado)
├── capabilities/
│   └── default.json             # Permisos del frontend (capability system v2)
├── icons/                       # Generados con `tauri icon`
│   ├── icon.ico
│   ├── icon.png
│   ├── tray-icon.png            # 32×32, fondo transparente
│   └── ...
└── src/
    ├── main.rs                  # Entry point (generado)
    ├── lib.rs                   # Setup: plugins, tray, global shortcut
    └── tray.rs                  # Lógica del system tray + menú

src/
├── app/
│   └── capture/
│       └── page.tsx             # Ventana de captura rápida (ruta /capture)
└── ...                          # El resto del frontend no cambia
```

---

## Definiciones técnicas

### D1: ¿Por qué Tauri v2 y no Electron?

- **Opciones:** Tauri v2, Electron, Neutralinojs
- **Decisión:** Tauri v2
- **Razón:** Binary ~15MB vs ~150MB de Electron. Usa WebView nativo del OS (WebView2 en Windows, WebKit en macOS/Linux). Menor consumo de memoria. El costo es necesitar Rust toolchain para build, pero el código Rust es mínimo (~100 líneas para tray + shortcut).

### D2: ¿Por qué `Alt+Shift+N` y no `Alt+N` como global shortcut?

- **Opciones:** `Alt+N`, `Ctrl+Shift+N`, `Alt+Shift+N`, configurable
- **Decisión:** `Alt+Shift+N` hardcoded
- **Razón:** `Alt+N` colisiona con shortcuts de muchas apps (Outlook, VS Code). `Ctrl+Shift+N` es "nueva ventana incógnito" en Chrome. `Alt+Shift+N` está libre en la mayoría de apps. Hacerlo configurable agrega UI de settings — overkill para single-user. Si colisiona con algo específico del usuario, se cambia en el código.

### D3: ¿Por qué ventana de captura separada y no reutilizar la principal?

- **Opciones:** Mostrar ventana principal con QuickCapture modal, ventana separada dedicada
- **Decisión:** Ventana separada `"capture"`
- **Razón:** La ventana principal es pesada (sidebar, dashboard, stores). Mostrarla para una captura de 3 segundos es lento y distrae. Una ventana frameless de 400×200px con solo un textarea es instantánea y no rompe el contexto del usuario.

### D4: ¿Por qué `src-tauri/` en el proyecto principal y no proyecto separado?

- **Opciones:** `src-tauri/` integrado, proyecto separado como `extension/`
- **Decisión:** `src-tauri/` integrado en el raíz
- **Razón:** A diferencia del Chrome Extension (que tiene build target completamente diferente), Tauri **consume** el output de Vite (`dist/`). El `tauri:dev` lanza Vite + Tauri juntos. Separarlos complicaría el dev workflow sin beneficio.

---

## Checklist de completado

Al terminar esta fase, TODAS estas condiciones deben ser verdaderas:

- [ ] `npm run tauri:dev` abre SecondMind en ventana nativa con frontend funcional
- [ ] `npm run tauri:build` genera instalador (`.msi` en Windows)
- [ ] Icono de SecondMind visible en el system tray
- [ ] Cerrar la ventana la oculta al tray (no termina el proceso)
- [ ] Click izquierdo en tray icon muestra/oculta la ventana
- [ ] Click derecho en tray icon muestra menú con "Abrir", "Captura rápida", "Salir"
- [ ] `Alt+Shift+N` desde cualquier app abre la ventana de captura rápida
- [ ] La ventana de captura es frameless, always on top, con textarea enfocado
- [ ] Escribir texto + Enter guarda en inbox y cierra la ventana
- [ ] La app se inicia con Windows (minimizada al tray)
- [ ] La ventana principal recuerda posición y tamaño entre sesiones
- [ ] La app web (`npm run dev`) sigue funcionando igual sin Tauri
- [ ] El deploy a Firebase Hosting no se ve afectado

---

## Siguiente fase

Fase 5.2: Capacitor Mobile — Wrapper para Android con Share Intent (capturar contenido desde el menú "Compartir" de cualquier app Android directamente al inbox de SecondMind).
