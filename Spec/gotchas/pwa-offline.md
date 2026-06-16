# PWA + Offline

> Canon de gotchas del dominio. Índice ligero en `../ESTADO-ACTUAL.md` § "Gotchas por dominio (índice)".
> Cada gotcha vive como `## <título>`. El slug del título es el anchor estable referenciado desde el índice.

## `vite-plugin-pwa` con `generateSW` y `autoUpdate`

`navigateFallback: 'index.html'` permite SPA routing offline. `navigateFallbackDenylist: [/^\/api/, /^\/__\//]` evita interceptar rutas Firebase internas.

## TinyBase es el offline layer

Datos en memoria sobreviven pérdida de red. Persister custom (`createCustomPersister` v8) emite `setDoc` por cada cambio local; `onSnapshot` se re-arma automáticamente al reconectar y rehidrata. No se usa `enableOfflineDataPersistence()` de Firestore.

## Guards offline solo en features AI

Escrituras locales (notas, tareas, hábitos) funcionan via TinyBase. Solo "Procesar" inbox (CF + Claude) y SimilarNotesPanel (embeddings Firestore) se deshabilitan offline.

## `useOnlineStatus` usa `useSyncExternalStore`

Más correcto semánticamente que useState+useEffect para subscripciones a APIs del browser.

## `maximumFileSizeToCacheInBytes: 4MB` en workbox config

Bundle principal ~2.7MB por Reagraph/Three.js. Cuando haya code-splitting del grafo, se puede bajar.

## navigateFallbackDenylist para rutas golpeadas desde links externos (email)

Una ruta que se golpea desde un **link externo** (email de verify/reset, deep link compartido, OAuth callback) debe cargar **siempre el bundle actual desde la red**, no el `index.html` precacheado. Con `registerType: 'prompt'` el SW sirve el precache para las navegaciones (`navigateFallback: 'index.html'`); si el cliente tiene un SW viejo cacheado, ese `index.html` viejo **no conoce la ruta nueva** → React Router cae en el `*` catch-all del `Layout` y muestra un **404 dentro del app shell** (síntoma observado en el test de prod de SPEC-54: la URL `/auth/action` renderizaba el sidebar + 404 en vez de la landing standalone).

Fix: agregar la ruta al `navigateFallbackDenylist` para que sus navegaciones bypasseen el precache y vayan a la red (Firebase Hosting sirve el `index.html` actual → bundle actual). No se pierde nada offline: estas rutas necesitan red igual (llaman a Firebase Auth). Vivo en `vite.config.ts`:

```ts
navigateFallbackDenylist: [/^\/api/, /^\/__\//, /^\/auth\/action/],
```

Aplica a cualquier futura ruta hit-from-outside. **Caveat:** el denylist solo ayuda una vez que el SW que lo contiene está activo en el cliente — los clientes con un SW pre-fix necesitan un ciclo de actualización primero. Por eso conviene desplegar el denylist **antes** de que la ruta reciba tráfico externo real (en SPEC-54 se desplegó antes de que el soporte de Firebase active el callbackUri que apunta los emails a `/auth/action`).

## El SW no debe registrarse en native — y `immediate:!isNative` no lo impide

En Capacitor (Android) y Tauri (WebView2) el PWA service worker **no debe registrarse**: la app ya trae el bundle empacado y lo sirve local, así que el SW solo agrega un precache cache-first que pelea contra el bundle nativo. Tras un update del binario el SW viejo **persiste en el storage del WebView** (`app_webview/Default/Service Worker/` en Android, `EBWebView/Default/Service Worker/` en WebView2 — sobrevive a la reinstalación) e intercepta `index.html` sirviendo el bundle viejo. Síntoma: actualizás el APK/instalador y seguís viendo lo viejo hasta borrar datos de la app.

**Trampa que tumbó F36.F7:** `useRegisterSW({ immediate: !isNative })` NO previene el registro. En vite-plugin-pwa `immediate` solo controla **cuándo** registra (`true`=ya, `false`=en evento `load`), no **si** — `register()` se llama incondicional en el fuente del plugin (`node_modules/vite-plugin-pwa/dist/client/build/register.js`). Con `immediate:false` el SW se registra igual, diferido al `load`.

**Fix (vivo en `src/components/layout/UpdateBanner.tsx`):** gatear el **mount** de la cadena que llama `useRegisterSW`. El outer (sin hooks) hace `if (isTauri() || isCapacitor()) return null`; un `WebUpdateBanner` inner tiene los hooks. En native el inner nunca monta → el SW nunca se registra. Toda instalación nueva queda limpia para siempre.

**Curar instalaciones ya trabadas:** un SW trabado NO se cura desde el bundle JS — el SW sirve el bundle viejo, así que el código de cura nunca corre (por eso `useVersionCheck` era self-defeating: leía `__APP_VERSION__` del bundle que el SW mantenía viejo). La cura debe vivir en una capa que el SW no controle:

- **Tauri:** `src-tauri/src/version_check.rs` corre `clear_all_browsing_data()` en Rust **pre-WebView**, gateado por `version.txt` en disco → un release con **version bump** cura los desktop trabados.
- **Android (SW trabado de cohorte pre-F36):** la _registration_ del SW vive en los **Datos** (`app_webview/Default/Service Worker/`), que `clearCache` no toca → una instalación con un SW residual real necesita uninstall+reinstall (o "Eliminar datos"). Pero post-F36 el SW **ya no se registra** en Capacitor, así que esto solo afecta instalaciones muy viejas. **El cache stale que se observa hoy en Android es OTRO problema** — el HTTP cache del WebView, no el SW — con su propia cura nativa: ver el gotcha [Android — el HTTP cache del WebView sirve el bundle viejo tras update de APK (F60)](#android--el-http-cache-del-webview-sirve-el-bundle-viejo-tras-update-de-apk-f60).
- **self-destroying SW** cura vía el propio `sw.js` (se fetchea bypaseando el cache del SW viejo), pero `selfDestroying` es **global de build** → rompería el PWA web (exigiría un build nativo separado).

**F59 — reintroducción SEGURA de `__APP_VERSION__` (no regresa el bug de `useVersionCheck`):** SPEC-59 repone el `define __APP_VERSION__` (build-time) para el accessor `getRunningVersion()` (conciencia de versión en runtime + modal what's-new). La diferencia con el `useVersionCheck` removido es el **timing**, no el dato: `useVersionCheck` leía la versión para **detectar** un update (circular — el bundle viejo que sirve el SW reporta su propia versión vieja, nunca "ve" que hay una nueva). F59 la lee **después** del reload que ya activó el bundle nuevo (post-`UpdateBanner`), para **saber qué notas mostrar** — y compara contra `lastSeenVersion` (Firestore), nunca contra la red. Regla: leer la versión del **bundle ya activo** para mostrar contenido es seguro; usarla como señal de "hay versión nueva" bajo SW `prompt`+`skipWaiting:false` es self-defeating.

Verificado on-device A/B (2026-06, release 0.4.6): Android (filesystem `Service Worker/` poblado pre-fix vs ausente post-fix) + Tauri (perfil WebView2 aislado con `WEBVIEW2_USER_DATA_FOLDER`).

**Reconfirmado en el smoke de SPEC-56 (web/preview):** el mismo mecanismo cache-first aplica al SW **web** — entre rebuilds locales, `npm run preview` sigue sirviendo el bundle viejo precacheado (`skipWaiting:false` → el SW viejo no cede control hasta que todas las tabs cierren). Para QA de un bundle nuevo en preview: desregistrar el SW + limpiar Cache Storage (`navigator.serviceWorker.getRegistrations()` → `unregister()` + `caches.keys()` → `caches.delete()` — **NO** `indexedDB`, así auth y datos quedan intactos) y recargar. Refuerza por qué un cambio client-side necesita **rebuild nativo en los 3 frentes** en el release, no solo deploy web (el síntoma se vivió al testear F2: `[storage:persist]` no aparecía hasta quitar el SW viejo).

## Android — el HTTP cache del WebView sirve el bundle viejo tras update de APK (F60)

**Distinto del SW.** El SW no se registra en Capacitor (mount-gate en `UpdateBanner.tsx`), así que el cache stale que se observa en Android tras instalar una APK nueva **no es el SW** — es el **HTTP disk cache del WebView**. Síntoma: tras el update del APK la app muestra el bundle viejo hasta cerrarla y borrar **"Caché"** (no "Datos") en Ajustes de Android.

**Causa raíz (verificada en el fuente de Capacitor 8.3.0):** `WebViewLocalServer.java` (el server local custom de Capacitor — **no** `androidx.webkit.WebViewAssetLoader`) sirve los assets locales con `Cache-Control: no-cache` — que **permite ALMACENAR**, solo pide revalidar — y `Bridge.java` nunca llama `setCacheMode` (queda `LOAD_DEFAULT`), sin emitir `ETag`/`304` efectivos. El WebView guarda `index.html` (nombre **estable** entre releases; los chunks JS llevan hash) en su HTTP disk cache y lo reusa tras el update → el `index.html` viejo apunta a los chunks viejos → bundle viejo entero. Vive en la partición **"Caché"**, por eso "Eliminar caché" lo cura sin tocar "Datos" (IndexedDB/localStorage/Firestore). Upstream sin fix (ionic-team/capacitor discussion #7790, abierta; igual en v5/v6/v7).

**Fix (F60, vivo en `android/app/src/main/java/com/secondmind/app/MainActivity.java`):** purge-on-version-bump nativo, análogo a `version_check.rs` de Tauri. `onCreate` (tras `super.onCreate()`, con `getBridge()` ya no-null y la navegación inicial ya disparada) gatea `BuildConfig.VERSION_CODE > marca` en un SharedPreferences **propio** (`secondmind_native`/`lastPurgedVersionCode`, fuera del `app_webview/`); si sube → `getWebView().clearCache(true)` + `webView.post(webView::reload)` y persiste el versionCode con `.commit()`. La **primera APK con el fix ya autocura** (marca ausente → 0 < versionCode → purga). Detalle en SPEC-60.

Gotchas finos del fix:

- **`clearCache(true)`** toca solo el HTTP cache (disco+RAM); **no** IndexedDB/localStorage/Firestore (eso es `WebStorage.deleteAllData`/"Eliminar datos"). Scoped y seguro, a diferencia del `clear_all_browsing_data()` nuclear de Tauri.
- **`Bridge.reload()` ≠ `WebView.reload()`:** `Bridge.reload()` hace `post(loadUrl(appUrl))` (re-navega a la raíz); `WebView.reload()` re-valida la URL actual. Usar `webView.post(webView::reload)` serializa el reload **después** del `loadUrl` inicial síncrono, ya con el cache purgado. No re-dispara `onCreate` → sin loop.
- **Gate `>` (monotónico):** el versionCode de CI es `MAJOR*10000+MINOR*100+PATCH` (creciente) → `>` no purga en downgrade/rollback.
- **El deep-link/share-target sobrevive al reload:** el plugin emite con `retainUntilConsumed=true` → el evento nativo se re-emite al re-montar React tras el reload.
- **`buildFeatures { buildConfig = true }` obligatorio** en `app/build.gradle` para leer `BuildConfig.VERSION_CODE` (AGP 8.0+ lo desactiva por default → ver `deps-build.md`).
- **QA on-device:** en debug `versionCode=1` salvo `assembleDebug -PversionCode=N` → simular bumps con esa prop (Casos A–D en SPEC-60).
