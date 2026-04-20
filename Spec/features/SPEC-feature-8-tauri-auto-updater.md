# SPEC — SecondMind · Feature 8: Tauri Auto-Updater (Registro de implementación)

> Estado: Completada abril 2026
> Commits: `c59d457` SPEC, `d806518` plugins updater+process+dialog, `e25f583` hook + tray + settings UI, `7b4a19f` CI release workflow, `df9fd1c` fix env vars CI, `35b4064` bump 0.1.1, `135c449` bump 0.1.2, `e6ba441` merge feat, `ad523be` merge release-0.1.2
> Gotchas operativos vigentes → `Spec/ESTADO-ACTUAL.md`

## Objetivo

El usuario de la app desktop recibe una notificación al iniciar SecondMind cuando hay una versión nueva disponible. Puede aceptar la actualización, que se descarga e instala automáticamente, y la app se reinicia con la versión nueva. El developer (Sebastián) solo necesita crear un tag (`git tag vX.Y.Z && git push --tags`) para que el CI compile, firme, y publique la release completa.

## Qué se implementó

- **F1 — signing keys:** Keypair ed25519 generado con `tauri signer generate`, private key almacenada en password manager + backup local. Pubkey embebida en `tauri.conf.json`; `TAURI_SIGNING_PRIVATE_KEY` y su passphrase configurados como GitHub Secrets. Archivos tocados: `src-tauri/tauri.conf.json`, `.gitignore` (agregado `*.key`, `*.key.pub` como safety net tras accidente con `$USERPROFILE` no expandido en cmd — ver Lecciones).

- **F2 — plugins + config updater:** `tauri-plugin-updater` + `tauri-plugin-process` + `tauri-plugin-dialog` en `[dependencies]` plano de `Cargo.toml` (sin target conditional — Cargo solo compila desktop). Plugins registrados en `lib.rs` pre-`.setup()`. Capabilities extendidas con `updater:default`, `process:allow-restart/exit`, `dialog:default` sobre el scope `"windows": ["main"]` ya existente. Config `plugins.updater` apuntando a `https://github.com/sebasgc0399/SecondMind/releases/latest/download/latest.json`, `windows.installMode: "passive"`, `bundle.createUpdaterArtifacts: true`. Archivos tocados: `src-tauri/Cargo.toml`, `package.json`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`, `src-tauri/tauri.conf.json`.

- **F3 — UI de actualización:** Hook `useAutoUpdate` con guard `isTauri()` + guard `label === "main"` + startup silent check con delay 5s + listener del evento `check-for-updates` para triggers manuales. Menu item "Buscar actualizaciones" en el tray emite el evento vía `app.emit_to("main", ...)` — evita duplicar lógica JS/Rust (patrón de F7). Sección "Información de la app" en Settings con `getVersion()` y botón que emite el mismo evento. Archivos creados: `src/hooks/useAutoUpdate.ts`, `src/components/settings/AppInfoSection.tsx`. Modificados: `src/main.tsx`, `src-tauri/src/tray.rs`, `src/app/settings/page.tsx`.

- **F4 — CI release workflow:** `.github/workflows/release.yml` tag-based (`on: push: tags: 'v*'`), `windows-latest`, `tauri-apps/tauri-action@v0` con `includeUpdaterJson: true`. swatinem/rust-cache para acelerar builds subsecuentes. Placeholder comentado `# release-capacitor` para F9. Firebase env vars vía `.env.production` generado en step previo (ver Rondas de fix). Archivo creado: `.github/workflows/release.yml`.

- **F5 — versionado sync:** Los 3 sources of truth sincronizados (package.json: 0.0.0 → 0.1.0 → 0.1.1 → 0.1.2, Cargo.toml y tauri.conf.json: 0.1.0 → 0.1.1 → 0.1.2). Update flow validado E2E con la secuencia 0.1.1 instalada → 0.1.2 publicada.

## Decisiones clave

| #   | Decisión                                                   | Razón                                                                                                                                                   |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | GitHub Releases para binarios, no Firebase Hosting         | Repo público → assets sin auth. tauri-action genera Release + latest.json automáticamente. Firebase agregaría credenciales CI y upload manual de ~40MB. |
| D2  | Tag-based trigger, no push-to-main ni manual               | Un tag = una versión. Evita releases accidentales por merge. Permite job Capacitor (F9) al mismo trigger.                                               |
| D3  | Check automático al startup con delay 5s                   | No bloquear hidratación de TinyBase/Firestore. Check silencioso — solo muestra UI si hay update.                                                        |
| D4  | Diálogo nativo (`tauri-plugin-dialog`), no custom React UI | Más simple, funciona antes de que React monte, patrón estándar Tauri.                                                                                   |
| D5  | `installMode: "passive"`                                   | Muestra progreso sin wizard. Balance entre `quiet` (invisible) y `basicUi` (requiere clicks).                                                           |
| D6  | Tray command → emit event → JS handler (no lógica en Rust) | Reusa el hook JS + dialog nativo. Evita duplicar lógica updater Rust/JS. Patrón post-F7.                                                                |
| D7  | Workflow diseñado para F9                                  | Job `release-tauri` con nombre específico + placeholder comentado para `release-capacitor`. Un solo workflow, un solo trigger.                          |

## Rondas de fix

Tres bugs secuenciales se encontraron durante la implementación y validación. Cada uno resuelto root-cause primero (regla nueva del CLAUDE.md incorporada a mitad de la feature).

**Bug A — `createUpdaterArtifacts: "v2Compatible"` inválido.** El SPEC inicial proponía ese valor. El schema real de Tauri v2 (visible en `node_modules/@tauri-apps/cli/config.schema.json`) solo acepta `true`, `false`, o `"v1Compatible"` — no existe `"v2Compatible"`. `cargo check` falló con _"data did not match any variant of untagged enum Updater"_. Fix: `true` (produce artefactos v2 por default). Patcheado durante F2 antes del primer commit de plugins.

**Bug B — Tag `v0.1.1` prematuro con sources en 0.1.0.** Tag pusheado antes del merge a main y antes del bump. CI generó Release `v0.1.1` con binarios `SecondMind_0.1.0_*.exe` + `latest.json` version `0.1.0`. La app instalada leía version 0.1.0 y consultaba un endpoint que decía 0.1.0 — nunca detectaría update de sí misma. Fix: `gh release delete v0.1.1 --cleanup-tag`, bump a 0.1.1 en los 3 archivos, retag. **Lección canónica del SDD F5: bump SIEMPRE antes del tag.**

**Bug C — OAuth roto en los bundles de CI.** La app instalada desde el MSI/NSIS de CI no abría la ventana de Google al click "Sign in with Google". Root cause aislado buildeando localmente con `tauri:build` (que lee `.env.local`) — el mismo código compilaba OAuth funcional local pero no en CI. Las env vars `VITE_FIREBASE_*` declaradas en el step `env:` de tauri-action **NO se propagan al subprocess** `beforeBuildCommand` (`npm run build`) en runners `windows-latest`. El bundle CI quedaba con Firebase config `undefined`. Fix (`df9fd1c`): generar `.env.production` explícito en un step previo — Vite lo lee directo desde disk, sin depender del forwarding de env vars. Los `TAURI_SIGNING_*` permanecen en `env:` porque tauri-action los consume directamente (ahí sí funciona).

## Lecciones

- **`createUpdaterArtifacts` acepta `true`/`false`/`"v1Compatible"` solamente** — no existe `"v2Compatible"`. `true` produce artifacts v2 por default en Tauri v2.

- **Hooks en `main.tsx` se montan en TODAS las ventanas Tauri.** Main + capture comparten `main.tsx`. Guard con `getCurrentWebviewWindow().label !== 'main'` si la lógica es main-only. Lección de F7 confirmada y reaplicada en `useAutoUpdate`.

- **Capabilities con `"windows": ["main"]` aíslan APIs de otras ventanas por diseño.** Los permisos updater/process/dialog no llegan a `capture`, que tampoco los necesita. Doble guard (capability + JS label check) es defensivo pero no redundante: JS evita llamadas que generarían errores de permiso en consola.

- **tauri-action NO propaga env vars del step `env:` al subprocess `beforeBuildCommand` en Windows runners.** Patrón canónico: generar `.env.production` explícito en un step previo — Vite lo lee desde disk. Aplicable a cualquier CI Tauri + Vite + secrets de build. Caso específico del gotcha Windows-runner pipe inheritance.

- **DevTools desactivadas en production builds de Tauri** salvo feature `devtools` explícita en el crate `tauri` de `Cargo.toml`. F12/Ctrl+Shift+I no funcionan en el MSI/NSIS instalado. Diagnóstico de bugs de build-time requiere `tauri:build` local para comparar.

- **`$USERPROFILE` no expande en cmd.exe** (usa `%USERPROFILE%`). En git bash/PowerShell sí. Comandos con variables de entorno deben ser conscientes del shell target. Cuando una herramienta (ej. `tauri signer generate -w "$USERPROFILE/.tauri/..."`) acepta un path literal, un `$VAR` no expandido crea un dir literal en el cwd. `.gitignore` debe cubrir `*.key` y `*.key.pub` como safety net.

- **Tauri plugin-updater trata HTTP 404 como error**, no como "sin update disponible". Pre-primer-release el endpoint de `latest.json` devuelve 404 y el hook cae al catch. Comportamiento correcto en prod post-bootstrap (solo afecta devs antes del primer release publicado).

- **Para testear update flow end-to-end hacen falta 2 releases secuenciales.** Baseline instalado + versión nueva publicada. No se puede validar con un solo release. F5 (`bump version`) debe correr 2 veces: una para el baseline, otra para el test real.

- **tauri-action recrea git tags automáticamente al crear Releases.** Si borrás un tag remoto y el CI ya arrancó con ese tag, tauri-action lo recrea al final. Para borrar ambos en un solo paso: `gh release delete <tag> --cleanup-tag --yes`.

- **El `gh` CLI con PAT default no puede cancelar workflow runs** (403 "Resource not accessible"). Requiere scope `workflow` o `actions:write`. Fallback: dejar correr + limpiar Release post-facto con `gh release delete`.
