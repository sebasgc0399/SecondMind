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

`auth.currentUser.reload()` refresca el objeto User en memoria (actualiza `emailVerified`, `displayName`, claims actualizados desde el backend) pero NO emite un evento al listener `onAuthStateChanged`. Consecuencia: cualquier hook que dependa del state del consumer (`const { user } = useAuth()`) no se re-renderiza tras `reload()` — el banner de verification quedaría visible aunque `emailVerified` ya sea `true` server-side. Patrón canónico: exportar `refreshUser()` desde el hook canónico de auth que hace `await auth.currentUser?.reload()` + `setUser(auth.currentUser)` explícito para forzar re-render del consumer (single source of truth). Trigger preferido para llamarlo: `addEventListener('focus' + 'visibilitychange')` (user vuelve a la app tras click en email de verificación) en vez de polling cada 30s — el polling es waste si el user no abre el email tab y Firebase rate-limita metadata calls. Aplica a cualquier feature que necesite detectar cambios server-side del User sin requerir logout/login (verification, claims update post-rol asignado, displayName updated desde otro device). Patrón vivo en [src/hooks/useAuth.ts](../../src/hooks/useAuth.ts) (`refreshUser`) + [src/components/auth/EmailVerificationBanner.tsx](../../src/components/auth/EmailVerificationBanner.tsx) (listeners focus/visibilitychange).
