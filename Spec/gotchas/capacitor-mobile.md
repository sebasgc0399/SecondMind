# Capacitor Mobile

> Canon de gotchas del dominio. Índice ligero en `../ESTADO-ACTUAL.md` § "Gotchas por dominio (índice)".
> Cada gotcha vive como `## <título>`. El slug del título es el anchor estable referenciado desde el índice.

## `android/` commiteado al repo

Incluye `app/src/`, `variables.gradle`, Gradle wrapper. Gitignored: `android/app/build/`, `*.apk`, `*.keystore`. Primera build requiere Android Studio + SDK 36 + `ANDROID_HOME` + `JAVA_HOME`.

## `server.androidScheme: 'https'` obligatorio

En `capacitor.config.ts`. Sin esto, Firebase Auth rechaza el WebView por origen HTTP.

## Google Sign-In nativo: patrón universal

`SocialLogin.login({ provider: 'google' }) → idToken → GoogleAuthProvider.credential(idToken) → signInWithCredential(auth, credential)`. Mismo patrón que Tauri y Chrome Extension — solo cambia cómo se obtiene el idToken.

## Web Client ID compartido para todas las plataformas

Android Client ID de GCP solo valida SHA-1 del keystore; no se usa en código. `VITE_GOOGLE_WEB_CLIENT_ID` en `.env.local` + `<string name="server_client_id">` en `strings.xml`.

## `MainActivity.java implements ModifiedMainActivityForSocialLoginPlugin`

Con `onActivityResult` forwarding a `SocialLoginPlugin.handleGoogleLoginIntent`. Obligatorio por design del plugin Capgo — sin esto la promesa queda huérfana.

## Share Intent reusa QuickCaptureProvider

A diferencia de Tauri `/capture` (ventana efímera), en Capacitor la app completa ya está cargada con el provider montado. `useShareIntent` llama `quickCapture.open(content, { source, sourceUrl })` → meta stasheado en `pendingMetaRef` (ref, no state) → `save()` lo consume como defaults. Callers previos no cambian (params opcionales).

## Ícono Android: VectorDrawable extraído del `public/favicon.svg`

`@capacitor/assets generate` distorsiona íconos. Solución: copiar `<path d="">` del SVG a `<path android:pathData="">` del VectorDrawable, `<group android:translateX/Y>` para normalizar viewBox. Background `#171617`. PNG maskable en mipmap-\* como fallback para Android <8.

## System splash adaptativo via SplashScreen API attrs (post-F40)

`Theme.SplashScreen` parent en Android 12+ **ignora `android:background` legacy** — necesita atributos del SplashScreen API: `windowSplashScreenBackground` (color de fondo), `windowSplashScreenAnimatedIcon` (vector drawable centrado) y `postSplashScreenTheme` (handoff al theme normal). Light/dark via `values/colors.xml` + `values-night/colors.xml` con `<color name="splashBackground">`. Pre-F40 el theme tenía `android:background="@drawable/splash"` (legacy color violeta) que el sistema simplemente descartaba — el resultado visual era el icon del launcher genérico de Android sobre color por default.

## Android 12+ SplashScreen API limita branded splash a icon centrado sobre color

No permite layout libre (logo + texto + extras). Para un splash branded estilo Anthropic/Linear (logo + nombre de la app), entregar el "branded splash completo" via pantalla React post-bootstrap (`AppBootSplash` en F40), NO via system splash. El system splash solo cubre el primer frame con icon centrado; el handoff a la pantalla React debe ser seamless (icon mismo tamaño y posición entre los dos frames). El cerebro `windowSplashScreenAnimatedIcon` se renderiza al canvas 288dp cuando NO se especifica `windowSplashScreenIconBackgroundColor` (sin masking circular adicional); calibrar el tamaño del icon en la pantalla React empíricamente — la teoría del masking circular `192dp × ~0.6` underestima el tamaño visible en algunos OEMs (Samsung).

## `useHideSplashWhenReady` dispara al primer mount, NO al fin del bootstrap

Si el hook esperara a `!isLoading + stores hidratados` para llamar `SplashScreen.hide()`, el system splash taparía la pantalla React branded durante TODO el bootstrap → el handoff entre system splash y `AppBootSplash` se vería como un solo frame imperceptible al usuario. Llamar `hideSplash()` en `useEffect(() => { void hideSplash(); }, [])` del Layout asegura que el system splash desaparece apenas React puede mostrar algo (incluso si `isLoading=true`, el AppBootSplash ya está rendereado). El timeout 5s en `main.tsx` cubre el caso de crash pre-mount.

## `@capacitor/assets generate` sobrescribe `mipmap-anydpi-v26/ic_launcher{,_round}.xml`

La tool reemplaza los XMLs adaptive icon (vector drawable nítido en cualquier densidad) por XMLs apuntando a PNGs rasterizados — degradación visual en API 26+ (caso mayoritario). Recovery proactivo: tras correr `npx capacitor-assets generate --android ...`, restaurar inmediatamente con `git checkout HEAD -- android/app/src/main/res/mipmap-anydpi-v26/`. Los PNGs nuevos quedan inertes para API 26+ y solo se usan en API <26 como fallback. Mismo patrón para `Spec/gotchas/capacitor-mobile.md` § "Ícono Android: VectorDrawable extraído del `public/favicon.svg`".

## Samsung multi-user: `adb install` default va a user 150 (Secure Folder), no user 0

En Samsung con Secure Folder o DUAL_APP activos, `adb install -r app-debug.apk` instala en el user 150 (Secure Folder) por default. La app NO aparece en el launcher principal y `adb shell am start -n com.secondmind.app/.MainActivity` falla silenciosamente. Workaround: pasar `--user 0` explícito tanto en install como en start: `adb install -r --user 0 app-debug.apk` y `adb shell am start --user 0 -n com.secondmind.app/.MainActivity`. Aplica a cualquier sesión de QA en device Samsung.

## Edge-to-edge via `env(safe-area-inset-*)` en el `body`

Inocuo en web (env() = 0 sin `viewport-fit=cover`). Capacitor 8 aplica edge-to-edge automáticamente.

## Capacitor CLI `cap run android` falla en Windows por `gradlew` sin `.bat`

Workaround en `../../Docs/SETUP-WINDOWS.md`. `--legacy-peer-deps` también para `@capacitor/*` y `@capgo/*`.

## Auth branching order: `isCapacitor()` ANTES de `isTauri()` ANTES de web

Mutuamente excluyentes por plataforma; el orden importa porque web es el fallback implícito. Aplica a cualquier código cross-plataforma que deba bifurcar behavior (auth, capture window, share intent).

## Launcher cache Android no invalida ícono tras reinstalar APK

`adb install -r` deja el launcher con el ícono viejo cacheado. Workaround confiable: `adb uninstall com.secondmind.app` + `adb install` fresh. Relevante cuando se prueba rebranding o cambios visuales de la app.

## Email Enumeration Protection altera Firebase Auth behavior (post-F47)

Cuando EEP está habilitada en Firebase Console (default en proyectos nuevos), Firebase Auth altera silenciosamente varios comportamientos: `fetchSignInMethodsForEmail(email)` retorna array vacío SIEMPRE (independiente de si el email está registrado), los errores `auth/wrong-password` y `auth/user-not-found` colapsan en un único `auth/invalid-credential` genérico al hacer `signInWithEmailAndPassword`, y `auth/email-already-in-use` queda como única señal cross-provider sin posibilidad de identificar qué provider tiene la cuenta. Trade-off de seguridad anti-enumeration: cualquier feature de auth que asuma poder distinguir "user no existe" vs "password incorrecto" o detectar provider del email DEBE preguntar primero si EEP está activa antes de diseñar UX. La alternativa "desactivar EEP para mensajes UX más precisos" es downgrade de seguridad por marginal UX gain — no se hace. Patrón canónico: mapper de errores `src/lib/authErrors.ts` mapea `wrong-password` + `invalid-credential` al mismo string ("Email o contraseña incorrectos"), y `email-already-in-use` + `account-exists-with-different-credential` a string genérico unificado ("Ya existe una cuenta con este email. Probá iniciar sesión o usar Google."). Tests unit en [src/lib/authErrors.test.ts](../../src/lib/authErrors.test.ts) (14 casos Vitest) congelan el contrato.

## `user.reload()` NO dispara `onAuthStateChanged` → `refreshUser()` pattern (post-F47)

`auth.currentUser.reload()` refresca el objeto User en memoria (actualiza `emailVerified`, `displayName`, claims desde el backend) pero tiene DOS limitaciones que muerden juntas (la #1 descubierta verificando onboarding F49):

**(1) NO refresca el ID token.** `reload()` actualiza la propiedad `emailVerified` del objeto User, pero el ID token conserva su claim `email_verified` STALE hasta el refresh natural (~1h) o re-login. Las security rules leen `request.auth.token.email_verified`, NO la propiedad del cliente → un usuario recién verificado queda con TODA lectura/escritura Firestore DENEGADA (preferences, apiKeys, datos) pese a `user.emailVerified === true` en el cliente; la app se ve "vacía"/rota hasta re-login. Fix: tras `reload()`, si quedó verificado, `await auth.currentUser.getIdToken(true)` fuerza un token nuevo con el claim actualizado. Gate sobre `emailVerified` para no refrescar el token en cada focus mientras sigue pendiente.

**(2) NO dispara `onAuthStateChanged`, y `setUser(auth.currentUser)` NO re-renderiza por ref-igual.** `reload()` no emite evento al listener `onAuthStateChanged`; y `setUser(auth.currentUser)` recibe el MISMO ref del objeto User (Firebase lo muta in-place) → React hace bail-out (`Object.is`) → los consumers que observan `user.emailVerified` (banner de verification, redirect de `/verify-email`) NO re-renderizan, dejando al usuario verificado atrapado. Por eso `refreshUser()` NO puede confiar en forzar el re-render vía `setUser`: **devuelve el `emailVerified` actualizado** y los callers actúan sobre ese boolean (`if (await refreshUser()) navigate('/')`), decoplados del bail.

Trigger preferido para llamar `refreshUser()`: `addEventListener('focus' + 'visibilitychange')` (user vuelve tras click en el email) en vez de polling 30s — el polling es waste si el user no abre el email tab y Firebase rate-limita metadata calls. Aplica a cualquier feature que detecte cambios server-side del User sin logout/login (verification, claims post-rol, displayName cross-device) Y que dependa de esos cambios para gatear UI o acceso Firestore. Patrón vivo en [src/hooks/useAuth.ts](../../src/hooks/useAuth.ts) (`refreshUser` retorna boolean + `getIdToken(true)`), [src/app/verify-email/page.tsx](../../src/app/verify-email/page.tsx) (navega sobre el retorno) y [src/components/auth/EmailVerificationBanner.tsx](../../src/components/auth/EmailVerificationBanner.tsx) (listeners focus/visibilitychange).

## Verificar cambios de AndroidManifest en el manifest MERGEADO de release, no en el fuente

Android mergea el `AndroidManifest.xml` de la app con los de los plugins/librerías de Capacitor en **build-time**. Lo que va al APK es el manifest **MERGEADO**, no el fuente (`android/app/src/main/AndroidManifest.xml`) — un atributo del fuente puede ser pisado por el manifest de un plugin. Dos falsos verdes al verificar un cambio de manifest:

- **Leer el manifest FUENTE y asumir el mergeado.** Hay que leer el `packaged_manifest` de **RELEASE** (el XML que aapt2 empaqueta en el APK que va a users): `android/app/build/intermediates/packaged_manifests/release/.../AndroidManifest.xml`.
- **Correr solo `./gradlew :app:processDebugManifest` deja los manifests de RELEASE stale** → verificás un debug fresco mientras el release que va al APK no se regeneró (sigue mostrando el valor viejo). Hay que correr `:app:processReleaseManifestForPackage` (o limpiar antes) y leer el de release.

**Cómo verificar bien:** correr el merge de release (`./gradlew :app:processReleaseManifestForPackage`, con `ANDROID_HOME`/`JAVA_HOME` en env), leer el `packaged_manifest` de release y confirmar el atributo ahí. Doble check opcional: `aapt dump xmltree <apk> AndroidManifest.xml | grep <attr>`.

**Patrón relacionado — forzar tu valor sobre el merge de plugins:** `android:<attr>="..."` + `tools:replace="android:<attr>"` (con `xmlns:tools="http://schemas.android.com/tools"` declarado en `<manifest>`). El merge emite el warning `<attr> was tagged ... to replace ... but no other declaration present` cuando ningún plugin lo re-declara → el `tools:replace` es guard preventivo, no fix de un conflicto actual. Caso real: `allowBackup="false"` (commit `9562fdc`).

## `@capacitor/browser` `windowName` es web-only; en Android abre un Chrome Custom Tab (post-SPEC-64)

`Browser.open({ url, windowName })` de `@capacitor/browser`: el `windowName` aplica **solo en web** (target de `window.open`, default `_blank`). En **Android lo ignora** y abre siempre un **Chrome Custom Tab** — superficie respaldada por Chrome, con la sesión/cookies del navegador del sistema, NO el WebView de la app. SPEC-64 F5 lo usa para la entrada de borrado nativa: el flujo inline de reauth (`reauthenticateWithPopup`) es web-only y colgaría dentro del WebView, así que en Capacitor el botón abre la danger zone web (`app.getsecondmind.co/settings#delete-account`) en el Custom Tab, donde el reauth de Firebase sí funciona (comparte la sesión de Chrome). Se pasa `windowName: '_system'` por contrato (sin efecto en nativo). Patrón general: cualquier flujo nativo que necesite un reauth/OAuth **web** debe abrirse en un Custom Tab, NO en el WebView de la app (que no comparte la sesión ni puede correr el popup). Vivo en [src/lib/account.ts](../../src/lib/account.ts) (`openWebDeletion`) + [DeleteAccountSection.tsx](../../src/components/settings/DeleteAccountSection.tsx).

## Smoke de un plugin Capacitor en el APK real vía CDP, sin pasar el login (post-SPEC-64)

Para verificar el comportamiento nativo de un plugin en el **APK real** (no jsdom) cuando el código a probar vive detrás del login: los globals de Capacitor (`Capacitor.isNativePlatform()`, `Capacitor.getPlatform()`, `Capacitor.Plugins.<Plugin>`) están disponibles en CUALQUIER pantalla del WebView, incluso `/login` → se prueba el mecanismo sin autenticar. Procedimiento (Windows; `adb`/`emulator` NO están en PATH — usar la ruta del SDK `C:/Users/sebas/AppData/Local/Android/Sdk`):

1. `emulator -avd <AVD> -no-window -no-audio -gpu swiftshader_indirect`; esperar `adb shell getprop sys.boot_completed`==1.
2. `adb install -r app-debug.apk` + `adb shell am start -n com.secondmind.app/.MainActivity`.
3. Socket DevTools del WebView: `adb shell cat /proc/net/unix | grep webview_devtools_remote` → `webview_devtools_remote_<pid>`.
4. `adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>`.
5. `fetch('http://localhost:9222/json/list')` → `page.webSocketDebuggerUrl`.
6. Cliente CDP **puro** con Node ≥22 (`WebSocket` global, sin instalar `ws`/`playwright`): `Runtime.enable` + `Runtime.evaluate({ expression, awaitPromise, returnByValue })`.
7. Verificar el efecto nativo con `adb shell dumpsys activity activities | grep topResumedActivity`.

Los plugins nativos se exponen en `Capacitor.Plugins.<Name>` apenas inicia el bridge, SIN que el bundle haya importado el wrapper JS → llamar `Capacitor.Plugins.Browser.open(...)` directo desde la consola CDP replica exactamente lo que hace el código de la app. SPEC-64 F5 lo usó para confirmar que `Browser.open` mueve el `topResumedActivity` de `com.secondmind.app/.MainActivity` a `com.android.chrome/...customtabs.CustomTabActivity` (= Custom Tab real abierto a la URL). Reusable para cualquier verificación nativa headless de un plugin gated por auth.
