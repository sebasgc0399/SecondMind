---
name: release-ecosystem
description: Despliega una nueva versión coordinada de SecondMind en los 3 artefactos del ecosistema (hosting web + desktop Tauri + mobile Android vía Capacitor) cuando el user acumuló cambios y pide "actualizar versión", "nueva release", "deploy de todo", "actualizar app escritorio y móvil", "release alineado", "bump versión en todo el ecosistema", o variantes. Úsala SIEMPRE que la intención sea publicar una versión nueva a producción que impacte los 3 frentes a la vez — bumpea los 5 archivos de versión atómicamente, respeta el orden crítico (hosting ANTES del tag de git), y monitorea el workflow de GitHub Actions hasta que termine. NO la uses para deploys parciales (solo hosting, solo functions, solo rules) ni para hotfixes que no tocan desktop/mobile — esos son comandos puntuales, no un release coordinado.
---

# Release Ecosystem — SecondMind

Coordina el despliegue sincronizado de las 3 distribuciones (web, desktop, mobile) para que queden en la misma versión numerada. La web sale por Firebase Hosting (manual), desktop y mobile los publica GitHub Actions cuando se pushea un tag `v*`.

La skill existe porque el pipeline tiene un **orden crítico no obvio** (hosting debe publicar antes del tag para que desktop/mobile no lleguen a usuarios apuntando a una web que todavía sirve la versión anterior) y porque hay **5 archivos de versión que bumpear atómicamente** — olvidarse uno produce builds desincronizados que el user detecta recién al descargar.

## Cuándo activarte

**Sí:**

- "Actualizar versión / nueva release / release alineado" tras acumular features o cambios.
- "Deploy de todo" o "bump de ecosistema".
- El user quiere que web + desktop + mobile queden coordinados en la misma versión.

**No** (estos son tareas puntuales, no requieren skill):

- "Deploy hosting" solo → `npm run deploy`.
- "Deploy functions" solo → `npm run deploy:functions`.
- "Deploy rules" solo → `npm run deploy:rules`.
- Hotfix que solo toca hosting y no necesita reflejarse en desktop/mobile (ej. cambio de copy que no impacta la app empacada).
- Bump de versión sin intención de liberar (ej. bump experimental local).

## Pre-flight checks (antes de tocar nada)

Estos 4 checks bloquean o abren conversación. No saltear ninguno — cada uno salvó un release en el pasado.

### 1. Working tree limpio

```bash
git status --short
```

Si devuelve algo, **parar**. El bump debe ir en su propia branch limpia sin mezclarse con trabajo en curso. Preguntar al user qué hacer con los cambios sin commitear.

### 2. Branch actual = main

```bash
git branch --show-current
```

Si no es `main`, preguntar si querés arrancar el release desde ahí igual (no suele ser buena idea — un release desde una feature branch es una señal de que algo está mal en el flujo).

### 3. Último tag vs HEAD — ¿hay cambios reales?

```bash
git tag --sort=-v:refname | head -1   # último tag
git log <último-tag>..HEAD --oneline  # commits desde entonces
```

Clasificar los commits:

- **Runtime changes** (feat, fix que toca `src/`, refactor de código real) → release justificado.
- **Solo docs / types / chore** → **preguntar al user explícitamente** si es un "release de alineación" intencional (ej. mantener los 3 artefactos en la misma versión numerada después de un período de solo trabajo en docs) o si hay algo sin mergear que debería entrar primero.

Precedente: v0.1.7 fue un release de alineación válido tras 23 commits doc-only. Pero la conversación fue explícita — no asumir.

### 4. Bump target

Preguntar al user:

- **Patch** (`X.Y.Z+1`) — fix, docs, alineación, cambios menores. Default razonable.
- **Minor** (`X.Y+1.0`) — feature nueva visible al usuario.
- **Major** (`X+1.0.0`) — breaking change o hito grande.

Confirmar el número final antes de seguir (`0.1.7 → 0.1.8`, por ejemplo).

## Archivos a bumpear (5, todos atómicos en un commit)

Esta lista es exhaustiva. Olvidarse uno deja el release desincronizado.

| Archivo                     | Campo                                             | Nota                                                                             |
| --------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------- |
| `package.json`              | `"version"`                                       | Web + fuente que toma Vite en el build                                           |
| `package-lock.json`         | `"version"` (raíz) **y** `packages[""]`.version   | Se desincroniza vs package.json si no lo tocás                                   |
| `src-tauri/tauri.conf.json` | `"version"`                                       | Versión que ve el updater de Tauri y aparece en "About"                          |
| `src-tauri/Cargo.toml`      | `version = "..."` en `[package]`                  | Versión del crate Rust                                                           |
| `src-tauri/Cargo.lock`      | Entry con `name = "secondmind"` → línea `version` | Sincroniza con Cargo.toml. Sin esto Cargo refuseará algunos builds reproducibles |

**NO tocar** `android/app/build.gradle`. El workflow deriva `versionName` y `versionCode` del tag vía:

```bash
VERSION_NAME="${GITHUB_REF_NAME#v}"                                    # v0.1.7 → 0.1.7
VERSION_CODE=$((MAJOR * 10000 + MINOR * 100 + PATCH))                  # 0.1.7 → 107
./gradlew assembleRelease -PversionName=$VERSION_NAME -PversionCode=$VERSION_CODE
```

Android toma la versión del tag, no del archivo. Tocar `build.gradle` es ruido innecesario.

## Flujo (10 pasos)

Ejecutar en este orden. Cada paso tiene un "por qué" que justifica su posición.

### Paso 1 — Crear branch de release

```bash
git checkout -b chore/release-v<X.Y.Z>
```

**Por qué branch:** el hook PreToolUse bloquea edits en main con `exit 2`. Además mantiene el bump commit aislado para poder revertirlo si algo sale mal antes del tag.

### Paso 2 — Bumpear los 5 archivos

Editar `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` subiendo el campo version al número acordado.

Verificar con `git diff --stat` — deben aparecer exactamente 5 archivos, ~6 inserciones/6 deleciones.

### Paso 3 — Commit atómico

```bash
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json
git commit -m "chore(release): bump version X.Y.Z → A.B.C

<1-2 líneas explicando qué incluye este release o si es de alineación>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Paso 4 — Merge --no-ff a main

```bash
git checkout main
git merge --no-ff chore/release-v<X.Y.Z> -m "Merge chore/release-v<X.Y.Z> — <resumen>"
git branch -d chore/release-v<X.Y.Z>
```

### Paso 5 — Push main (sin tag todavía)

```bash
git push origin main
```

**Por qué antes del tag:** el workflow corre en GitHub, clona el repo al estado del tag. Si el tag existiera antes de que main tenga el commit del bump, el clone tomaría código viejo. Push primero, tag después.

### Paso 6 — Deploy hosting

```bash
npm run deploy   # = npm run build && firebase deploy --only hosting
```

Este paso tarda ~1 min (build Vite + upload Firebase).

**Por qué hosting ANTES del tag** (crítico): el tag dispara GitHub Actions que construye desktop + mobile. Si esos artefactos llegan a usuarios (updater de Tauri, Firebase App Distribution) apuntando a una versión de web que todavía no está publicada, hay desync de minutos durante el cual la app nueva puede fallar en features que dependan del bundle web nuevo (ej. CSP, Firebase config, rutas).

Esperar a que el deploy termine y confirme `Hosting URL: https://secondmind.web.app`. Validar en el navegador si hay dudas.

### Paso 7 — Crear y pushear tag

```bash
git tag -a v<X.Y.Z> -m "SecondMind v<X.Y.Z> — <resumen del release>"
git push origin v<X.Y.Z>
```

Esto dispara `.github/workflows/release.yml`. Verificar que el run arrancó:

```bash
gh run list --workflow=release.yml --limit 3
```

El run más reciente debe tener estado `in_progress` o `queued` y referenciar el tag recién pusheado.

### Paso 8 — Monitorear el workflow

```bash
gh run watch <run-id> --exit-status
```

Idealmente en background para no bloquear. Tiempo típico: **~10 minutos**.

Dos jobs corren en paralelo:

- **`release-tauri`** (windows-latest, Node 20): genera MSI + NSIS firmados + crea GitHub Release con `latest.json` firmado. El updater endpoint (`https://github.com/sebasgc0399/SecondMind/releases/latest/download/latest.json`) detecta la release y los usuarios reciben el update al abrir la app (o en el check programado).
- **`release-capacitor`** (ubuntu-latest, Node 22 + JDK 21): buildea APK release firmado + lo sube a Firebase App Distribution grupo `owner`. El user recibe notificación push/email.

### Paso 9 — Verificar éxito

Cuando `gh run watch` termina con exit 0:

```bash
gh run view <run-id> --json status,conclusion,jobs --jq '{status, conclusion, jobs: [.jobs[] | {name, conclusion}]}'
```

Ambos jobs deben estar `success`. Si alguno falló, ver `## Troubleshooting` abajo.

Además verificar manualmente:

- GitHub Release creado: `https://github.com/sebasgc0399/SecondMind/releases/tag/v<X.Y.Z>` — debe tener los .msi, .nsis, y `latest.json`.
- Firebase App Distribution: el user debería recibir notificación. Si no, revisar la consola de Firebase.

### Paso 10 — Cerrar

Informar al user:

- Versión publicada.
- Hosting ya sirve la nueva en `https://secondmind.web.app`.
- Updater desktop detectará la nueva en el próximo check (o manual desde Settings).
- APK disponible en Firebase App Distribution.
- Tiempo total del release.

## Gotchas del pipeline (no hace falta aplicarlos — ya están en `.github/workflows/release.yml`, pero saberlos ayuda a debuggear)

Estos gotchas ya están resueltos en el workflow actual. Los listo por si algo falla y hay que entender por qué el workflow está estructurado así.

- **Capacitor 8 exige Node 22 + JDK 21.** El SPEC original decía Node 20 + JDK 17 y falló con `invalid source release: 21` en `compileReleaseJavaWithJavac` (Capacitor 8 genera `capacitor.build.gradle` con `sourceCompatibility=21`). Si algún día migramos Capacitor y falla el job Android, empezar por acá.
- **`gradlew` pierde bit executable tras git checkout en runners Linux.** El workflow hace `chmod +x gradlew` explícito antes de invocarlo. Si alguna vez ves `/bin/sh: ./gradlew: Permission denied`, es eso.
- **`.env.production` se genera explícito en cada job** (no via `env:` de tauri-action). Porque las env vars del step `env:` no se propagan confiablemente al subprocess que corre `npm run build` en Windows runners → bundle queda con Firebase config undefined → OAuth roto en release. Síntoma: sign-in falla en desktop pero funciona en dev.
- **Updater de Tauri trata HTTP 404 como error**, no como "sin update disponible". Antes del primer release `latest.json` no existía y el hook caía al catch. En producción con ≥1 release esto no se ve.
- **Android `versionCode` semver-encoded**: 0.1.7 → 107, 1.2.5 → 10205. Legible, monotónico mientras subamos versiones en orden. Derivado del tag — no tocar `build.gradle` manualmente.

## Troubleshooting

### Un job del workflow falla

```bash
gh run view <run-id> --log-failed | tail -100
```

Causas típicas:

- **Secrets faltantes o expirados**: revisar `Settings → Secrets and variables → Actions` en GitHub. Lista de secrets requeridos abajo.
- **APK no se sube a Firebase App Distribution**: suele ser `FIREBASE_SERVICE_ACCOUNT_KEY` expirado. Regenerar en la consola de Firebase.
- **Tauri signing falla**: verificar `TAURI_SIGNING_PRIVATE_KEY` y su password. Nunca cambiar la key generada — los updates existentes la verifican contra `pubkey` en `tauri.conf.json`. Si rotás la key, los updates ya desplegados no se podrán instalar (se quedan en la última versión).

### Rehacer un release (tag ya pusheado con error)

```bash
gh release delete v<X.Y.Z> --cleanup-tag --yes
```

Borra Release + tag remoto atómicamente. Después corregir lo que haya que corregir y volver a pushear el tag. `tauri-action` no recrea releases; este es el único path limpio.

**Advertencia:** si el release ya se distribuyó (usuarios con updater activo lo recibieron), rehacerlo no los deshace. Solo vale la pena si el problema se detecta antes de que alguien descargue.

### Hosting desplegado pero tag no pushea

Estado intermedio limpio: los usuarios web ya tienen la nueva versión, desktop/mobile siguen en la anterior. No es catastrófico. Diagnosticar el problema y pushear el tag cuando esté resuelto — el hosting ya deployado no se rompe.

## Secrets del repo (referencia)

No hay que configurarlos en cada release — ya están. Solo para diagnóstico si algo falla:

**Firebase (web build):**
`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MEASUREMENT_ID`

**Google Sign-In (solo Android, capgo social-login):**
`VITE_GOOGLE_WEB_CLIENT_ID`

**Tauri signing:**
`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

**Android build & signing:**
`ANDROID_GOOGLE_SERVICES_JSON_BASE64`, `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`

**Firebase App Distribution:**
`FIREBASE_ANDROID_APP_ID`, `FIREBASE_SERVICE_ACCOUNT_KEY`

## Qué NO hace esta skill

- **No toca Cloud Functions.** Si el release incluye cambios en `src/functions/`, hay que correr `npm run deploy:functions` por separado (antes o después del release, no importa, deploy independiente).
- **No toca Firestore rules.** Mismo criterio: `npm run deploy:rules`.
- **No ejecuta tests.** Asume que los cambios ya pasaron CI/tests locales antes de pedir el release. Si el user pide "release y además correr tests", los tests van antes, separados.
- **No escribe release notes automáticas.** El body del commit de merge + el mensaje del tag son el único "changelog" generado. GitHub Release body es genérico (lo genera el workflow). Si el user quiere release notes curadas, las redacta él y las paso al `-m` del tag.

## Referencias en el repo

- `.github/workflows/release.yml` — la source of truth del pipeline.
- `src-tauri/tauri.conf.json` — configuración del updater y bundle.
- `android/app/build.gradle` — lee `versionName` y `versionCode` como Gradle props (derivadas del tag).
- `Spec/ESTADO-ACTUAL.md` sección "Auto-Updater + Releases (Features 8-9)" — historial de gotchas resueltos y decisiones del pipeline.
