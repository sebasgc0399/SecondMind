# SPEC — SecondMind · Fase 5.2: Capacitor Mobile Android (Registro de implementación)

> Estado: **Completada** — Abril 2026
> Alcance: SecondMind como app Android nativa con Quick Capture, Google Sign-In nativo y Share Intent (recibir texto/URLs desde el menú "Compartir" de cualquier app directamente al inbox).
> Stack implementado: Capacitor 8.3.0, `@capacitor/android` 8.3.0, `@capgo/capacitor-social-login` 8.3.14, `@capgo/capacitor-share-target` 8.0.27, Android Studio (SDK 36, AVD Pixel 7 API 34), Gradle 8.14.3.
> Para gotchas operativos consolidados → `Spec/ESTADO-ACTUAL.md` sección "Capacitor Mobile (Fase 5.2)".

---

## Objetivo

El usuario instala SecondMind en su teléfono Android. Desde cualquier app (Chrome, Twitter, Reddit, YouTube), toca "Compartir" → selecciona SecondMind → la app abre con el Quick Capture modal pre-llenado con el contenido compartido. Enter guarda al inbox con `source: 'share-intent'`. Además tiene acceso completo a la app (dashboard, notas, tareas, grafo, hábitos) desde el celular con autenticación Google nativa.

---

## Prerequisitos instalados

- **Android Studio Otter 2025.2.1+** con SDK Platform 36 y emulador x86_64
- **AVD Pixel 7 API 34** (o device físico con `adb devices`)
- **JDK:** JBR 21 bundle de Android Studio (`C:\Program Files\Android\Android Studio\jbr`)
- **Debug keystore:** `~/.android/debug.keystore` generado con `keytool -genkey`, SHA-1 `96:B2:D4:BA:D4:31:B6:07:5F:D2:51:18:66:DD:BB:A7:FE:D5:14:D0`
- **Google Cloud Console — OAuth Client IDs (proyecto `secondmindv1`):**
  - Android: `39583209123-d32nb0beq27vpp2ealti1r26fle2ccc0.apps.googleusercontent.com` (validación SHA-1, no se usa en código)
  - Web: `39583209123-tq6tp1hhuj2o329h8frf84ph2irqppj2.apps.googleusercontent.com` (reusado como `webClientId` del plugin, compartido con Tauri)

---

## Features implementadas

### F1: Scaffold Capacitor 8 + Android project (commit dcbf66c)

- `npm install --legacy-peer-deps @capacitor/core @capacitor/cli @capacitor/app @capacitor/splash-screen @capacitor/android` (todos `^8`)
- `npx cap init "SecondMind" "com.secondmind.app" --web-dir dist`
- `capacitor.config.ts` con `server.androidScheme: 'https'` (obligatorio para Firebase Auth en WebView)
- `npx cap add android` genera `android/` (Gradle project con `minSdkVersion=24`, `compileSdkVersion=36`, `targetSdkVersion=36`, `density` ya en `configChanges`, `launchMode="singleTask"` por default en Cap 8.3)
- Scripts `cap:sync`, `cap:run`, `cap:build` en `package.json`
- `.gitignore` extendido con `android/app/build/`, `android/.gradle/`, `android/local.properties`, `*.apk`, `*.keystore`

### F2: Google Sign-In nativo (commit 920cf84)

- `@capgo/capacitor-social-login@^8.3.14` (sucesor de `@codetrix-studio/capacitor-google-auth` abandonado)
- `src/lib/capacitor.ts` — helper `isCapacitor()` usando `Capacitor.isNativePlatform()` del SDK
- `src/lib/capacitorAuth.ts`:
  - `initCapacitorAuth()` → `SocialLogin.initialize({ google: { webClientId } })` desde `VITE_GOOGLE_WEB_CLIENT_ID`
  - `signInWithCapacitor(auth)` → `SocialLogin.login({ provider: 'google' })` → narrow type check de `'idToken' in res.result` → `GoogleAuthProvider.credential(idToken)` → `signInWithCredential(auth, credential)`
- `src/hooks/useAuth.ts`: branch `if (isCapacitor()) → signInWithCapacitor(auth)` ANTES de `isTauri()`
- `src/main.tsx`: `void initCapacitorAuth()` al arranque (solo si `isCapacitor()`)
- `android/app/src/main/res/values/strings.xml`: `<string name="server_client_id">` con el Web Client ID (requerido por el plugin nativo)
- `android/app/src/main/java/com/secondmind/app/MainActivity.java`: `implements ModifiedMainActivityForSocialLoginPlugin` con `onActivityResult` forwarding a `SocialLoginPlugin.handleGoogleLoginIntent` (obligatorio — sin esto la promesa del login queda huérfana)
- `.env.local` (gitignored): `VITE_GOOGLE_WEB_CLIENT_ID` agregado

### F3: Share Intent (commit 4f89a1b)

- `@capgo/capacitor-share-target@^8.0.27` (único con soporte Cap 8 free; `send-intent` solo hasta Cap 7, capawesome es pago)
- `android/app/src/main/AndroidManifest.xml`: intent-filter `ACTION_SEND text/*` agregado al `<activity>` principal
- `src/hooks/useQuickCapture.ts`: `QuickCaptureContextValue` extendido con `initialContent: string` + `QuickCaptureOpenOptions { source?, sourceUrl? }`
- `src/components/capture/QuickCaptureProvider.tsx`:
  - `open(content?, options?)` setea `initialContent` + stashea `options` en `pendingMetaRef` (useRef, no state, para evitar re-renders)
  - `save(rawContent)` consume `pendingMetaRef` como defaults de `source`/`sourceUrl` (fallback `'quick-capture'`)
  - `close()` resetea ambos
- `src/components/capture/QuickCapture.tsx`: `QuickCaptureContent` recibe `initialContent` como prop, cursor al final del texto pre-llenado
- `src/hooks/useShareIntent.ts`:
  - Listener `CapacitorShareTarget.addListener('shareReceived', …)` con import dinámico
  - Si `event.texts[0]` matchea `^https?://` → `sourceUrl: text`, `content: title\ntext` (o solo `text` si no hay title distinto); else `content: text` sin `sourceUrl`
  - Cleanup con `handle.remove()` en unmount
- `src/app/layout.tsx`: `<ShareIntentMount />` mountado DENTRO del `QuickCaptureProvider` (guard de auth viene por el `if (!user) <Navigate to="/login">` del Layout — no necesita manejo de pending-content pre-auth en el hook)
- `src/components/dashboard/QuickCaptureButton.tsx`: `onClick={() => open()}` (wrap para no pasar MouseEvent como primer arg de `open`)

### F4: Edge-to-edge + ícono VectorDrawable + splash purple (commit a448d5d)

- `src/index.css`: `body` usa `padding-top: env(safe-area-inset-top)` + `padding-bottom: env(safe-area-inset-bottom)` — inocuo en web (env() evalúa a 0 sin `viewport-fit=cover`)
- `capacitor.config.ts`: plugin `SplashScreen` con `launchAutoHide: false` + `backgroundColor: '#878bf9'`
- `src/main.tsx`: `void SplashScreen.hide()` al arrancar (condicional `isCapacitor()`)
- `android/app/src/main/res/values/colors.xml` (nuevo): `colorPrimary`, `colorPrimaryDark`, `colorAccent`, `splashBackground` en `#878bf9`
- `android/app/src/main/res/drawable/splash.xml` (nuevo): layer-list con `@color/splashBackground` (XML simple; los PNGs generados por `@capacitor/assets` usaban gris default ignorando `--splashBackgroundColor`)
- **Ícono adaptive icon v26+:**
  - `android/app/src/main/res/drawable/ic_launcher_foreground.xml` (nuevo): VectorDrawable con los 21 `<path>` del `public/favicon.svg` convertidos a `android:pathData`, dentro de `<group android:translateX="207" android:translateY="202">` para normalizar el `viewBox="210 200 610 620"` del SVG
  - `android/app/src/main/res/values/ic_launcher_background.xml`: `@color/ic_launcher_background` = `#171617` (dark del logo original)
  - `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml` + `ic_launcher_round.xml`: `<adaptive-icon>` con background color + foreground drawable
- **PNG fallback Android <8:** `public/pwa-maskable-512x512.png` copiado a todas las `mipmap-*/ic_launcher.png` y `ic_launcher_round.png`
- PNGs de splash generados por `@capacitor/assets generate` (gris default) eliminados de todas las `drawable-{port,land}-{night-,}*/`

### F5: Build APK + docs (commit 89aac95)

- `cd android && ./gradlew.bat assembleDebug` → `android/app/build/outputs/apk/debug/app-debug.apk` (10.6MB)
- Instalado en AVD via `adb install -r app-debug.apk` + `adb shell am start -n com.secondmind.app/.MainActivity`
- Docs actualizados:
  - `Spec/ESTADO-ACTUAL.md`: Fase 5.2 en fases completadas + nueva sección "Capacitor Mobile (Fase 5.2)" con 12 gotchas/decisiones vigentes + 7 deps nuevas en tabla + siguiente fase reescrita
  - `CLAUDE.md`: scripts `cap:*` + bloque de gotchas Capacitor al final de la sección Gotchas + Fase 5.2 en lista
  - `README.md`: Fase 5.2 con 5 sub-features
  - `Spec/SPEC-fase-5.2-capacitor-mobile.md`: reescrito como registro (este archivo)

---

## Desviaciones del plan original

- **Íconos adaptativos: VectorDrawable en vez de `@capacitor/assets generate`.** El generador procesa los PNGs del PWA para adaptive icon format (separa fg/bg con insets de 16.7%) y distorsiona logos con diseño específico. Solución: copiar los `<path d="">` del `favicon.svg` a `<path android:pathData="">` (formato pathData compatible), envueltos en `<group android:translateX/Y>` para normalizar el viewBox del SVG. Match exacto con el PWA.
- **Splash screen con drawable XML simple en vez de PNGs con logo centrado.** `@capacitor/assets` genera splash PNGs con fondo gris default ignorando el flag `--splashBackgroundColor`. Un `<layer-list>` con `@color/splashBackground` fue más simple y confiable — solo flash de color sólido antes de que la app cargue.
- **`save()` signature: `pendingMetaRef` en vez de params extras.** El plan inicial era cambiar `save` a `(content, source?, sourceUrl?)`, pero eso requería actualizar todos los callers (QuickCapture.tsx pasa `trimmed` directo). Solución: mantener `save(content)` y stashear meta en `useRef` desde `open()`. API externa estable, lógica concentrada en el provider.
- **Sin retry post-auth tras cold-boot share intent.** El plan mencionaba "si `user == null`, esperar auth y reintentar". En la práctica, `ShareIntentMount` se monta dentro del `QuickCaptureProvider` que solo existe cuando el user ya está autenticado (Layout guard). Si el user recibe un share sin estar logueado, la app va al login — tras login el listener se monta y el siguiente share funciona. Edge case aceptable para MVP.
- **`npx cap run android` falla en Windows** por `gradlew` sin `.bat` (el CLI de Capacitor no resuelve `.bat` extensions en spawn). Workaround: `./gradlew.bat assembleDebug` + `adb install -r` + `adb shell am start` manual.

---

## Gotchas descubiertos durante el dev

- **Chrome Android envía títulos con HTML entities** (`&#34;` en vez de `"`) en el share intent. Decodeo via `DOMParser` o `textarea.innerHTML = title; title = textarea.innerText` es trivial. No implementado en la base — pulir si molesta en uso real.
- **`@capgo/capacitor-social-login` response es union type** `GoogleLoginResponseOnline | GoogleLoginResponseOffline`. El `idToken` solo existe en `Online`. Type narrowing con `'idToken' in res.result` antes de usarlo.
- **Launcher cache** de Android no invalida automáticamente el ícono tras reinstalar APK. `adb uninstall com.secondmind.app && adb install …` es la forma más confiable de refrescar el ícono visible en el drawer.
- **Primer build de Gradle descarga ~400 deps + distribución Gradle 8.14.3** (~3min). Incrementales después son 5-10s.

---

## Estructura de archivos creados/modificados

```
capacitor.config.ts                                  # appId, androidScheme https, SplashScreen plugin
android/                                             # Gradle project (cap add android)
├── app/
│   ├── src/main/
│   │   ├── AndroidManifest.xml                      # +intent-filter ACTION_SEND text/*
│   │   ├── java/com/secondmind/app/MainActivity.java# implements ModifiedMainActivityForSocialLoginPlugin
│   │   └── res/
│   │       ├── drawable/
│   │       │   ├── ic_launcher_foreground.xml       # VectorDrawable del favicon.svg
│   │       │   └── splash.xml                       # layer-list @color/splashBackground
│   │       ├── mipmap-anydpi-v26/
│   │       │   ├── ic_launcher.xml                  # adaptive-icon (bg color + fg drawable)
│   │       │   └── ic_launcher_round.xml            # idem
│   │       ├── mipmap-{ldpi,mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/
│   │       │   ├── ic_launcher.png                  # pwa-maskable-512x512.png (fallback <8)
│   │       │   └── ic_launcher_round.png            # idem
│   │       └── values/
│   │           ├── colors.xml                       # colorPrimary, splashBackground #878bf9
│   │           ├── ic_launcher_background.xml       # ic_launcher_background #171617
│   │           └── strings.xml                      # +server_client_id Web Client ID
│   ├── build.gradle
│   ├── capacitor.build.gradle
│   └── proguard-rules.pro
├── build.gradle
├── variables.gradle                                  # minSdk 24, compileSdk 36, targetSdk 36
├── gradle/wrapper/                                   # wrapper 8.14.3
└── gradlew, gradlew.bat, settings.gradle

src/
├── index.css                                         # body +env(safe-area-inset-top/bottom)
├── lib/
│   ├── capacitor.ts                                  # isCapacitor() helper
│   └── capacitorAuth.ts                              # initCapacitorAuth + signInWithCapacitor
├── hooks/
│   ├── useAuth.ts                                    # +branch isCapacitor antes de isTauri
│   ├── useQuickCapture.ts                            # +initialContent, +QuickCaptureOpenOptions
│   └── useShareIntent.ts                             # addListener('shareReceived', …) → open
├── components/
│   ├── capture/
│   │   ├── QuickCaptureProvider.tsx                  # open(content?, options?) + pendingMetaRef
│   │   └── QuickCapture.tsx                          # QuickCaptureContent acepta initialContent
│   └── dashboard/
│       └── QuickCaptureButton.tsx                    # onClick={() => open()} wrap
├── app/
│   └── layout.tsx                                    # <ShareIntentMount /> dentro del Provider
└── main.tsx                                          # isCapacitor() → initCapacitorAuth + SplashScreen.hide

.env.local                                            # +VITE_GOOGLE_WEB_CLIENT_ID (gitignored)
.gitignore                                            # +android build/cache/keystore/apk entries
package.json                                          # +6 deps Capacitor + scripts cap:*
```

---

## Checklist de completado (verificado)

- [x] `npx cap init` + `npx cap add android` generan proyecto Gradle válido
- [x] `./gradlew.bat assembleDebug` genera APK debug (10.6MB) en emulador Pixel 7 API 34
- [x] Login Google nativo: bottom sheet → selección cuenta → dashboard con datos reales del UID `gYPP7NIo5JanxIbPqMe6nC3SQfE3`
- [x] Share Intent via `adb shell am start -a android.intent.action.SEND` → modal pre-llenado con título + URL → Enter → item en inbox con `source: 'share-intent'`
- [x] Ícono SecondMind en launcher (match exacto con PWA — VectorDrawable desde SVG)
- [x] Splash purple `#878bf9` al abrir
- [x] Edge-to-edge: contenido no se esconde detrás de status/nav bar
- [x] `npm run dev` solo sigue funcionando en navegador (sin Capacitor)
- [x] `npm run build` OK (PWA SW regenerado, sin errores TS/ESLint)
- [x] `cd extension && npm run build` OK (bundle extension intacto)
- [x] Tauri branches de auth preservadas: el nuevo branch `isCapacitor()` va antes, Tauri y web intactos
- [x] Cloud Functions procesan items con `source: 'share-intent'` igual que otros sources
- [x] `.env.local` con `VITE_GOOGLE_WEB_CLIENT_ID` (no commiteado); OAuth Android Client creado en GCP con SHA-1 del debug keystore
- [x] Todo commiteado en `feat/f5.2-capacitor-mobile` (5 commits atómicos) y merged a `main` vía `--no-ff` (merge commit 703af34); pushed a `origin/main` + `origin/feat/f5.2-capacitor-mobile`

---

## Siguiente fase

Con Fase 5.2 completada, SecondMind tiene presencia en todas las plataformas del usuario:

- **Web** (PWA): secondmind.web.app, instalable, offline-capable
- **Desktop Windows** (Tauri): system tray, `Ctrl+Shift+Space` global, MSI + NSIS installers
- **Chrome Extension** (MV3): web clip con `firebase/auth/web-extension`
- **Android** (Capacitor): Google Sign-In nativo, Share Intent desde cualquier app

**Fuera de scope (posibles iteraciones futuras):**

- **iOS:** requiere macOS + Apple Developer ID ($99/año) + Share Extension (más complejo que Android intent filter)
- **Play Store publish:** requiere Google Play Developer ($25 one-time) + AAB firmado + privacy policy + screenshots. Debug APK para uso personal es suficiente
- **Release keystore Android:** SHA-1 de release distinto al debug → registrar otro Android OAuth Client ID en GCP
- **Push notifications:** no hay features que requieran push todavía
- **Offline-queue para share intent:** write usa TinyBase (reactive) pero el persister requiere conexión para sincronizar; si no hay red y el user fuerza-cierra la app antes del sync, el item se pierde. Aceptable para MVP
- **Deep links (`secondmind://note/123`):** no prioritario

**Candidatos para siguiente fase de producto:** polish UX (templates de notas, slash commands del editor, búsqueda semántica híbrida Orama + embeddings), distribución (code signing Windows, Play Store), o features nuevas.
