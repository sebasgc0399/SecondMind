# SPEC — SecondMind · Fase 5.1: Tauri Desktop (Registro de implementación)

> Estado: **Completada** — Abril 2026
> Alcance: SecondMind como app de escritorio nativa Windows con Quick Capture global, system tray, autostart opcional, window-state persistido y single-instance.
> Stack implementado: Tauri v2.10.3, Rust 1.94.1, MSVC Build Tools 2026, 4 plugins oficiales Tauri
> Para gotchas operativos consolidados → `Spec/ESTADO-ACTUAL.md` sección "Tauri Desktop (Fase 5.1)".

---

## Objetivo

El usuario instala SecondMind como app de escritorio nativa que vive en el system tray. Desde cualquier app (Chrome, VS Code, terminal) presiona `Ctrl+Shift+Space` y una ventana frameless aparece centrada con textarea enfocado. Escribe, Enter guarda al inbox de Firestore y cierra. Escape cancela. La app se inicia con Windows (opcional) y recuerda posición/tamaño entre sesiones.

---

## Prerequisitos instalados

- **Rust toolchain:** `rustc 1.94.1`, `cargo 1.94.1` (via https://rustup.rs)
- **MSVC Build Tools 2026** con workload "Desktop development with C++" (MSVC compiler, Windows 11 SDK, CMake)
- **WebView2:** pre-instalado en Windows 10/11

---

## Features implementadas

### F1: Scaffold Tauri + integración Vite (commits C1+C2)

- `tauri init --ci` con identifier `com.secondmind.app`, frontend dist `../dist`, dev URL `http://localhost:5173`
- Iconos generados con `tauri icon public/pwa-512x512.png` (todas las plataformas)
- `src-tauri/Cargo.toml`: package `secondmind`, lib `secondmind_lib`, feature `tray-icon` activada en dep `tauri`
- `tauri.conf.json`: ventana main 1280×800 + bundle targets `msi` y `nsis`
- `package.json`: scripts `tauri`/`tauri:dev`/`tauri:build`, deps `@tauri-apps/cli@^2.10.1` y `@tauri-apps/api@^2.10.1`
- `vite.config.ts`: `clearScreen: false`, `server.port: 5173` + `strictPort: true`, `envPrefix: ['VITE_', 'TAURI_ENV_']`
- `.gitignore` raíz con `src-tauri/target/` y `src-tauri/gen/`

### F2: System tray + close-to-tray (commit C3)

- `src-tauri/src/tray.rs` con `TrayIconBuilder` + `MenuBuilder`:
  - Items: "Abrir SecondMind", "Captura rápida", separador, "Iniciar con Windows" (CheckMenuItem), separador, "Salir"
  - `on_menu_event` routing por ID (open/capture/autostart/quit)
  - `on_tray_icon_event` maneja click izquierdo → toggle main window (show/hide)
  - Icon del tray reutiliza `src-tauri/icons/32x32.png` (el default de tauri icon)
- `src-tauri/src/lib.rs` invoca `tray::build(app.handle())` en setup
- Close-to-tray en JS: hook `src/hooks/useCloseToTray.ts` con `onCloseRequested` + `preventDefault` + `hide`. Montado en `main.tsx` via wrapper `TauriIntegration`, se ejecuta en cada WebView del bundle (main y capture).
- `src/lib/tauri.ts`: helpers `isTauri()`, `showMainWindow()`, `hideCurrentWindow()` con imports dinámicos (no rompen build web).
- `capabilities/default.json`: permisos `core:tray:default`, `core:menu:default`, window show/hide/set-focus/unminimize/close.

### F3: Global shortcut `Ctrl+Shift+Space` + ventana /capture (commit C4)

- Deps Rust: `tauri-plugin-global-shortcut@2.3.1`, `tauri-plugin-single-instance@2.4.1`
- Dep npm: `@tauri-apps/plugin-global-shortcut@2.3.1`
- `tauri.conf.json`: segunda ventana `capture` `{label, url: "/capture", width: 480, height: 220, decorations: false, alwaysOnTop: true, center: true, visible: false, skipTaskbar: true, resizable: false, focus: true}`
- `tauri.conf.json` CSP explícito para Firebase:
  ```
  connect-src: ipc: http://ipc.localhost *.googleapis.com *.firebaseio.com wss://*.firebaseio.com *.firestore.googleapis.com identitytoolkit.googleapis.com securetoken.googleapis.com apis.google.com
  frame-src: *.firebaseapp.com accounts.google.com
  ```
- `src-tauri/src/lib.rs`:
  - Plugin `single_instance::init` con callback que enfoca main window en segundo lanzamiento
  - Plugin `global_shortcut::Builder::new().build()`
- `src/app/router.tsx`: ruta `/capture` top-level (fuera de Layout)
- `src/app/capture/page.tsx`:
  - Si `user == null` → estado con botón "Abrir SecondMind" que hace `showMainWindow()` + `hideCurrentWindow()`
  - Si autenticado → textarea enfocado auto, Enter guarda con `setDoc(doc(db, 'users', uid, 'inbox', id), { source: 'desktop-capture', status: 'pending', aiProcessed: false, createdAt: serverTimestamp() })`, feedback check 300ms, cierre con `hideCurrentWindow()`
  - Escape cierra sin guardar
  - Header con `data-tauri-drag-region` para arrastrar la ventana frameless
- `src/hooks/useGlobalShortcutRegistration.ts`: registra `Ctrl+Shift+Space` con guard `isRegistered()` + `unregister()` previo para evitar duplicados por HMR. Cleanup en unmount.
- `src/main.tsx` wrapper `TauriIntegration` invoca `useCloseToTray()` y `useGlobalShortcutRegistration()`.
- `capabilities/default.json`: agrega permissions `global-shortcut:*` y `core:webview:allow-create-webview-window`.
- `capabilities/capture.json` (nuevo): `windows: ["capture"]` con `core:default` + window show/hide/set-focus. Mínimo privilegio.

### F4: Autostart + window-state (commit C5)

- Deps Rust: `tauri-plugin-autostart@2.5.1`, `tauri-plugin-window-state@2.4.1`
- Deps npm: `@tauri-apps/plugin-autostart`, `@tauri-apps/plugin-window-state`
- `src-tauri/src/lib.rs`:
  - Plugin `window_state::Builder::default().with_denylist(&["capture"]).build()` — main persiste pos/size, capture siempre centrada
  - Plugin `autostart::init(MacosLauncher::LaunchAgent, None)`
- `src-tauri/src/tray.rs`:
  - `CheckMenuItemBuilder "Iniciar con Windows"` con estado inicial leyendo `autolaunch().is_enabled()`
  - Handler del item alterna `enable()`/`disable()` + `item.set_checked(!enabled)` (menu items inmutables post-build)
- `capabilities/default.json`: agrega `autostart:allow-enable`, `allow-disable`, `allow-is-enabled`.

### F5: Build MSI release + documentación (commit C6)

- `npm run tauri:build` genera:
  - `src-tauri/target/release/bundle/msi/SecondMind_0.1.0_x64_en-US.msi`
  - `src-tauri/target/release/bundle/nsis/SecondMind_0.1.0_x64-setup.exe`
- Actualización de `Spec/ESTADO-ACTUAL.md` con sección Fase 5.1 (decisiones, patrones, gotchas, deps)
- Actualización de `CLAUDE.md` con comandos tauri + gotchas + fase 5.1 en lista de fases
- Este SPEC convertido a registro

---

## Decisiones clave (aplicadas)

| #   | Decisión                                                     | Razón                                                                                                   |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| D1  | `/capture` como ruta top-level, fuera de Layout              | Layout hidrata sidebar + TinyBase + editor (~2.7MB). Capture debe abrir en <200ms                       |
| D2  | Escritura directa a Firestore desde `/capture` (no TinyBase) | Ventana efímera, no vale hidratar persister. Main recibe snapshot reactivo ~200-800ms                   |
| D3  | Global shortcut registrado en JS (no Rust)                   | Más simple; callback puede controlar WebViews directo sin IPC                                           |
| D4  | Close-to-tray en JS via `onCloseRequested`                   | Un solo hook para main y capture; más contenido en React                                                |
| D5  | `Ctrl+Shift+Space` en vez de `Alt+Shift+N`                   | Cero conflictos en Windows (Chrome no lo usa, VS Code solo con editor enfocado)                         |
| D6  | `tauri-plugin-single-instance`                               | Obligatorio con autostart para prevenir doble proceso                                                   |
| D7  | window-state con denylist `["capture"]`                      | Capture siempre centrada; main sí persiste pos                                                          |
| D8  | MSI + NSIS ambos                                             | MSI corporate-friendly, NSIS futuro auto-updater                                                        |
| D9  | CSP explícito Firebase                                       | Release build sin CSP correcto rompe auth + firestore                                                   |
| D10 | Version sync parcial                                         | `tauri.conf.json` y `Cargo.toml` en `0.1.0`; `package.json` queda en `0.0.0` hasta major release formal |
| D11 | `src-tauri/` integrado en raíz                               | Tauri consume `dist/`, workflow `tauri:dev` lanza Vite+Tauri juntos                                     |

---

## Estructura de archivos final

```
src-tauri/
├── tauri.conf.json              # identifier, ventanas main+capture, CSP Firebase, bundle msi+nsis
├── Cargo.toml                   # deps: tauri (feat tray-icon) + 4 plugins
├── Cargo.lock                   # pinned versions
├── build.rs                     # generado por tauri init
├── .gitignore                   # target/, gen/schemas
├── capabilities/
│   ├── default.json             # windows: ["main"], todos los permisos
│   └── capture.json             # windows: ["capture"], solo window controls
├── icons/                       # generados con tauri icon
│   ├── icon.ico, icon.png, 32x32.png, 128x128.png, ...
│   └── android/, ios/           # generados pero no usados (Windows only)
└── src/
    ├── main.rs                  # entry: secondmind_lib::run()
    ├── lib.rs                   # setup: 4 plugins + tray::build
    └── tray.rs                  # TrayIconBuilder + menu + handlers

src/
├── app/
│   └── capture/
│       └── page.tsx             # Ventana /capture: auth guard + textarea + Firestore setDoc
├── hooks/
│   ├── useCloseToTray.ts        # onCloseRequested → preventDefault + hide
│   └── useGlobalShortcutRegistration.ts  # register Ctrl+Shift+Space
├── lib/
│   └── tauri.ts                 # isTauri, showMainWindow, hideCurrentWindow
├── main.tsx                     # TauriIntegration wrapper invoca los 2 hooks
└── app/router.tsx               # ruta /capture top-level
```

---

## Checklist de completado (verificado)

- [x] `npm run tauri:dev` abre ventana nativa con login/dashboard + HMR
- [x] `npm run tauri:build` genera `.msi` y `.exe` NSIS
- [x] Icono SecondMind visible en system tray (diseño manual requerido tras testing)
- [x] Click izq tray toggle ventana main
- [x] Click der tray muestra menú con 5 items (Abrir / Captura / Iniciar con Windows / Salir + separadores)
- [x] "Salir" termina proceso; botón X oculta al tray (proceso vivo)
- [x] `Ctrl+Shift+Space` desde cualquier app abre ventana capture frameless centrada
- [x] Textarea enfocado auto, Enter guarda a Firestore con `source: 'desktop-capture'`, feedback check, hide
- [x] Escape cierra capture sin guardar
- [x] Item aparece en main window inbox ~1s después (reactividad TinyBase)
- [x] Single-instance previene duplicados tras doble click al .exe
- [x] Toggle "Iniciar con Windows" modifica registry key `HKCU\...\Run\SecondMind`; menu check reflejado
- [x] Main window recuerda pos/size entre sesiones; capture siempre centrada
- [x] `npm run dev` solo sigue funcionando en navegador (sin Tauri)
- [x] PWA + Chrome Extension intactos
- [x] Cloud Functions procesan items creados por desktop-capture igual que otros sources

---

## Siguiente fase

**Fase 5.2 — Capacitor Mobile:** wrapper Android con Share Intent (capturar contenido desde el menú "Compartir" de cualquier app Android directamente al inbox de SecondMind).

**Fuera de scope:**

- iOS (requiere Apple Developer ID $99/año)
- Code signing Windows (cert EV ~$300/año o Azure Trusted Signing ~$10/mes) — sin firma el MSI muestra SmartScreen warning "Unknown publisher"
- Build macOS/Linux
- Auto-updater via NSIS (ya configurado el target, pero sin servidor de updates)
