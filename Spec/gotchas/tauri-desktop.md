# Tauri Desktop

> Canon de gotchas del dominio. Índice ligero en `../ESTADO-ACTUAL.md` § "Gotchas por dominio (índice)".
> Cada gotcha vive como `## <título>`. El slug del título es el anchor estable referenciado desde el índice.
> Consolida Tauri Desktop + Auto-Updater + Releases (D2 SPEC F37).

## `src-tauri/` integrado en el raíz del proyecto

No proyecto separado. Tauri consume output de Vite (`dist/`). `tauri:dev` lanza Vite + Tauri juntos.

## Ventana `/capture` como ruta top-level, fuera de Layout

Layout hidrata sidebar + TinyBase + editor pesado; capture debe abrir en <200ms. Top-level = solo auth + textarea + `setDoc` directo. Misma pattern que la extension.

## Hook JS en `main.tsx` se monta en TODAS las ventanas del bundle

Tauri no separa entrypoints por ventana — `main`, `capture` y futuras comparten el mismo `main.tsx`. Side effects globales (shortcut OS-level, init de singleton, analytics) duplican registro sin guard. Patrones seguros: (1) registrar Rust-side si es OS-level, (2) guard `getCurrentWebviewWindow().label === 'main'` en el hook, (3) hook legítimamente per-window como `useCloseToTray` porque cada ventana necesita su propio listener de `close-requested`.

## Global shortcut registrado Rust-side

Con `tauri_plugin_global_shortcut::Builder::new().with_handler(...)` dentro de `setup()`. El pattern original (hook JS) se montaba en ambas ventanas → double-register race → callback en contexto `capture` operando sobre sí misma → quirks Windows (tauri#6843). Rust-side garantiza registro único + AppHandle estable, y permite compartir `tray::show_capture` con el handler del tray (zero duplicación).

## Close-to-tray en JS via `onCloseRequested`

Hook `useCloseToTray` en `main.tsx` llama `event.preventDefault()` + `getCurrentWebviewWindow().hide()`. Se monta en cada ventana.

## Single-instance plugin obligatorio con autostart

Sin él, autostart + click manual = dos instancias, segunda falla al registrar shortcut global.

## Window-state plugin con denylist `["capture"]`

Capture siempre centrada, nunca recuerda pos. Main sí persiste pos/size.

## Feature `tray-icon` obligatorio en `Cargo.toml`

`tauri::tray` gated detrás de `features = ["tray-icon"]`.

## Capabilities Tauri v2 NO soportan wildcards

Usar `core:tray:default`, `core:menu:default`, `core:window:allow-*` enumerado. Separadas por ventana: `default.json` para main, `capture.json` para capture — principio de mínimo privilegio.

## IDE marca capabilities "not accepted" tras agregar plugin

Schema `gen/schemas/desktop-schema.json` se regenera solo en `cargo check/build`. Correr uno y recargar IDE.

## CSP Firebase explícito en `tauri.conf.json`

`connect-src` debe enumerar hostnames Firebase completos (`*.googleapis.com`, `*.firebaseio.com`, `wss://*.firebaseio.com`, `identitytoolkit.googleapis.com`, `securetoken.googleapis.com`). `frame-src`: `*.firebaseapp.com accounts.google.com` para el popup de Google signIn en release. Lista canónica vive en [tauri.conf.json](../../src-tauri/tauri.conf.json) — copiar de ahí, no de este gotcha.

## Auth en Tauri NO usa `signInWithPopup`

WebView2 abre `window.open` en browser del sistema y el popup no puede comunicarse de vuelta. Fix: OAuth Desktop flow custom en `src-tauri/src/oauth.rs` — HTTP listener local, abre URL via `plugin-shell`, intercambia code por id_token, `signInWithCredential`. PKCE + state CSRF. Credenciales en `.env.local` (`VITE_GOOGLE_OAUTH_CLIENT_ID` + SECRET). OAuth listener es one-shot.

## Shortcut global `Ctrl+Shift+Space`

Cero conflictos en Windows. `Alt+N` local sigue intacto (QuickCaptureProvider).

## `--legacy-peer-deps` también para `@tauri-apps/*`

Con Vite 8.

## Bundle MSI + NSIS ambos activos

MSI para distribución corporativa, NSIS para auto-updater futuro. Output en `src-tauri/target/release/bundle/{msi,nsis}/`.

## Capture multi-monitor (Feature 7)

`tray.rs::show_capture` centra en monitor del cursor. Hit-test cursor-based con `?? monitors[0]` fallback. Dimensiones físicas con `scale_factor * LOGICAL_SIZE` (NO `outer_size()`). `set_position` llamado DOS veces (pre + post `show()`) por Windows hidden-window queue quirk. `set_size(LogicalSize(480, 220))` post-show para resetear tamaño canónico — seguro porque corre al rest.

## Drag de capture window fue revertido (F7 round 3)

Cross-DPI drag disparaba feedback loop de `onScaleChanged` + `setSize` que paniceaba tao con integer underflow (`event_loop.rs:2035/2042`). Bug upstream tauri#3610 abierto desde 2022 sin fix. Para mover a otro monitor, re-invocar shortcut.

## Menu items inmutables post-build en Tauri

`CheckMenuItem` lee `is_enabled()` al construirse; no se puede reconstruir el menú en runtime. Para toggle (ej. "Iniciar con Windows"), alternar `enable()/disable()` + `set_checked(!enabled)` sobre el item existente. Aplica a cualquier menu item Tauri que cambie estado post-setup.

## `Tauri 2.10 clear_all_browsing_data()` es nuclear sin parámetros (post-F36.F7.1)

No existe `BrowsingDataKind` ni filtros granulares en la API. Borra cookies + cache + localStorage + sessionStorage + IndexedDB + CacheStorage + SWs en un solo call atómico. Para cualquier flow que necesite invalidar storage del WebView (post-update purge, sign-out completo, reset de profile), partir directo con esta — no existe purga selectiva oficial. Trade-off conocido: re-login Firebase + resync TinyBase desde Firestore una vez por invocación. Patrón vivo en [src-tauri/src/version_check.rs](../../src-tauri/src/version_check.rs).

## msedgewebview2.exe mantiene file locks activos durante el setup callback (post-F36.F7.1)

Cualquier `remove_dir_all` sobre `%LOCALAPPDATA%\<bundle>\EBWebView\Default\` desde el setup callback de Tauri choca con `PermissionDenied (32)` ratio 100% — incluso post-`taskkill /F /IM msedgewebview2.exe` previo (Windows respawn-protege el proceso). QA empírica F7.1 confirmó en producción real. Implicación: NO diseñar flows que asuman filesystem manipulation granular del profile WebView2 en setup; ir directo al fallback nuclear (`clear_all_browsing_data()`). Cleanup del approach C (filesystem-purge granular) en F36.F9.A — `version_check.rs` quedó solo con la rama nuclear.

## `tauri-plugin-log` debe registrarse unconditional para visibilidad en release builds (post-F36.F7.1)

Plugin gated en `if cfg!(debug_assertions) { ... }` deja `app_log_dir()/<ProductName>.log` vacío en MSI/NSIS instalado — sin telemetría para troubleshooting de bugs en producción. Patrón canónico: registrar siempre con `LevelFilter::Warn` en release / `Info` en debug. **Defense in depth:** para eventos críticos cross-build (purge, version check, telemetry), append explícito a archivo aparte (ej. `purge.log`) en `app_local_data_dir()` por si el framework log falla. Patrón vivo en [src-tauri/src/lib.rs](../../src-tauri/src/lib.rs) y [src-tauri/src/version_check.rs](../../src-tauri/src/version_check.rs).

## MSI uninstaller borra `%LOCALAPPDATA%\<bundle_id>\` completo automáticamente (post-F36.F7.1, menor)

Al desinstalar via Settings → Apps, Windows borra el directorio entero del bundle, incluyendo `version.txt`, `purge.log`, `logs/SecondMind.log`, telemetría persistida, perfil WebView2. Es feature, no bug — pero implica que cualquier diagnóstico post-uninstall queda perdido. Si hace falta investigar bugs post-mortem (ej. updater dejó instalación corrupta), copiar `%LOCALAPPDATA%\<bundle_id>\` ANTES de desinstalar.

## tauri-action NO propaga env vars del step `env:` al subprocess `beforeBuildCommand` en Windows runners

`VITE_FIREBASE_*` declaradas en `env:` quedaban `undefined` dentro de `npm run build` que dispara tauri-action, rompiendo Firebase/OAuth en los bundles de CI. Patrón canónico: generar `.env.production` explícito en un step previo — Vite lo lee directo desde disk, sin depender del forwarding entre procesos. Los `TAURI_SIGNING_*` siguen en `env:` porque los consume tauri-action directamente (ahí sí funciona). Ver `.github/workflows/release.yml` step "Generate .env.production for Vite". Aplicable a F9 Capacitor CI y cualquier futuro workflow.

## `createUpdaterArtifacts` en `tauri.conf.json` acepta `true`/`false`/`"v1Compatible"` solamente

No existe `"v2Compatible"`. `true` produce artifacts v2 firmados por default. Schema verificado en `node_modules/@tauri-apps/cli/config.schema.json`.

## Tauri `plugin-updater` trata HTTP 404 como error

No como "sin update disponible". Pre-primer-release el endpoint de `latest.json` devuelve 404 y el hook cae al catch — el error dialog solo aparece en check manual (startup silent traga el error). Comportamiento correcto en prod post-bootstrap.

## DevTools desactivadas en production builds de Tauri

Salvo que se agregue feature `devtools` al crate `tauri` de `Cargo.toml` (`features = ["tray-icon", "devtools"]`). F12/Ctrl+Shift+I no funcionan en el MSI/NSIS instalado. Diagnóstico de bugs build-time requiere `tauri:build` local para comparar vs el bundle de CI.

## `gh release delete <tag> --cleanup-tag --yes`

Elimina Release + tag remoto en un solo paso. tauri-action recrea git tags al crear Releases; si borrás solo el tag, el siguiente run puede recrearlo. Usar siempre `--cleanup-tag` cuando se está rehaciendo un release.

## `gh` CLI con PAT default no puede cancelar workflow runs

403 "Resource not accessible". Requiere scope `workflow` o `actions:write`. Fallback: dejar correr + limpiar Release post-facto.

## Update flow E2E requiere ≥2 releases secuenciales

Baseline instalado (v0.1.1) + versión nueva publicada (v0.1.2) para validar `check() → dialog → download → install → relaunch`. No se puede testear con un solo release. F5 del SPEC F8 corrió 2 veces: bump 0.1.1 (baseline) + bump 0.1.2 (update target).

## Hook JS `useAutoUpdate` se monta en ambas ventanas main + capture

Guard `label !== "main"` obligatorio al inicio — las capabilities `updater:default` / `process:*` solo están scopeadas a `"windows": ["main"]`, pero la llamada desde capture generaría errores de permiso visibles en consola. Doble guard (capability + JS label) es defensivo y correcto.

## Tray command → emit event → JS handler

Patrón post-F7 que F8 reutilizó. `app.emit_to("main", "check-for-updates", ())` desde Rust + `listen("check-for-updates")` en el hook JS. Evita duplicar lógica updater en Rust y JS.

## Capacitor 8 exige Node >=22 y JDK 21 en el runner Android

`setup-node@v5` con `node-version: 22` (Capacitor CLI requirement) y `setup-java@v5` con `java-version: 21` (Capacitor genera `capacitor.build.gradle` con `sourceCompatibility=21`). Local pasa con 22 + JBR de Android Studio 2024+ pero los defaults del SPEC (20 + 17) fallan. `release-capacitor` queda asymétrico con `release-tauri` en Node 20 — aceptable, tauri-action no invoca Capacitor CLI.

## Prerelease guard dinámico para tags `-rc`/`-beta` (F13)

El step `Build & Release Tauri` usa `prerelease: ${{ contains(github.ref_name, '-rc') || contains(github.ref_name, '-beta') }}` en vez de hardcoded `false`. GitHub resuelve el endpoint `/releases/latest/...` al último NON-prerelease por default — los RCs quedan publicados pero invisibles para el updater. Pattern base para validar cambios al workflow sin impactar usuarios.

## Patrón RC-tag + cleanup para validar workflow changes end-to-end (F13)

Cualquier modificación al `release.yml` (bumps de actions, nuevos steps, cambio de build params) se valida pusheando `v<X.Y.Z>-rc1` desde la feature branch antes del merge a main. El workflow corre completo (ambos jobs Tauri + Capacitor, ~9 min) → verificar con `gh release view <tag> --json isPrerelease` que es `true` y `gh release list` sigue mostrando el release previo como "Latest" → cleanup `gh release delete <tag> --cleanup-tag --yes`. Valida 100% del pipeline sin riesgo de disparar updater ni notificar a testers de App Distribution de algo roto. Aplicado por primera vez en F13 con `v0.1.8-rc1` para el bump a Node 24 actions.

## Actions del workflow pineadas a major o version inmutable, nunca a `@v0` / tags movibles (F13)

Actions oficiales de GitHub (`actions/checkout`, `actions/setup-node`, `actions/setup-java`) se pinean a major (`@v5`). Third-party (`tauri-apps/tauri-action`, `wzieba/Firebase-Distribution-Github-Action`) se pinean a version inmutable (`@v0.6.2`, `@v1.7.1`) para evitar regresiones silenciosas en un minor update. Tag movible como `@v0` en tauri-action era deuda técnica — pineado en F13.

## `gradlew` pierde el bit executable tras `git checkout` en `ubuntu-latest`

Step `chmod +x gradlew` antes del primer `./gradlew` invocation. Windows local no lo expone (se invoca `gradlew.bat`). Gotcha universal para cualquier pipeline Android multi-OS.

## SHA-1 del release keystore debe registrarse en Firebase Console ANTES del primer CI release

Para apps con Google Sign-In nativo. Sin eso, el APK firma correctamente pero `SocialLogin.login()` devuelve `DEVELOPER_ERROR` en runtime — parece bug de código, es config de consola. Firebase auto-provisiona el Android OAuth client en GCP al agregar el SHA-1. Al rotar keystore (por ejemplo en nueva máquina de dev), re-registrar el nuevo SHA-1 es parte del ritual, como bumpear versión. Repetir en Firebase Console → Project Settings → app Android → SHA fingerprints.

## `versionName`/`versionCode` del APK via Gradle props `-P` derivados del tag

CI computa `VERSION_NAME=${GITHUB_REF_NAME#v}` y `VERSION_CODE=$((MAJOR*10000 + MINOR*100 + PATCH))`, pasa `./gradlew assembleRelease -PversionName=$VERSION_NAME -PversionCode=$VERSION_CODE`. `android/app/build.gradle` usa `project.hasProperty('versionName') ? project.versionName : "1.0"` como fallback. versionCode semver-encoded es legible (0.1.6 → 106) y elimina `build.gradle` de la lista de bump manual por release — el tag es la única source of truth. Lista de bump por release queda solo en `package.json` + `Cargo.toml` + `Cargo.lock` + `tauri.conf.json`.

## `google-services.json` inyectado via secret base64 (no committed)

Aunque Firebase lo considere no-secret. Decode en CI: `echo "${{ secrets.ANDROID_GOOGLE_SERVICES_JSON_BASE64 }}" | base64 -d > android/app/google-services.json`. `android/app/build.gradle` aplica el plugin `com.google.gms.google-services` condicionalmente con `try { file('google-services.json').text }` — sin el archivo, Firebase Analytics + push + Google Sign-In nativo quedan silenciosamente sin inicializar. Mismo patrón para el release keystore (`ANDROID_KEYSTORE_BASE64` → `android/app/release.keystore`).

## Toda nueva `VITE_*` requiere bumpear el heredoc `.env.production` en cada job CI que la consume (post-F36.F9.B)

El bug latente más fácil de introducir tras agregar `VITE_NEW_VAR` al frontend: olvidar agregarla al heredoc del step "Generate .env.production for Vite" en `.github/workflows/release.yml`. El bundle CI sale con `undefined`, pero el bug solo se manifiesta cuando el code path que la lee se ejecuta — puede quedar oculto meses si está detrás de un flow poco frecuente. Caso F36.F9.B: `VITE_GOOGLE_OAUTH_CLIENT_ID/SECRET` faltaban en `release-tauri` desde el primer release Tauri vía CI; `signInWithTauri` (`tauriAuth.ts:31-35`) checa ambas al entrar y aborta con throw — pero la sesión Firebase persistida del usuario nunca dispara el sign-in screen tras updates, así que el bug quedó inerte hasta que el nuclear purge de F7.1 borró IndexedDB y el sign-in se ejecutó por primera vez con un bundle CI-built (commit hotfix v0.2.6). **Convención:** cualquier PR que agregue una `VITE_*` debe diff-checkear `.github/workflows/release.yml` para confirmar inclusión en cada job que la consume (`release-tauri`, `release-capacitor`, o ambos). El step `env:` del action NO sustituye al heredoc — Vite lee de `.env.production` directo, no del environment del subprocess.

## Hide-until-ready de main window via `visible:false` + `showMainWindow()` idempotente (post-F41)

`tauri.conf.json` con `"visible": false` en main window + `showMainWindow()` desde `useEffect` post-paint del Layout (mismo hook que dispara `hideSplash()` de F40 móvil) elimina el flash blanco entre que la window OS aparece y que React termina el primer paint. Sin esto: ~50–300ms de window en blanco en cold start prod, hasta ~1–3s con bootstrap auth + hidratación TinyBase. La idempotency module-scope es obligatoria: cubre (a) StrictMode dev double-mount, (b) `tauri-plugin-single-instance` `show()` desde Rust cuando llega 2da instancia mid-cold-start de la 1ra, (c) HMR full-reload (resetea flag JS pero plugin Tauri es idempotente Rust-side). Patrón vivo en [src/lib/tauri.ts](../../src/lib/tauri.ts) (`mainWindowShown` flag module-scope + try/catch defensivo para que primera llamada marque el flag aunque la API webviewWindow falle, evitando reintentos infinitos) + [src/hooks/useHideSplashWhenReady.ts](../../src/hooks/useHideSplashWhenReady.ts) (handoff cross-platform unificado: Capacitor `hideSplash` + Tauri `showMainWindow`, ambos no-op en web). Safety timeout 5s en [src/main.tsx](../../src/main.tsx) cubre crash pre-mount Layout — sin él la window quedaría oculta para siempre. Estrategias descartadas: (B) show post-bootstrap completo deja al user con .exe sin feedback 1-3s ("¿no abrió?"); (C) HTML inline pre-React en `index.html` duplica visual del AppBootSplash y fragmenta lógica de splash. Edge case aceptado: 2da instancia durante ~200ms de cold start de la 1ra, plugin `single_instance` llama `show()` ANTES que React monte → flash blanco breve. Mitigación a futuro si emerge feedback.
