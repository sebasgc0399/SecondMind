# Registro — 2026-04-14 · Migración de branding + build Tauri

> Sesión de trabajo en el PC secundario (sin `.env.local` con credenciales OAuth).
> Todo quedó commiteado y pusheado a `main` vía merge `--no-ff` del branch `feat/branding-migration`.

---

## Qué se hizo (resumen)

1. **Migración de branding completa**: nuevo logo SecondMind (cerebro violet sobre squircle oscuro) + cambio de color primario `#7b2ad1` → `#878bf9`.
2. **Regeneración de todos los sets de íconos** (PWA, Chrome Extension, Tauri Desktop).
3. **Deploys a Firebase Hosting** (4 rondas según iteraciones del usuario sobre los assets).
4. **Build Tauri** (MSI + NSIS) exitoso tras arreglar una instalación de Visual Studio rota.
5. **Identificación** del problema de Google Sign-In en Tauri Desktop (credenciales OAuth faltantes en `.env.local` de este PC).
6. **Merge a `main`** + push.

---

## Estado del repo

**Branch activo al momento de cerrar sesión:** `main` (ya sincronizado con `origin/main`)

**Commits nuevos en `main` (desde 54b48d8):**

```
7abeadb  Merge feat/branding-migration into main
6e6f138  Add favicon-16x16.png to the public directory
c6f5de9  feat(branding): migrar a nuevo logo SecondMind y color #878bf9
```

**En casa basta con:**

```bash
git checkout main
git pull origin main
```

No hay trabajo pendiente sin commitear.

---

## Cambios de código aplicados

### 1. Reemplazo de color `#7b2ad1` → `#878bf9`

| Archivo                                                              | Línea | Cambio                                          |
| -------------------------------------------------------------------- | ----- | ----------------------------------------------- |
| [index.html](../index.html#L7)                                       | 7     | `<meta name="theme-color" content="#878bf9" />` |
| [vite.config.ts](../vite.config.ts#L25)                              | 25    | `theme_color: '#878bf9'` en manifest PWA        |
| [extension/src/popup/popup.css](../extension/src/popup/popup.css#L7) | 7     | `--brand: #878bf9`                              |

`background_color: '#0a0a0a'` en vite.config.ts se mantiene intacto (es el dark bg del splash, no el brand).

### 2. `.env.example` — documentación de vars OAuth Tauri

Agregado:

```
# Tauri Desktop Sign-In (OAuth Desktop client en GCP, proyecto secondmindv1)
VITE_GOOGLE_OAUTH_CLIENT_ID=
VITE_GOOGLE_OAUTH_CLIENT_SECRET=
```

Sin valores (commiteable). El `.env.local` real vive en cada máquina del usuario.

---

## Assets regenerados

### `public/` (PWA + favicon)

**Nuevos / reemplazados:**

- `favicon.svg` (copiado de `Branding/files/favicon.svg`)
- `favicon-32x32.png` (downscale vía `npx sharp-cli` desde `brain-mark-512.png`)
- `apple-touch-icon.png`, `pwa-192x192.png`, `pwa-512x512.png`, `pwa-maskable-512x512.png` (copiados de `Branding/files/`)
- `favicon-16x16.png` (agregado por el usuario en commit `6e6f138`)

**Eliminados (legacy):**

- `brain-fullbleed.svg`, `brain-original.svg`
- `icon-16.png`, `icon-48.png`, `icon-128.png`
- `icons.svg`

### `extension/icons/` (Chrome Extension MV3)

- `icon-128.png` (copiado de `Branding/files/icon-128.png`)
- `icon-16.png` y `icon-48.png` (downscale vía `npx sharp-cli` desde `icon-128.png`)

### `src-tauri/icons/` (Tauri Desktop)

Regenerado completo con:

```bash
npx @tauri-apps/cli icon Branding/files/tauri-icon-source.png --output src-tauri/icons
```

Pisa todos los PNG/ICO/ICNS incluyendo `Square*Logo`, `StoreLogo`, `android/mipmap-*`, `ios/AppIcon-*`. Fuente final: `Branding/files/tauri-icon-source.png` (subido a mitad de sesión para fixear unos viewBox/recortes del ícono).

### Fuentes de branding en `Branding/files/`

`Branding/files/` es la **fuente de verdad**. Al cambiar el logo, editar el SVG / PNG grande ahí y re-ejecutar los comandos de regeneración. Contiene `favicon.svg`, `app-icon.svg`, `app-icon-512.png`, `brain-mark-512.png`, `tauri-icon-source.png`, `pwa-*.png`, etc.

---

## Deploys ejecutados

### Firebase Hosting (https://secondmind.web.app)

Se hicieron **4 deploys** durante la sesión, todos con `npm run deploy` (que ejecuta `npm run build && firebase deploy --only hosting`). El último deja:

- `theme_color: "#878bf9"` en `manifest.webmanifest` (verificado con `curl`).
- PWA precache de 26 entradas (~2820 KiB).
- Nuevos íconos servidos desde `/pwa-*.png`, `/favicon.svg`, etc.

**Nota sobre el badge "Abrir en aplicación" con ícono viejo en Chrome:** era caché local de la PWA instalada. Solución: `chrome://apps` → quitar SecondMind → reinstalar. O DevTools → Application → Clear site data.

### Chrome Extension

Rebuild ejecutado 3 veces con `cd extension && npm run build` tras cada cambio de branding. Los archivos quedan en `extension/dist/`. **No se despliega** — se carga unpacked en `chrome://extensions` → Reload (↻). El Extension ID es fijo vía key en `manifest.json` (commit `8dbb995`), así que no hace falta reinstalar.

### Tauri Desktop (MSI + NSIS)

Build final exitoso tras arreglar la instalación de Visual Studio. Artefactos:

- `src-tauri/target/release/bundle/msi/SecondMind_0.1.0_x64_en-US.msi`
- `src-tauri/target/release/bundle/nsis/SecondMind_0.1.0_x64-setup.exe`

**⚠️ No instalar estos MSI/NSIS** en casa — fueron buildeados sin credenciales OAuth, el sign-in de Google fallará. En el PC de casa, correr `npm run tauri:build` local para que Vite inyecte las vars de `.env.local` en build-time.

---

## Problemas encontrados y soluciones

### 1. `npx sharp-cli` para downscale de PNGs

Fue necesario para `favicon-32x32.png` y extension `icon-16/48.png`. Sharp no está instalado en el proyecto. La ruta confiable en Windows:

```bash
npx sharp-cli -i <src.png> -o <dst.png> resize <W> <H>
```

`sharp-cli@5.2.0` se instala efímero vía npx. Sin dep permanente.

### 2. Visual Studio Professional 2022 roto en este PC

Cuando se intentó `npm run tauri:build` por primera vez:

- `cargo metadata` fallaba por PATH sin `~/.cargo/bin`. Fix: prepend a PATH.
- Luego `link.exe failed` porque el `link.exe` de Git coreutils (`C:\Program Files\Git\usr\bin\link.exe`) tapaba al de MSVC.
- `vcvars64.bat` llamaba a `vcvarsall.bat` que **no existía** en el VS install (instalación incompleta).
- `VsDevCmd.bat` fallaba porque `vswhere.exe` no estaba en su ruta esperada.
- **Root cause:** Windows SDK no estaba instalado (`C:\Program Files (x86)\Windows Kits\10\` vacío) — sin `kernel32.lib`, `ntdll.lib`, etc., link.exe no puede linkear nada.

**Fix:** el usuario abrió Visual Studio Installer → Modify → marcó workload "Desktop development with C++" → instaló Windows 11 SDK 10.0.26100.0.

Luego, como `vcvarsall.bat` seguía faltando, se creó un batch manual con env vars hardcodeadas:

**`c:\tmp\build-tauri.bat`** (fuera del repo, no commiteado):

```bat
@echo off
setlocal
set "VSINSTALL=C:\Program Files\Microsoft Visual Studio\2022\Professional"
set "MSVC_VER=14.44.35207"
set "SDK_ROOT=C:\Program Files (x86)\Windows Kits\10"
set "SDK_VER=10.0.26100.0"

set "MSVC_BIN=%VSINSTALL%\VC\Tools\MSVC\%MSVC_VER%\bin\Hostx64\x64"
set "MSVC_INC=%VSINSTALL%\VC\Tools\MSVC\%MSVC_VER%\include"
set "MSVC_LIB=%VSINSTALL%\VC\Tools\MSVC\%MSVC_VER%\lib\x64"

set "SDK_BIN=%SDK_ROOT%\bin\%SDK_VER%\x64"
set "SDK_INC=%SDK_ROOT%\Include\%SDK_VER%"
set "SDK_LIB=%SDK_ROOT%\Lib\%SDK_VER%"

set "PATH=%MSVC_BIN%;%SDK_BIN%;%USERPROFILE%\.cargo\bin;%PATH%"
set "INCLUDE=%MSVC_INC%;%SDK_INC%\ucrt;%SDK_INC%\shared;%SDK_INC%\um;%SDK_INC%\winrt"
set "LIB=%MSVC_LIB%;%SDK_LIB%\ucrt\x64;%SDK_LIB%\um\x64"
set "LIBPATH=%MSVC_LIB%"

cd /d C:\Project\SecondMind
npm run tauri:build
endlocal
```

**Uso:** `cmd.exe //c "C:\tmp\build-tauri.bat"` desde Git Bash. Build tardó 4m 19s.

**En el PC de casa no hace falta esto** — si el VS install está bien, `npm run tauri:build` funciona directo desde cualquier terminal que tenga cargo en PATH.

### 3. Google Sign-In no funciona en Tauri Desktop (en este PC)

**Síntoma:** click en "Sign in with Google" desde el .exe instalado → nada / error.

**Causa:** `src/lib/tauriAuth.ts:31-36` requiere `VITE_GOOGLE_OAUTH_CLIENT_ID` y `VITE_GOOGLE_OAUTH_CLIENT_SECRET`. Son build-time vars (Vite las embebe en `dist/`). En este PC, `.env.local` no las tenía.

**En GCP ya existe el OAuth Client Desktop:**

- Nombre: `SecondMind Desktop`
- Client ID: `39583209123-7qep5ssm1m7giqihh1qpcov5r5b437l4.apps.googleusercontent.com`
- Proyecto: `secondmindv1`

El client secret el usuario lo tiene **en el `.env.local` de su PC de casa**.

**Flujo técnico** (para referencia futura, ya implementado en Fase 5.1):

1. `invoke('start_oauth_listener')` → Rust bindea `127.0.0.1:0` y devuelve puerto random.
2. JS genera PKCE (`code_verifier` + `code_challenge`) y `state` UUID.
3. `shell.open(google_auth_url)` abre el browser del sistema.
4. Google redirige a `http://127.0.0.1:PORT?code=...&state=...`.
5. Rust emite evento `oauth://callback` con la URL.
6. JS valida `state`, intercambia `code` + `code_verifier` + `client_secret` en `oauth2.googleapis.com/token` → `id_token`.
7. `signInWithCredential(auth, GoogleAuthProvider.credential(id_token))`.

Google acepta redirects loopback `http://127.0.0.1:*` automáticamente para Desktop clients — no hace falta listarlos en GCP.

**Referencia completa:** [Spec/SPEC-fase-5.1-tauri-desktop.md:100-125](../Spec/SPEC-fase-5.1-tauri-desktop.md)

---

## Acciones pendientes para el PC de casa

### Checklist al llegar

1. `git checkout main && git pull origin main` — trae todos los cambios.
2. Verificar que `.env.local` todavía tiene:
   ```
   VITE_GOOGLE_OAUTH_CLIENT_ID=39583209123-7qep5ssm1m7giqihh1qpcov5r5b437l4.apps.googleusercontent.com
   VITE_GOOGLE_OAUTH_CLIENT_SECRET=<tu-secret>
   ```
3. `npm install --legacy-peer-deps` si hay algún diff en package-lock (no debería — esta sesión no cambió deps).
4. `npm run tauri:build` — va a compilar con las OAuth vars embebidas. MSI + NSIS quedan en `src-tauri/target/release/bundle/`.
5. Desinstalar el SecondMind viejo (si estaba instalado) → instalar el MSI nuevo → verificar:
   - Ícono nuevo (cerebro violet) en launcher, tray, y ventana.
   - Sign in with Google abre browser → elegir cuenta → redirect → dashboard cargado.
   - Color `#878bf9` en elementos branded.

### Nada para commitear

El working tree quedó limpio al hacer el push. Al llegar no hay conflictos ni WIPs.

---

## Archivos que NO se commitearon (pero existen localmente)

- `c:\tmp\build-tauri.bat` — solo útil si el VS install de casa también está roto (improbable).
- `src-tauri/target/` — build artifacts, gitignored.
- `dist/`, `extension/dist/` — build outputs, gitignored.
- `node_modules/` — gitignored.

---

## Siguiente paso lógico (no urgente)

**Cleanup de Spec/SPEC-fase-5-pwa-extension.md y 5.2-capacitor-mobile.md:** ambos mencionan `#7b2ad1` como color histórico. No rompe nada, pero si se quiere dejar la migración documentada limpia, se puede actualizar el hex en esas referencias. Out of scope de esta sesión.

**Auto-updater Tauri:** ya hay NSIS build; el siguiente paso natural es agregar `@tauri-apps/plugin-updater` para que el MSI/EXE instalado chequee releases de GitHub y se actualice solo. No es parte de la Fase 5.1 completada, sería una Fase 5.1.1 o similar.
