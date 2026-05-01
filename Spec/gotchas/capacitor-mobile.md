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

## Splash: drawable XML simple `@color/splashBackground` (`#878bf9`)

Los PNGs generados usaban fondo gris default ignorando el flag. XML con color sólido es más simple y confiable.

## Edge-to-edge via `env(safe-area-inset-*)` en el `body`

Inocuo en web (env() = 0 sin `viewport-fit=cover`). Capacitor 8 aplica edge-to-edge automáticamente.

## Capacitor CLI `cap run android` falla en Windows por `gradlew` sin `.bat`

Workaround en `../../Docs/SETUP-WINDOWS.md`. `--legacy-peer-deps` también para `@capacitor/*` y `@capgo/*`.

## Auth branching order: `isCapacitor()` ANTES de `isTauri()` ANTES de web

Mutuamente excluyentes por plataforma; el orden importa porque web es el fallback implícito. Aplica a cualquier código cross-plataforma que deba bifurcar behavior (auth, capture window, share intent).

## Launcher cache Android no invalida ícono tras reinstalar APK

`adb install -r` deja el launcher con el ícono viejo cacheado. Workaround confiable: `adb uninstall com.secondmind.app` + `adb install` fresh. Relevante cuando se prueba rebranding o cambios visuales de la app.
