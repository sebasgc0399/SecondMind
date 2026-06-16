# SPEC — Feature 61: Purga del HTTP cache del WebView en update de APK (Android)

> Estado: En implementación — rama `feat/android-webview-cache-purge`
> Depende de: F36 (patrón purge-on-version-bump; template Tauri `src-tauri/src/version_check.rs`)

## Objetivo

Tras instalar una APK nueva de release, la app Android sigue mostrando el **bundle viejo** hasta que el usuario cierra la app y borra **"Caché"** (no "Datos") en Ajustes de Android. Eliminar esa intervención manual: que un update de APK propague el bundle nuevo en el primer arranque, sin tocar los datos del usuario.

**Causa raíz (verificada en el fuente de Capacitor 8.3.0):** `WebViewLocalServer.java` sirve los assets locales (`index.html` + chunks) con `Cache-Control: no-cache` —que **permite almacenar**, solo pide revalidar— y nunca llama `setCacheMode` (queda `LOAD_DEFAULT`), sin emitir validadores `ETag`/`304` efectivos. El WebView guarda `index.html` (nombre **estable** entre releases) en su HTTP disk cache y lo reusa tras el update → carga los chunks JS hasheados **viejos** → bundle viejo entero. Vive en la partición **"Caché"** (por eso "Eliminar caché" lo cura sin tocar "Datos": IndexedDB/localStorage/Firestore).

**No es el Service Worker:** no se registra en Capacitor (mount-gate en `src/components/layout/UpdateBanner.tsx`). Upstream sin fix (ionic-team/capacitor discussion #7790, abierta; igual en Capacitor v5/v6/v7).

**Approach:** replicar en Android el patrón "purge-on-version-bump" de Tauri (`version_check.rs`): gate `BuildConfig.VERSION_CODE` vs una marca persistida en SharedPreferences (fuera del WebView); si la versión subió → `WebView.clearCache(true)` + `reload`. La **primera APK con este fix ya autocura** a los usuarios trabados (marca ausente → 0 < versionCode actual → purga en el primer arranque).

## Sub-features

### F1 — Gate de versión + purga del HTTP cache

- **Qué:** override de `onCreate` en `MainActivity.java`. Gate `BuildConfig.VERSION_CODE > stored` (SharedPreferences propio `secondmind_native`, key `lastPurgedVersionCode`, default 0). Si sube: `getBridge().getWebView().clearCache(true)` + `webView.post(webView::reload)`, y persiste el versionCode con `.commit()` (síncrono). Guard `getBridge()`/`getWebView()` null → difiere sin marcar. **Requiere habilitar `buildFeatures { buildConfig = true }` en `android/app/build.gradle`** (desvío al plan, ver D6).
- **Criterio de done:** compila (`assembleDebug` → `BUILD SUCCESSFUL`, verificado); `assembleDebug -PversionCode=N` dispara la purga cuando N sube respecto del valor guardado y es noop cuando no cambia.
- **Archivos:** `android/app/src/main/java/com/secondmind/app/MainActivity.java`, `android/app/build.gradle` (flag `buildConfig`).

### F2 — Telemetría logcat

- **Qué:** trazas con tag `SecondMindCachePurge`: `gate:` (current/stored/debug), `noop:`, `purged:`, `bridge null`. Mismo edit que F1.
- **Criterio de done:** las 4 ramas observables en `adb logcat -s SecondMindCachePurge` durante los Casos A–D.
- **Archivo:** `MainActivity.java` (mismo edit).

### F3 — QA on-device + cierre SDD

- **Qué:** ejecutar Casos A–D on-device; corregir el párrafo Android de `Spec/gotchas/pwa-offline.md` + escalar el gotcha nuevo; actualizar `Spec/ESTADO-ACTUAL.md`; archivar este SPEC.
- **Criterio de done:** Casos A–D verdes (bundle nuevo sin borrado manual + sesión Firebase/IndexedDB intactos); docs actualizados.
- **Archivos:** `Spec/gotchas/pwa-offline.md`, `Spec/ESTADO-ACTUAL.md`, este SPEC.

## Decisiones clave

| ID     | Decisión                                                                            | Rationale                                                                                                                                                                                                                                                                                                                                                     |
| ------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | Override de `onCreate`, no de `load()`                                              | Tras `super.onCreate()`, `getBridge()` ya es no-null y la navegación inicial (`loadUrl(appUrl)` síncrono en `BridgeActivity.load()`) ya se disparó. `load()` es `protected` y overridearlo obliga a replicar su contrato — más frágil sin ganancia.                                                                                                           |
| **D2** | Reload posteado `webView.post(webView::reload)`                                     | Se serializa **después** del `loadUrl` inicial síncrono, ya con el cache purgado. `WebView.reload()` re-valida la URL actual (no re-navega a la raíz como `Bridge.reload()`, que hace `post(loadUrl(appUrl))`). No re-dispara `onCreate` → sin loop infinito. Doble-load brevemente visible solo post-update; el splash (F40 `launchAutoHide:false`) lo tapa. |
| **D3** | Gate `>` (monotónico), no `!=`                                                      | CI computa `versionCode = MAJOR*10000+MINOR*100+PATCH` (estrictamente creciente). `>` no purga en downgrade/rollback (ese cache ya se invalidó al subir). Primera instalación: stored ausente → 0 → purga inocua sobre cache vacío.                                                                                                                           |
| **D4** | `.commit()` (síncrono), no `.apply()`                                               | Corre en main thread en `onCreate`; un int es trivial y elimina la ventana de carrera (proceso muere antes del flush async de `apply`). Marca **solo al purgar** (dentro del `if`) → un fallo de purga no marca la versión como ya purgada.                                                                                                                   |
| **D5** | SharedPreferences propio `secondmind_native`                                        | No pisar la key de Capacitor `LAST_BINARY_VERSION_NAME` (que Capacitor usa en `Bridge.isNewBinary()` para invalidar `CAP_SERVER_PATH` de live-updates, NO el HTTP cache). La purga es complementaria, no redundante.                                                                                                                                          |
| **D6** | Habilitar `buildFeatures { buildConfig = true }` en `build.gradle` (desvío al plan) | El plan asumió que `BuildConfig` se generaba siempre (AGP 8.13). **Falso:** desde **AGP 8.0 la generación de `BuildConfig` está OFF por default**. Sin el flag, `MainActivity` no compila (`cannot find symbol: variable BuildConfig`). Atrapado al compilar de verdad (regla "probar el verificador"). Cambio mínimo y estándar; no afecta otras variantes.  |

## Orden de implementación

1. **F1 + F2** — un solo edit atómico de `MainActivity.java` (commit `feat`).
2. **F3** — QA on-device (Casos A–D) + cierre docs (commit `docs`).

## Verificación (QA on-device)

Build desde el worktree. `adb logcat -c` + `adb logcat -s SecondMindCachePurge`. Build: `npm run build && npx cap sync android && cd android && ./gradlew.bat assembleDebug -PversionCode=<N>` → `adb install -r`.

- **Caso A — primera instalación:** `adb uninstall com.secondmind.app`, instalar `-PversionCode=500`. Esperado `gate: current=500 stored=0` → `purged ... marked 500`.
- **Caso B — idempotencia:** cerrar (swipe recents) y reabrir varias veces (mismo APK). Esperado `gate: ... stored=500` → `noop`. Nunca `purged`.
- **Caso C — repro + cura del bug real:** instalar con texto-marcador **viejo** y versionCode 500, abrir (cachea). Cambiar el texto, rebuild+sync, instalar **mismo** 500 → se ve el texto **viejo** (repro del stale). Luego instalar el bundle nuevo `-PversionCode=501` (update in-place) → `purged`, y el **texto nuevo se ve sin borrar cache manualmente**.
- **Caso D — datos intactos:** tras la purga, confirmar sesión Firebase activa + notas presentes (valida que `clearCache(true)` no toca "Datos").

Revertir cualquier texto-marcador temporal del Caso C. **Verde antes de cerrar:** correr `npm run build` (confirma que el sync no rompió el bundle); el cambio es Java puro (no afecta `tsc`/`eslint`).

## Checklist

- [ ] F1 — gate + purga en `onCreate`
- [ ] F2 — telemetría logcat
- [ ] Build APK debug desde el worktree (`-PversionCode`)
- [ ] F3 — Casos A–D on-device verdes
- [ ] F3 — corregir `pwa-offline.md` + escalar gotcha + actualizar `ESTADO-ACTUAL.md`
- [ ] Merge `--no-ff` a main
- [ ] Definir scope de release (coordinado vs Android-only) con Sebastián
- [ ] Limpieza del worktree
