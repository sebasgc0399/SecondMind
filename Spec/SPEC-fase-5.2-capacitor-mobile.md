# SPEC — SecondMind · Fase 5.2: Capacitor Mobile (Android)

> Alcance: SecondMind como app Android nativa con Share Intent — capturar texto/URLs desde el menú "Compartir" de cualquier app directamente al inbox
> Dependencias: Fase 5 (PWA + Extension) completada, Fase 5.1 (Tauri) completada
> Estimado: 1-2 semanas solo dev
> Stack relevante: Capacitor 8, `@capgo/capacitor-share-target` v8, `@capgo/capacitor-social-login` v8, Android Studio

---

## Objetivo

El usuario instala SecondMind en su teléfono Android. Desde cualquier app (Chrome, Twitter, Reddit, YouTube), toca "Compartir" → selecciona SecondMind → la app abre con el Quick Capture modal pre-llenado con el contenido compartido. Un tap en "Guardar" y el item aparece en el inbox. Además tiene acceso completo a la app (dashboard, notas, tareas) desde el celular.

---

## Prerequisitos (acción manual antes de F1)

### P1: Android Studio + SDK

1. Descargar Android Studio desde https://developer.android.com/studio (versión Otter 2025.2.1+ requerida por Capacitor 8)
2. Instalar con el setup wizard default (incluye Android SDK, emulador, JDK)
3. Abrir Android Studio → SDK Manager → instalar **Android 14 (API 34)** SDK + **SDK 36 (compileSdk target)**
4. Crear un AVD (Android Virtual Device) para testing: Pixel 7, API 34, x86_64
5. Verificar: `adb devices` lista el emulador o un dispositivo físico conectado via USB
6. Verificar Node: `node --version` debe ser 22+ (el proyecto usa Node 24.12.0 — OK)

### P2: Google Cloud Console — OAuth Client ID Android

1. Ir a https://console.cloud.google.com/apis/credentials?project=secondmindv1
2. **Create Credentials → OAuth client ID**
3. Application type: **Android**
4. Name: `SecondMind Android`
5. Package name: `com.secondmind.app` (mismo identifier que Tauri)
6. SHA-1 certificate fingerprint del debug keystore:
   ```bash
   # Windows (Git Bash o terminal de Android Studio)
   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
   ```
   Copiar el SHA-1 (40 hex chars separados por `:`)
7. Click Create → anotar el **Client ID Android** (solo se usa para validación SHA-1)
8. También necesitarás el **Web Client ID** existente (tipo "Web application" ya en el proyecto) — este es el que `capacitor-social-login` usa como `webClientId` para generar el `idToken` que Firebase acepta

---

## Features

### F1: Scaffold Capacitor 8 + primera build Android

**Qué:** Inicializar Capacitor 8 en el proyecto, generar el proyecto Android, y verificar que la app se abre en el emulador con la pantalla de login visible (sin auth nativa todavía — solo la UI).

**Criterio de done:**
- [ ] `npx cap init` ejecutado con appId `com.secondmind.app` y appName `SecondMind`
- [ ] `npx cap add android` genera carpeta `android/` con proyecto Gradle válido
- [ ] `npm run build && npx cap sync` copia dist/ al proyecto Android sin errores
- [ ] `npx cap run android` abre la app en emulador/dispositivo mostrando la pantalla de login
- [ ] `variables.gradle` tiene `minSdkVersion = 24`, `compileSdkVersion = 36`, `targetSdkVersion = 36`
- [ ] `.gitignore` raíz incluye `android/app/build/`, `android/.gradle/`, `android/local.properties`
- [ ] `npm run dev` sigue funcionando en browser (sin Capacitor)
- [ ] PWA, Chrome Extension, y Tauri desktop siguen intactos

**Archivos a crear/modificar:**
- `capacitor.config.ts` — config: appId, appName, webDir `dist`, server.androidScheme `https`
- `package.json` — agregar deps `@capacitor/core@^8`, `@capacitor/cli@^8`, `@capacitor/app@^8`, `@capacitor/splash-screen@^8`; scripts `cap:sync`, `cap:run`, `cap:build`
- `.gitignore` — agregar entradas Android (build/, .gradle/, local.properties, *.apk, *.keystore)
- `android/` — generado por `cap add android` (no tocar manualmente en F1)

**Notas de implementación:**
- Capacitor 8 requiere Node 22+ (proyecto usa 24.12.0 ✅) y Android Studio Otter 2025.2.1+.
- `server.androidScheme: 'https'` es obligatorio para que Firebase Auth funcione (necesita origen HTTPS). Capacitor sirve desde `https://localhost` en el WebView.
- `npx cap sync` debe correrse después de cada `npm run build`. Agregar script compuesto: `"cap:sync": "npm run build && npx cap sync"`.
- Edge-to-edge es default en Cap 8 — el contenido se extiende detrás de status bar y navigation bar. Agregar `padding-top: env(safe-area-inset-top)` y `padding-bottom: env(safe-area-inset-bottom)` al layout raíz en CSS. El plugin `SystemBars` interno de Cap 8 maneja la apariencia automáticamente.
- `android/app/src/main/AndroidManifest.xml` — agregar `density` a `configChanges` del activity para evitar reloads en resize (requerido por Cap 8).
- El emulador x86_64 es ~10x más rápido que el ARM. Verificar que HAXM o Hypervisor está habilitado en BIOS.

---

### F2: Auth nativa Google Sign-In

**Qué:** Implementar Google Sign-In nativo en Android usando `@capgo/capacitor-social-login`. El flujo: botón "Sign in with Google" → bottom sheet nativo de Google → seleccionar cuenta → `signInWithCredential` de Firebase → dashboard.

**Criterio de done:**
- [ ] `@capgo/capacitor-social-login@^8` instalado y configurado
- [ ] `useAuth.ts` detecta Capacitor (`Capacitor.isNativePlatform()`) y usa sign-in nativo
- [ ] Click en "Sign in with Google" en Android muestra el bottom sheet nativo de selección de cuenta
- [ ] Tras seleccionar cuenta, el usuario ve el dashboard con sus datos de Firestore
- [ ] Sign-in sigue funcionando en web (PWA/Chrome) via `signInWithPopup`
- [ ] Sign-in sigue funcionando en Tauri via OAuth Desktop flow

**Archivos a crear/modificar:**
- `src/hooks/useAuth.ts` — agregar branch: `isCapacitor() → signInWithCapacitor(auth)`
- `src/lib/capacitorAuth.ts` (nuevo) — wrapper: `SocialLogin.login({ provider: 'google' })` → extraer `idToken` → `signInWithCredential(auth, GoogleAuthProvider.credential(idToken))`
- `src/lib/capacitor.ts` (nuevo) — helper `isCapacitor()` usando `Capacitor.isNativePlatform()`
- `capacitor.config.ts` — agregar config de `SocialLogin` plugin con `google.webClientId`
- `android/app/src/main/res/values/strings.xml` — agregar `server_client_id` con el Web Client ID
- `android/app/src/main/java/.../MainActivity.java` — implementar `ModifiedMainActivityForSocialLoginPlugin` interface (requerido por el plugin)

**Notas de implementación:**
- `@codetrix-studio/capacitor-google-auth` está abandonado (máx Cap 6). Su sucesor oficial es `@capgo/capacitor-social-login` — soporta Cap 8, API similar pero con namespace `SocialLogin`.
- `SocialLogin.initialize({ google: { webClientId: 'WEB_CLIENT_ID' } })` debe llamarse al inicio de la app (en `main.tsx` o similar). En web es no-op.
- El `webClientId` es el **Web Client ID** (no el Android Client ID). El Android Client ID solo se usa para validar el SHA-1 del keystore. Google usa el Web Client ID para generar el `idToken` que Firebase acepta.
- El flujo es: `SocialLogin.login({ provider: 'google', options: { scopes: ['email', 'profile'] } })` → devuelve `{ result: { idToken } }` → `GoogleAuthProvider.credential(idToken)` → `signInWithCredential(auth, credential)`.
- `MainActivity.java` necesita implementar `ModifiedMainActivityForSocialLoginPlugin` — es un requisito del plugin para interceptar el activity result del Google Sign-In.

---

### F3: Share Intent — recibir contenido compartido

**Qué:** Registrar SecondMind como target del Share sheet de Android. Cuando el usuario comparte texto o URL desde otra app, SecondMind se abre y el Quick Capture modal aparece automáticamente con el contenido pre-llenado. Enter guarda al inbox con `source: 'share-intent'`.

**Criterio de done:**
- [ ] `@capgo/capacitor-share-target@^8` instalado y configurado
- [ ] `AndroidManifest.xml` tiene intent filter para `text/*` en MainActivity
- [ ] Compartir texto desde Chrome → SecondMind aparece en el share sheet
- [ ] Al seleccionar SecondMind, la app se abre y Quick Capture modal aparece con el texto/URL
- [ ] Enter guarda al inbox con `source: 'share-intent'` y `sourceUrl` si es URL
- [ ] Item aparece en la vista de inbox con el source correcto
- [ ] Si la app no estaba abierta (cold boot), el share intent se procesa después del auth
- [ ] Cloud Functions procesan el item normalmente (processInboxItem)

**Archivos a crear/modificar:**
- `src/hooks/useShareIntent.ts` (nuevo) — hook que escucha `CapacitorShareTarget.addListener('shareReceived', ...)`, extrae contenido, abre Quick Capture modal programáticamente
- `src/components/capture/QuickCaptureProvider.tsx` — exponer función `openWithContent(text: string)` para que el share intent pueda pre-llenar y abrir el modal
- `android/app/src/main/AndroidManifest.xml` — agregar `<intent-filter>` para `android.intent.action.SEND` + `text/*` en el `<activity>` principal con `android:launchMode="singleTask"`
- `src/app/layout.tsx` o `src/main.tsx` — invocar `useShareIntent()` para que corra en cada mount

**Notas de implementación:**
- `@capgo/capacitor-share-target` v8 — soporta Capacitor 8 explícitamente. API: `addListener('shareReceived', callback)` con evento `{ title, texts, files }`.
- Los intent filters van en el MainActivity directamente (no actividad separada como `send-intent`). El plugin maneja el routing internamente. `launchMode="singleTask"` previene múltiples instancias.
- **Cold boot vs warm resume:** si la app no estaba corriendo, el share intent llega durante el boot. El hook debe esperar a que el auth esté listo (`user != null`) antes de intentar guardar. Si `user == null`, mostrar el login — tras login, volver a chequear.
- **URL compartida vs texto plano:** `event.texts[0]` contiene el texto compartido. Si empieza con `http`, tratarlo como `sourceUrl` y poner `rawContent` como `event.title || event.texts[0]`. Si no, es texto plano → `rawContent: event.texts[0]`.
- **Patrón de escritura:** mismo que extension y Tauri capture — `setDoc` directo a Firestore, no via TinyBase. Ver 01-arquitectura D21.

---

### F4: Edge-to-edge + app branding — icono, splash, status bar

**Qué:** Ajustar CSS para edge-to-edge de Capacitor 8, reemplazar el ícono default con el brain-circuit de SecondMind, configurar splash screen, y ajustar el color de la status bar.

**Criterio de done:**
- [ ] Contenido no se esconde detrás de la status bar ni la navigation bar (`env(safe-area-inset-*)` aplicado)
- [ ] Ícono de la app es el brain-circuit purple (no el default de Capacitor)
- [ ] Splash screen muestra el logo SecondMind centrado sobre fondo purple
- [ ] Status bar es purple `#7b2ad1` o transparent con íconos blancos
- [ ] El nombre "SecondMind" aparece debajo del ícono en el launcher

**Archivos a crear/modificar:**
- `src/index.css` — agregar `padding-top: env(safe-area-inset-top)` y `padding-bottom: env(safe-area-inset-bottom)` al body o layout wrapper, condicionado a plataforma Capacitor si es necesario
- `android/app/src/main/res/mipmap-*` — íconos generados con `npx @capacitor/assets generate --android` desde `public/pwa-512x512.png`
- `android/app/src/main/res/values/styles.xml` — splash theme con `windowBackground`
- `android/app/src/main/res/drawable/splash.xml` — layer-list con background purple + logo
- `capacitor.config.ts` — agregar config de `SplashScreen` (autoHide delay, backgroundColor `#7b2ad1`)
- `src/main.tsx` — configurar `SystemBars` si se necesita control granular (Cap 8 lo maneja automáticamente en la mayoría de casos)

**Notas de implementación:**
- Cap 8 eliminó `adjustMarginsForEdgeToEdge` — ahora es CSS puro con `env(safe-area-inset-*)`. Si el layout ya usa flexbox/grid, agregar padding al container raíz suele ser suficiente.
- `npx @capacitor/assets generate --android` genera mipmap en todas las densidades (mdpi→xxxhdpi) desde un ícono fuente. Usar `public/pwa-512x512.png`.
- Para el splash, Capacitor 8 usa el tema XML nativo (Core Splash Screen API). El `styles.xml` define el `Theme.SplashScreen` con `windowBackground` apuntando a `@drawable/splash`.
- `@capacitor/splash-screen` permite controlar cuándo ocultar el splash desde JS (ej: después del auth). `SplashScreen.hide()` una vez que el router ha montado.

---

### F5: Build APK + documentación

**Qué:** Generar debug APK para instalación directa y documentar el proceso. Opcionalmente, configurar keystore de release para futuro.

**Criterio de done:**
- [ ] `npx cap build android` o `cd android && ./gradlew assembleDebug` genera debug APK
- [ ] APK instalable en dispositivo físico via `adb install` o transferencia directa
- [ ] La app instalada funciona: login → dashboard → share intent → inbox
- [ ] Documentación del proceso en este SPEC (convertido a registro)
- [ ] `01-arquitectura` y `03-convenciones` actualizados con Fase 5.2

**Archivos a crear/modificar:**
- `SPEC-fase-5.2-capacitor-mobile.md` — convertir de plan a registro
- `01-arquitectura-hibrida-progresiva.md` — agregar Capacitor a Core stack, Fase 5.2 ✅, decisiones D24+, gotchas 45+
- `03-convenciones-y-patrones.md` — agregar `android/` a estructura, scripts cap, helper `isCapacitor()`

**Notas de implementación — release signing (opcional):**
- Generar keystore: `keytool -genkey -v -keystore secondmind-release.keystore -alias secondmind -keyalg RSA -keysize 2048 -validity 10000`
- Guardar keystore fuera del repo (gitignored). Configurar en `android/app/build.gradle` via `signingConfigs`.
- Build release: `cd android && ./gradlew assembleRelease` — genera APK firmado.
- SHA-1 del release keystore es distinto al debug — hay que crear otro OAuth Client ID Android en Google Cloud Console con el SHA-1 de release.
- Para Play Store: AAB en vez de APK. `./gradlew bundleRelease`. Requiere cuenta Google Play Developer ($25 one-time).

---

## Orden de implementación

1. **P1 + P2** → prerequisitos manuales: instalar Android Studio + crear OAuth Client ID Android
2. **F1** → scaffold Capacitor 8 + primera build. Sin esto no se puede probar nada.
3. **F2** → auth nativa. Sin auth no se puede escribir a Firestore.
4. **F3** → share intent. Depende de F2 (necesita user autenticado para escribir al inbox).
5. **F4** → edge-to-edge + branding. Mejor hacerlo con la app ya funcional para verificar visualmente.
6. **F5** → build final + docs. Último porque documenta lo implementado.

Rama única: `feat/f5.2-capacitor-mobile`. Commits atómicos por feature.

---

## Estructura de archivos

```
# Archivos nuevos/modificados en esta fase

capacitor.config.ts              # appId, appName, webDir, plugins config (SocialLogin, SplashScreen)
android/                         # Generado por cap add android (Gradle project)
├── app/
│   ├── src/main/
│   │   ├── AndroidManifest.xml  # Modificado: +intent filters text/*, +density en configChanges
│   │   ├── java/.../
│   │   │   └── MainActivity.java # Modificado: +implements ModifiedMainActivityForSocialLoginPlugin
│   │   ├── res/
│   │   │   ├── mipmap-*/        # Íconos generados con @capacitor/assets
│   │   │   ├── values/
│   │   │   │   ├── strings.xml  # +server_client_id
│   │   │   │   └── styles.xml   # +Theme.SplashScreen
│   │   │   └── drawable/
│   │   │       └── splash.xml   # Splash layer-list
│   │   └── assets/public/       # Copia de dist/ (generado por cap sync)
│   └── build.gradle             # (opcional) signing config para release
└── variables.gradle             # minSdk 24, compileSdk 36, targetSdk 36

src/
├── index.css                    # Modificado: +env(safe-area-inset-*) para edge-to-edge
├── lib/
│   ├── capacitor.ts             # isCapacitor() helper
│   └── capacitorAuth.ts         # signInWithCapacitor: SocialLogin → signInWithCredential
├── hooks/
│   ├── useAuth.ts               # Modificado: +branch isCapacitor → signInWithCapacitor
│   └── useShareIntent.ts        # Listener shareReceived → open Quick Capture
├── components/
│   └── capture/
│       └── QuickCaptureProvider.tsx  # Modificado: +openWithContent(text)
└── main.tsx                     # Modificado: +SocialLogin.initialize(), +SplashScreen.hide()
```

---

## Definiciones técnicas

### D1: Capacitor 8 sobre Capacitor 7
- **Opciones:** Capacitor 7.6.x, Capacitor 8.3.x
- **Decisión:** Capacitor 8
- **Razón:** El proyecto usa Node 24.12.0 (Cap 8 requiere 22+). Android Studio se instala fresh (viene Otter+). Cap 8 es la versión activa con plugins actualizados primero. Edge-to-edge es el estándar Android moderno. Cloud Functions usan Node 22 en runtime, alineado con Cap 8.

### D2: `@capgo/capacitor-share-target` sobre `send-intent`
- **Opciones:** `send-intent` v7, `@capgo/capacitor-share-target` v8, `@capawesome-team/capacitor-share-target` (premium)
- **Decisión:** `@capgo/capacitor-share-target` v8
- **Razón:** Soporte explícito Cap 8 (v8.x para Cap 8, activamente mantenido). `send-intent` v7 solo soporta hasta Cap 7. Capawesome es premium/pago. API de Capgo es limpia: `addListener('shareReceived', handler)` con `{ title, texts, files }`.

### D3: `@capgo/capacitor-social-login` sobre `@codetrix-studio/capacitor-google-auth`
- **Opciones:** `@codetrix-studio/capacitor-google-auth` v3.x, `@capgo/capacitor-social-login` v8
- **Decisión:** `@capgo/capacitor-social-login`
- **Razón:** `@codetrix-studio` está abandonado — marcado como "virtually archived", máximo Cap 6, sin mantenedor activo. `@capgo/capacitor-social-login` es su sucesor oficial con soporte Cap 8, usa Credential Manager en Android 14+, y devuelve `idToken` compatible con `signInWithCredential` de Firebase.

### D4: Quick Capture modal reutilizado para share intent (no ruta separada)
- **Opciones:** Ruta `/share` separada (como `/capture` de Tauri), reusar Quick Capture modal existente
- **Decisión:** Reusar Quick Capture modal
- **Razón:** A diferencia de Tauri (donde `/capture` es una ventana separada que no hidrata TinyBase), en Capacitor la app completa ya está cargada. Pre-llenar el modal existente es más simple y reutiliza código. No justifica una ruta nueva.

### D5: Solo Android en esta fase
- **Opciones:** Android + iOS, solo Android
- **Decisión:** Solo Android
- **Razón:** iOS requiere Apple Developer ID ($99/año) + Xcode (solo macOS). El usuario está en Windows. Share Extension de iOS es significativamente más complejo que Android Share Intent.

---

## Verificación end-to-end

### Por feature (durante desarrollo)

- **F1:** `npx cap run android` abre la app en emulador, se ve la pantalla de login. `npm run dev` sigue funcionando en browser.
- **F2:** Click "Sign in with Google" → bottom sheet nativo → seleccionar cuenta → dashboard con datos. Verificar que web y Tauri auth no se rompieron.
- **F3:** Abrir Chrome en el emulador → navegar a cualquier página → menú Share → SecondMind aparece → seleccionar → app abre con Quick Capture pre-llenado → Enter guarda → verificar en inbox que el item tiene `source: 'share-intent'`. Probar con cold boot (app cerrada) y warm resume (app en background).
- **F4:** Contenido no se esconde detrás de status/nav bar. Ícono brain-circuit en launcher y recents. Splash screen purple al abrir.
- **F5:** APK instalable en dispositivo físico. Todo el flujo funciona fuera de desarrollo.

### Regresión (features previas no se rompen)

- `npm run dev` solo sigue funcionando en Chrome
- PWA install prompt aparece en Chrome
- `Alt+N` local sigue abriendo el modal
- Chrome Extension sigue capturando a inbox
- `npm run tauri:dev` sigue funcionando
- `Ctrl+Shift+Space` global sigue funcionando en Tauri
- `npm run build && npm run deploy` a Firebase Hosting funciona
- Cloud Functions procesan items de `share-intent` igual que otros sources

---

## Checklist de completado

- [ ] Android Studio instalado con SDK 36 y emulador funcional
- [ ] `npx cap run android` abre SecondMind nativa en Android
- [ ] Google Sign-In nativo funciona via `@capgo/capacitor-social-login`; web y Tauri auth intactos
- [ ] Share Intent desde Chrome/cualquier app → Quick Capture → inbox funcional
- [ ] Edge-to-edge correcto (contenido no se esconde detrás de barras del sistema)
- [ ] Ícono brain-circuit, splash purple, status bar branded
- [ ] Debug APK generado e instalable en dispositivo físico
- [ ] `npm run dev` y `npm run deploy` siguen funcionando (web intacta)
- [ ] PWA + Chrome Extension + Tauri Desktop intactos
- [ ] Docs actualizados (01-arquitectura, 03-convenciones, este SPEC como registro)
- [ ] Todo commited en `feat/f5.2-capacitor-mobile` y merged a main

---

## Fuera de scope (documentar en ESTADO-ACTUAL)

- **iOS:** requiere macOS + Apple Developer ID ($99/año) + Share Extension (más complejo que Android intent filter)
- **Play Store publish:** requiere Google Play Developer account ($25 one-time) + AAB signing + privacy policy + screenshots. Debug APK para uso personal es suficiente.
- **Push notifications:** no hay features que requieran push todavía.
- **Offline write en share intent:** el write usa Firestore directo (no TinyBase). Sin red, el share intent no guarda. Aceptable para MVP — si se necesita offline, encolar en localStorage.
- **Deep links:** abrir SecondMind desde un link `secondmind://note/123`. No prioritario.

---

## Siguiente fase

Con Fase 5.2 completada, SecondMind tiene presencia en todas las plataformas del usuario: web (PWA), desktop (Tauri + Chrome Extension), y mobile (Capacitor Android). La siguiente iteración podría ser polish UX, features nuevas (templates, búsqueda semántica híbrida, slash commands en editor), o mejoras de distribución (code signing Windows, Play Store, auto-updater).
