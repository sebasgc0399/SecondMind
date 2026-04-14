# SPEC — SecondMind · Fase 5.2: Capacitor Mobile (Android)

> Alcance: SecondMind como app Android nativa con Share Intent — capturar texto/URLs desde el menú "Compartir" de cualquier app directamente al inbox
> Dependencias: Fase 5 (PWA + Extension) completada, Fase 5.1 (Tauri) completada
> Estimado: 1-2 semanas solo dev
> Stack relevante: Capacitor 7, `send-intent` v7, `@codetrix-studio/capacitor-google-auth`, Android Studio, Gradle

---

## Objetivo

El usuario instala SecondMind en su teléfono Android. Desde cualquier app (Chrome, Twitter, Reddit, YouTube), toca "Compartir" → selecciona SecondMind → la app abre con el Quick Capture modal pre-llenado con el contenido compartido. Un tap en "Guardar" y el item aparece en el inbox. Además tiene acceso completo a la app (dashboard, notas, tareas) desde el celular.

---

## Prerequisitos (acción manual antes de F1)

### P1: Android Studio + SDK

1. Descargar Android Studio desde https://developer.android.com/studio
2. Instalar con el setup wizard default (incluye Android SDK, emulador, JDK)
3. Abrir Android Studio → SDK Manager → instalar **Android 14 (API 34)** SDK
4. Crear un AVD (Android Virtual Device) para testing: Pixel 7, API 34, x86_64
5. Verificar: `adb devices` lista el emulador o un dispositivo físico conectado via USB

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
7. Click Create → anotar el **Client ID Android** (no confundir con el Web Client ID ni el Desktop Client ID)
8. También necesitarás el **Web Client ID** existente (el de tipo "Web application" que ya existe en el proyecto) — este es el que `capacitor-google-auth` usa como `serverClientId`

---

## Features

### F1: Scaffold Capacitor + primera build Android

**Qué:** Inicializar Capacitor 7 en el proyecto, generar el proyecto Android, y verificar que la app se abre en el emulador con login y dashboard funcionando (sin auth todavía — solo la UI).

**Criterio de done:**
- [ ] `npx cap init` ejecutado con appId `com.secondmind.app` y appName `SecondMind`
- [ ] `npx cap add android` genera carpeta `android/` con proyecto Gradle válido
- [ ] `npm run build && npx cap sync` copia dist/ al proyecto Android sin errores
- [ ] `npx cap run android` abre la app en emulador/dispositivo mostrando la pantalla de login
- [ ] `.gitignore` raíz incluye `android/app/build/`, `android/.gradle/`
- [ ] `npm run dev` sigue funcionando en browser (sin Capacitor)
- [ ] PWA, Chrome Extension, y Tauri desktop siguen intactos

**Archivos a crear/modificar:**
- `capacitor.config.ts` — config: appId, appName, webDir `dist`, server.androidScheme `https`
- `package.json` — agregar deps `@capacitor/core@^7`, `@capacitor/cli@^7`, `@capacitor/app@^7`; scripts `cap:sync`, `cap:run`, `cap:build`
- `.gitignore` — agregar entradas Android (build/, .gradle/, local.properties, *.apk)
- `android/` — generado por `cap add android` (no tocar manualmente en F1)

**Notas de implementación:**
- Capacitor 7 (no 8) — compatible con Node 20 del proyecto. Cap 8 requiere Node 22+ y Android Studio Otter.
- `server.androidScheme: 'https'` es obligatorio para que Firebase Auth funcione (necesita origen HTTPS). Capacitor sirve desde `https://localhost` en el WebView.
- `npx cap sync` debe correrse después de cada `npm run build`. Agregar script compuesto: `"cap:sync": "npm run build && npx cap sync"`.
- El emulador x86_64 es ~10x más rápido que el ARM. Verificar que HAXM o Hypervisor está habilitado en BIOS.

---

### F2: Auth nativa Google Sign-In

**Qué:** Implementar Google Sign-In nativo en Android usando el SDK de Google (no popup en WebView). El flujo: botón "Sign in with Google" → bottom sheet nativo de Google → seleccionar cuenta → `signInWithCredential` de Firebase → dashboard.

**Criterio de done:**
- [ ] `@codetrix-studio/capacitor-google-auth` instalado y configurado
- [ ] `useAuth.ts` detecta Capacitor (`Capacitor.isNativePlatform()`) y usa sign-in nativo
- [ ] Click en "Sign in with Google" en Android muestra el bottom sheet nativo de selección de cuenta
- [ ] Tras seleccionar cuenta, el usuario ve el dashboard con sus datos de Firestore
- [ ] Sign-in sigue funcionando en web (PWA/Chrome) via `signInWithPopup`
- [ ] Sign-in sigue funcionando en Tauri via OAuth Desktop flow

**Archivos a crear/modificar:**
- `src/hooks/useAuth.ts` — agregar branch: `isCapacitor() → signInWithCapacitor(auth)`
- `src/lib/capacitorAuth.ts` (nuevo) — wrapper: `GoogleAuth.signIn()` → `signInWithCredential`
- `src/lib/capacitor.ts` (nuevo) — helper `isCapacitor()` usando `Capacitor.isNativePlatform()`
- `capacitor.config.ts` — agregar config de `GoogleAuth` plugin con `serverClientId`
- `android/app/src/main/res/values/strings.xml` — agregar `server_client_id` y `google_app_id`
- `android/variables.gradle` — verificar `androidxCredentialsVersion` si el plugin lo requiere

**Notas de implementación:**
- `@codetrix-studio/capacitor-google-auth` v3.x soporta Capacitor 7. Usa Credential Manager en Android 14+.
- El `serverClientId` es el **Web Client ID** (no el Android Client ID). El Android Client ID solo se usa para validar el SHA-1 del keystore. Esto es confuso pero es así: Google usa el Web Client ID para generar el `idToken` que Firebase acepta.
- El flujo es: `GoogleAuth.signIn()` → devuelve `{ authentication: { idToken } }` → `GoogleAuthProvider.credential(idToken)` → `signInWithCredential(auth, credential)`.
- `GoogleAuth.initialize()` debe llamarse al inicio de la app (en `main.tsx` o similar), antes de cualquier intento de sign-in. En web es no-op.
- El Android Client ID de P2 debe estar registrado en Google Cloud Console con el SHA-1 del debug keystore. Si se cambia de keystore (release), hay que crear otro Client ID con el SHA-1 de release.

---

### F3: Share Intent — recibir contenido compartido

**Qué:** Registrar SecondMind como target del Share sheet de Android. Cuando el usuario comparte texto o URL desde otra app, SecondMind se abre y el Quick Capture modal aparece automáticamente con el contenido pre-llenado. Enter guarda al inbox con `source: 'share-intent'`.

**Criterio de done:**
- [ ] `send-intent` v7 instalado y configurado
- [ ] `AndroidManifest.xml` tiene intent filter para `text/plain` en SendIntentActivity
- [ ] Compartir texto desde Chrome → SecondMind aparece en el share sheet
- [ ] Al seleccionar SecondMind, la app se abre y Quick Capture modal aparece con el texto/URL
- [ ] Enter guarda al inbox con `source: 'share-intent'` y `sourceUrl` si es URL
- [ ] Item aparece en la vista de inbox con el source correcto
- [ ] Si la app no estaba abierta (cold boot), el share intent se procesa después del auth
- [ ] `SendIntent.finish()` se llama después de guardar para cerrar la activity de intent

**Archivos a crear/modificar:**
- `src/hooks/useShareIntent.ts` (nuevo) — hook que chequea `SendIntent.checkSendIntentReceived()` al mount, extrae contenido, abre Quick Capture modal programáticamente, y llama `finish()` post-save
- `src/components/capture/QuickCaptureProvider.tsx` — exponer función `openWithContent(text: string)` para que el share intent pueda pre-llenar y abrir el modal
- `android/app/src/main/AndroidManifest.xml` — agregar `<activity>` para `SendIntentActivity` con intent filters para `android.intent.action.SEND` + `text/plain`
- `src/app/layout.tsx` o `src/main.tsx` — invocar `useShareIntent()` para que corra en cada mount

**Notas de implementación:**
- `send-intent` v7 (npm: `send-intent`) — soporta Capacitor 7, API simple: `checkSendIntentReceived()` retorna `{ title, description, type, url }`.
- **Cold boot vs warm resume:** si la app no estaba corriendo, el share intent llega durante el boot. El hook debe esperar a que el auth esté listo (`user != null`) antes de intentar guardar. Si `user == null`, mostrar el login — tras login, volver a chequear el intent.
- **URL compartida vs texto plano:** cuando se comparte una URL desde Chrome, `type` es `text/plain` y `url` contiene la URL. Cuando se comparte texto seleccionado, `url` contiene el texto. Parsear: si `url` empieza con `http`, tratarlo como `sourceUrl` y poner en `rawContent` algo como `Compartido desde: {url}`. Si no, es texto plano → `rawContent: url`.
- **Patrón de escritura:** mismo que extension y Tauri capture — `setDoc` directo a Firestore, no via TinyBase. Ver 01-arquitectura D21.
- **`SendIntent.finish()`** es crítico — sin él, la SendIntentActivity queda viva y puede triggerear el mismo intent si la app se recarga desde idle.
- El `<activity>` de SendIntentActivity va SEPARADO del MainActivity en el manifest. No agregar intent filters al MainActivity directamente — eso causa problemas de estado.

---

### F4: App branding — icono, splash, status bar

**Qué:** Reemplazar el ícono default de Capacitor con el brain-circuit de SecondMind, configurar splash screen con el logo, y ajustar el color de la status bar al theme purple.

**Criterio de done:**
- [ ] Ícono de la app es el brain-circuit purple (no el default de Capacitor)
- [ ] Splash screen muestra el logo SecondMind centrado sobre fondo purple
- [ ] Status bar es purple `#7b2ad1` o transparent cuando la app tiene foco
- [ ] El nombre "SecondMind" aparece debajo del ícono en el launcher

**Archivos a crear/modificar:**
- `android/app/src/main/res/mipmap-*` — íconos generados con `@capacitor/assets` desde `public/pwa-512x512.png`
- `android/app/src/main/res/values/styles.xml` — splash theme con `windowBackground`
- `android/app/src/main/res/drawable/splash.xml` — layer-list con background purple + logo
- `capacitor.config.ts` — agregar config de `SplashScreen` (autoHide delay, backgroundColor)

**Notas de implementación:**
- `npx @capacitor/assets generate --android` genera los mipmap (mdpi, hdpi, xhdpi, xxhdpi, xxxhdpi) desde un ícono fuente. Usar `public/pwa-512x512.png`.
- Para el splash, Capacitor 7 usa el tema XML nativo (no un WebView splash). El `styles.xml` define el `Theme.SplashScreen` con `windowBackground` apuntando a `@drawable/splash`.
- `@capacitor/splash-screen` plugin permite controlar cuándo ocultar el splash desde JS (ej: después del auth).
- Status bar: el plugin `@capacitor/status-bar` permite setear color y estilo. Invocarlo en `main.tsx` con `StatusBar.setBackgroundColor({ color: '#7b2ad1' })` solo si `isCapacitor()`.

---

### F5: Build APK + documentación

**Qué:** Generar debug APK para instalación directa y documentar el proceso. Opcionalmente, configurar keystore de release para futuro.

**Criterio de done:**
- [ ] `npx cap build android` genera debug APK en `android/app/build/outputs/apk/debug/`
- [ ] APK instalable en dispositivo físico via `adb install` o transferencia directa
- [ ] La app instalada funciona: login → dashboard → share intent → inbox
- [ ] Documentación del proceso en este SPEC (convertido a registro)
- [ ] `01-arquitectura` y `03-convenciones` actualizados con Fase 5.2

**Archivos a crear/modificar:**
- `SPEC-fase-5_2-capacitor-mobile.md` — convertir de plan a registro
- `01-arquitectura-hibrida-progresiva.md` — agregar Capacitor a Core stack, Fase 5.2 ✅, decisiones D24-D27, gotchas 45+
- `03-convenciones-y-patrones.md` — agregar `android/` a estructura, script `cap:sync`, helper `isCapacitor()`

**Notas de implementación — release signing (opcional):**
- Generar keystore: `keytool -genkey -v -keystore secondmind-release.keystore -alias secondmind -keyalg RSA -keysize 2048 -validity 10000`
- Guardar keystore fuera del repo (gitignored). Configurar en `android/app/build.gradle` via `signingConfigs`.
- Build release: `cd android && ./gradlew assembleRelease` — genera APK firmado.
- Para Play Store: se necesita AAB (Android App Bundle) en vez de APK. `./gradlew bundleRelease`. Requiere cuenta de Google Play Developer ($25 one-time).

---

## Orden de implementación

1. **P1 + P2** → prerequisitos manuales: instalar Android Studio + crear OAuth Client ID Android
2. **F1** → scaffold Capacitor + primera build. Sin esto no se puede probar nada.
3. **F2** → auth nativa. Sin auth no se puede escribir a Firestore.
4. **F3** → share intent. Depende de F2 (necesita user autenticado para escribir al inbox).
5. **F4** → branding. Independiente de F3 pero mejor hacerlo con la app ya funcional.
6. **F5** → build final + docs. Último porque documenta lo implementado.

Rama única: `feat/f5.2-capacitor-mobile`. Commits atómicos por feature.

---

## Estructura de archivos

```
# Archivos nuevos/modificados en esta fase

capacitor.config.ts              # appId, appName, webDir, plugins config
android/                         # Generado por cap add android (Gradle project)
├── app/
│   ├── src/main/
│   │   ├── AndroidManifest.xml  # Modificado: +SendIntentActivity con intent filters
│   │   ├── res/
│   │   │   ├── mipmap-*/        # Íconos generados con @capacitor/assets
│   │   │   ├── values/
│   │   │   │   ├── strings.xml  # +server_client_id, +google_app_id
│   │   │   │   └── styles.xml   # +Theme.SplashScreen
│   │   │   └── drawable/
│   │   │       └── splash.xml   # Splash layer-list
│   │   └── assets/public/       # Copia de dist/ (generado por cap sync)
│   └── build.gradle             # (opcional) signing config para release
└── variables.gradle

src/
├── lib/
│   ├── capacitor.ts             # isCapacitor() helper
│   └── capacitorAuth.ts         # signInWithCapacitor: GoogleAuth → signInWithCredential
├── hooks/
│   ├── useAuth.ts               # Modificado: +branch isCapacitor → signInWithCapacitor
│   └── useShareIntent.ts        # Listener share intent → open Quick Capture
├── components/
│   └── capture/
│       └── QuickCaptureProvider.tsx  # Modificado: +openWithContent(text)
└── main.tsx                     # Modificado: +GoogleAuth.initialize(), +StatusBar config
```

---

## Definiciones técnicas

### D1: Capacitor 7 sobre Capacitor 8
- **Opciones:** Capacitor 7.6.x, Capacitor 8.3.x
- **Decisión:** Capacitor 7
- **Razón:** Cap 8 requiere Node 22+ y Android Studio Otter 2025.2.1+. El proyecto usa Node 20 (Cloud Functions). Cap 7 es estable, soporta Android 14/15, y tiene el ecosistema de plugins más probado.

### D2: `send-intent` v7 sobre `@capgo/capacitor-share-target`
- **Opciones:** `send-intent` v7 (carsten-klaffke), `@capgo/capacitor-share-target`, `@capawesome-team/capacitor-share-target`
- **Decisión:** `send-intent` v7
- **Razón:** Más establecido (+4 años), actividad separada (SendIntentActivity) evita problemas de estado con MainActivity, API simple (`checkSendIntentReceived` + `finish`). Capawesome es premium. Capgo es más nuevo con menos adopción.

### D3: Native Google Sign-In sobre OAuth browser redirect
- **Opciones:** `@codetrix-studio/capacitor-google-auth` (nativo), `@capacitor/browser` + loopback (patrón Tauri), `signInWithRedirect` en WebView
- **Decisión:** Native Google Sign-In
- **Razón:** Es el patrón estándar en Android. Bottom sheet nativo de Google, sin abrir browser externo, sin servidor loopback. El resultado es el mismo: `idToken` → `signInWithCredential`. `signInWithRedirect` en WebView de Capacitor es unreliable (depende de cookies/redirect handling).

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
- **F4:** Verificar ícono brain-circuit en launcher y recents. Splash screen purple al abrir. Status bar purple.
- **F5:** APK instalable en dispositivo físico. Todo el flujo funciona desinstalado del desarrollo.

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

- [ ] Android Studio instalado y emulador funcional
- [ ] `npx cap run android` abre SecondMind nativa en Android
- [ ] Google Sign-In nativo funciona en Android; web y Tauri auth intactos
- [ ] Share Intent desde Chrome/cualquier app → Quick Capture → inbox funcional
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
- **Push notifications:** no hay features que requieran push todavía. Agregar en fase futura si se implementa reminder de inbox.
- **Offline en Android:** TinyBase data en memoria funciona offline. El write de share intent requiere red (Firestore directo, no TinyBase). Aceptable para MVP — si se necesita offline, encolar en localStorage y sincronizar.
- **Deep links:** abrir SecondMind desde un link `secondmind://note/123`. No prioritario.

---

## Siguiente fase

Con Fase 5.2 completada, SecondMind tiene presencia en todas las plataformas del usuario: web (PWA), desktop (Tauri + Chrome Extension), y mobile (Capacitor Android). La siguiente iteración podría ser polish UX, features nuevas (templates, búsqueda semántica híbrida, slash commands en editor), o mejoras de distribución (code signing Windows, Play Store, auto-updater).
