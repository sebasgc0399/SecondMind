# SPEC — Feature 9: Capacitor Auto-Update via Firebase App Distribution (Registro de implementación)

> Estado: Completada abril 2026
> Commits: `6dd92cf` chore(android): configurar release signing + version sync via Gradle props · `52fb229` ci: agregar job release-capacitor para Firebase App Distribution · `02cb993` fix(ci): bump Node a 22 · `fe878cd` fix(ci): chmod +x gradlew · `9e5ca79` fix(ci): bump JDK a 21
> Tags: v0.1.3 (parcial, sólo desktop) → v0.1.4 → v0.1.5 → **v0.1.6** (primer release con ambos jobs verdes, validado E2E en cel)
> Gotchas operativos vigentes → `Spec/ESTADO-ACTUAL.md`

## Objetivo

Al crear un tag `vX.Y.Z`, el CI — además de compilar el desktop Tauri (F8) — compila el APK Android firmado y lo sube a Firebase App Distribution. Sebastián recibe una notificación push en su celular (via la app Firebase App Tester), toca, descarga e instala la versión nueva. Sin Play Store, sin transferencia manual de APK.

**Flujo post-F9:**

```
git tag v0.2.0 && git push --tags
  → GitHub Actions dispara:
    ├── Job release-tauri  (F8): Windows .exe → GitHub Releases → auto-update in-app
    └── Job release-capacitor (F9): APK → Firebase App Distribution → notificación push
```

## Qué se implementó

- **F1 — Release signing para Android:** release keystore generado con `keytool` (alias `secondmind`, 10000 días de validez), SHA-1 + SHA-256 registrados en Firebase Console, Android OAuth client auto-provisionado por GCP al agregar el SHA-1. `signingConfigs.release` agregado leyendo desde `android/keystore.properties` (local, gitignored) o env vars (CI). Archivos tocados: `android/app/build.gradle`, `.gitignore`.
- **F2 — Firebase App Distribution setup:** App Distribution habilitada, grupo `owner` con `sebasgc0399@gmail.com`, service account con rol "Firebase App Distribution Admin" + JSON key. 8 GitHub secrets configurados: `ANDROID_KEYSTORE_*` (4), `ANDROID_GOOGLE_SERVICES_JSON_BASE64`, `FIREBASE_SERVICE_ACCOUNT_KEY`, `FIREBASE_ANDROID_APP_ID`, `VITE_GOOGLE_WEB_CLIENT_ID`.
- **F3 — Job `release-capacitor` en CI:** paralelo a `release-tauri`, sin `needs:`. Steps: checkout → setup-node@v4 (22) → setup-java@v4 (temurin 21) → `npm ci --legacy-peer-deps` → `.env.production` via heredoc → `npm run build` → `npx cap sync android` → decode `google-services.json` → decode `release.keystore` → compute semver `versionCode` (`MAJOR*10000 + MINOR*100 + PATCH`) → generate `release-notes.txt` → `chmod +x gradlew` → `./gradlew assembleRelease -PversionName=$V -PversionCode=$C` → `wzieba/Firebase-Distribution-Github-Action@v1.7.1`. Archivos tocados: `.github/workflows/release.yml`.
- **F4 — Verificación E2E:** validación local con `./gradlew assembleRelease -PversionName=0.1.2 -PversionCode=102` confirmó APK firmado con scheme v2 y SHA-1 matching el registrado en Firebase. Validación en CI requirió 4 rondas de fix (ver abajo). Finalmente v0.1.6: ambos jobs verdes, APK 6.92 MB subido a Firebase, notificación push recibida en Firebase App Tester, login Google funcionando en APK release, datos Firestore visibles, versión en Settings coincide con el tag.

## Decisiones clave

| #   | Decisión                                                                                           | Razón                                                                                                                                                                                                             |
| --- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Firebase App Distribution (no Play Store)                                                          | App personal N=1. Play Store requiere $25 + review + AAB firmado + privacy policy. App Distribution es gratis e inmediato.                                                                                        |
| D2  | `wzieba/Firebase-Distribution-Github-Action@v1.7.1` (pin exacto)                                   | Más estable/adoptada (1.4k+ stars). Pin exacto post-lección F8 Bug A: no asumir schemas estables.                                                                                                                 |
| D3  | APK (no AAB)                                                                                       | AAB requiere Play Store. APK es sideloadable directo desde Firebase App Tester.                                                                                                                                   |
| D4  | Jobs paralelos, sin `needs:`                                                                       | Independientes: si uno falla el otro no se bloquea. Reduce tiempo CI total.                                                                                                                                       |
| D5  | `.env.production` generado en CI con heredoc                                                       | Patrón canónico de F8 Bug C: Gradle subprocess tampoco hereda env vars confiablemente.                                                                                                                            |
| D6  | `versionName` + `versionCode` via Gradle props `-P`                                                | `build.gradle` committed queda con fallbacks estáticos. Un archivo menos en la lista de bump manual por release.                                                                                                  |
| D7  | `versionCode` = semver encoded (`MAJOR*10000 + MINOR*100 + PATCH`)                                 | Legible a simple vista: 0.1.6 → 106. Monotonic mientras se bumpee antes del tag (lección F8 Bug B).                                                                                                               |
| D8  | `google-services.json` inyectado como secret base64                                                | No es secret per Firebase pero mantiene consistencia con VITE*FIREBASE*\* en el mismo repo. Además gitignored evita exponer `api_key` si la visibilidad del repo cambia.                                          |
| D9  | Release keystore separado del debug + SHA-1 registrado en Firebase **antes** del primer CI release | Debug y release keystore tienen SHA-1 distintos. Sin registro previo, el APK release firma OK pero `SocialLogin.login()` falla con `DEVELOPER_ERROR` en runtime — parece bug de código pero es config de consola. |
| D10 | `permissions: contents: read` (no `write`)                                                         | Job no crea GitHub Releases, solo sube a Firebase. Mínimo privilegio.                                                                                                                                             |

## Rondas de fix

Validación local pasó al primer intento (JDK 21 del JBR de Android Studio, chmod +x innecesario en Windows). CI en ubuntu expuso **4 rondas** de discrepancias entre el entorno local y el runner. Cada ronda arregló 1 issue y descubrió el siguiente — patrón idéntico al de F8.

| Ronda | Tag        | Falla                                                           | Root cause                                                                                                                                                                                                                              | Fix                                                                                                                        |
| ----- | ---------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1     | v0.1.3     | `release-capacitor` step `Sync Capacitor Android`               | Capacitor CLI >=8 requiere NodeJS >=22; `setup-node` pedía 20 para matchear `release-tauri`                                                                                                                                             | Node 22 en `release-capacitor`, Node 20 en `release-tauri` (asymetría intencional: tauri-action no corre el Capacitor CLI) |
| 2     | v0.1.4     | `release-capacitor` step `Build release APK` (exit 126)         | `./gradlew: Permission denied` — scripts pierden bit executable tras git checkout en runners Linux                                                                                                                                      | Step `chmod +x gradlew` antes del build                                                                                    |
| 3     | v0.1.5     | `release-capacitor` task `compileReleaseJavaWithJavac` (exit 1) | Error `invalid source release: 21` — Capacitor 8 genera `capacitor.build.gradle` con `sourceCompatibility=21`/`targetCompatibility=21`, JDK 17 del CI es incompatible. Local andaba porque el JBR de Android Studio 2024+ ya es JDK 21. | JDK 21 en `setup-java@v4`                                                                                                  |
| 4     | **v0.1.6** | —                                                               | —                                                                                                                                                                                                                                       | Ambos jobs verdes. Login Google valida en APK release.                                                                     |

**`release-tauri` mantuvo verde en las 4 rondas** — el fix iterativo de `release-capacitor` no produjo regresión en el flujo desktop (F8). D4 (jobs paralelos sin `needs:`) pagó dividendos acá: cada ronda perdía sólo ~1 min de CI Android, el desktop Tauri seguía su flujo completo en 8-9 min paralelos.

## Lecciones

- **Capacitor CLI 8+ requiere Node 22.** Versioning creep silencioso: si un repo tiene pipelines históricos con Node 20 (válidos para el resto del stack), fallan al actualizar a Capacitor 8+. Cualquier job CI que invoque `npx cap sync` / `npx cap run` necesita verificar el `package.json` del plugin y bumpear Node. Síntoma: `[fatal] The Capacitor CLI requires NodeJS >=22.0.0`.

- **Capacitor 8 genera `compileOptions` con Java 21.** El archivo `capacitor.build.gradle` es regenerado por `cap sync` con `sourceCompatibility=21`/`targetCompatibility=21`. CI Android con JDK <21 rompe en `compileReleaseJavaWithJavac` con `invalid source release: 21`. Local anda silenciosamente si se usa el JBR de Android Studio 2024+ (que es JDK 21 por default) — gotcha típico de "funciona en mi máquina".

- **`gradlew` pierde el bit executable tras `git checkout` en runners Linux.** Windows local no lo expone (se invoca `gradlew.bat` directamente). CUALQUIER job de Android en `ubuntu-latest` necesita `chmod +x gradlew` antes del primer invocation. Transferible a cualquier CI Android multi-OS.

- **En apps con Firebase + Google Sign-In nativo, el SHA-1 del release keystore debe registrarse en Firebase Console ANTES del primer CI release.** Debug y release keystore tienen SHA-1 distintos. Firebase auto-provisiona el Android OAuth client en GCP al agregar el SHA-1, pero sin ese paso manual el APK release firma correctamente pero `SocialLogin.login()` devuelve `DEVELOPER_ERROR` en runtime. El fix NO es de código — es config en 2 consolas (Firebase + GCP). Regla: cuando cambias de keystore (debug → release, o rotación futura), registrar SHA-1 nuevo en Firebase es parte del ritual, como bumpear la versión.

- **`versionName`/`versionCode` derivados del tag via Gradle props `-P` evita 1 clase entera de bugs de desync.** `build.gradle` committed queda con fallbacks estáticos (`"1.0"` / `1`); CI pasa `-PversionName=${GITHUB_REF_NAME#v} -PversionCode=$SEMVER_CODE`. Ningún archivo requiere bump coordinado con el tag en Android, sólo `package.json` + `Cargo.toml` + `tauri.conf.json` para desktop. Regla general: cualquier valor derivable del tag git NO debería vivir en un archivo committed — eso es duplicación de source of truth y es exactamente lo que F8 Bug B costó una ronda de fix.

- **Paridad entre entorno local y CI es más frágil de lo que parece.** F9 validó local en el primer intento (sin `chmod`, sin bump de JDK, sin bump de Node) y aun así requirió 4 rondas de fix en CI. Las diferencias silenciosas fueron: Windows vs Linux (chmod), Node del dev (22) vs `setup-node` (20), JBR 21 de Android Studio vs `setup-java` (17). Lección operativa: aceptar las rondas de fix como parte natural del primer release pipeline de una nueva plataforma (F8 tuvo 3, F9 tuvo 4) en vez de tratar de anticiparlas todas al diseñar el SPEC. La D4 (jobs paralelos sin `needs:`) hace que el costo por ronda sea bajo.
