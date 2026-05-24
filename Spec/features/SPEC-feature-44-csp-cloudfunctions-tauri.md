# SPEC — Feature 44 · Fix CSP `cloudfunctions.net` en Tauri (búsqueda híbrida)

> Alcance: Desbloquear la invocación de Cloud Functions callables (`embedQuery`) desde la app de escritorio Tauri agregando `cloudfunctions.net` al `connect-src` del CSP.
> Dependencias: Ninguna. F44 es hermana de F39 (mismo patrón: fix CSP Tauri-only para una capa de Firebase que el manifest no enumera).
> Estimado: 1 sesión (fix de 1 línea + smoke test local + release coordinado v0.2.10).
> Stack relevante: Tauri v2 (`src-tauri/tauri.conf.json`), Firebase Functions callables (`httpsCallable` en `src/lib/embeddings.ts`).

---

## Objetivo

En `/notes` de la app de escritorio Tauri, el toggle "Búsqueda híbrida" (keyword + semántica) queda inservible: cualquier query devuelve "Sin resultados" porque el fetch a `embedQuery` (Cloud Function callable) es bloqueado por la CSP del WebView2 antes de salir. Tras F44 la búsqueda híbrida funciona en Tauri con la misma latencia y resultados que en PWA web.

---

## Root cause

`src/lib/embeddings.ts:79` define `embedQueryFn = httpsCallable(functions, 'embedQuery')`. La invocación dispara un POST a `https://us-central1-secondmindv1.cloudfunctions.net/embedQuery`. La CSP de Tauri (`src-tauri/tauri.conf.json:43`) lista los servicios Firebase necesarios (`firestore.googleapis.com`, `identitytoolkit.googleapis.com`, `securetoken.googleapis.com`, `*.googleapis.com`, `*.firebaseio.com`) **pero omite el dominio donde viven las callable functions** (`cloudfunctions.net`). Chromium bloquea el request por violación de `connect-src` y `httpsCallable` falla silenciosamente (la UI cae al fallback "Sin resultados" sin distinguir entre "no hay matches" y "fetch bloqueado").

**Por qué solo se manifiesta en Tauri:**

- **PWA web (Firebase Hosting):** no setea `<meta CSP>` ni header `Content-Security-Policy`, así que el navegador no tiene política que validar. Funciona.
- **Capacitor Android:** WebView Android sin policy custom. Funciona.
- **Tauri Desktop:** la CSP del manifest se inyecta como header en cada respuesta del protocolo `tauri://`. Es la única plataforma donde aplica. Bloquea.

**Por qué no se cazó antes:** F3 (búsqueda híbrida) fue la primera y única feature que introdujo una callable consumida desde el cliente. Las otras 5 CFs son triggers Firestore + scheduled (sin invocación cliente). Hasta que un usuario probara búsqueda híbrida en la app de escritorio, el bug quedaba inerte. Mismo perfil que F36.F9.B (`VITE_GOOGLE_OAUTH_CLIENT_ID` faltante en `release-tauri` heredoc, oculto hasta que el sign-in screen disparara con bundle CI-built).

Hermano funcional: F39 (`worker-src` para `graphology-layout-forceatlas2` en `/notes/graph`). Mismo perfil: CSP de Tauri omite una capa que la PWA recibe por default.

---

## Features

### F44.1: Agregar `cloudfunctions.net` al `connect-src` de Tauri

**Qué:** Sumar `https://us-central1-secondmindv1.cloudfunctions.net` al `connect-src` del CSP en [`src-tauri/tauri.conf.json:43`](../../src-tauri/tauri.conf.json). Subdominio específico (no wildcard `*.cloudfunctions.net`) por consistencia con la enumeración existente de hostnames Firebase.

**Criterio de done:**

- [ ] `src-tauri/tauri.conf.json:43` incluye `https://us-central1-secondmindv1.cloudfunctions.net` en el `connect-src`.
- [ ] `npm run tauri:dev` arranca sin errores de CSP en consola al cargar `/notes`.
- [ ] Búsqueda híbrida en `/notes` con query de prueba (ej. "Inteligencia artificial") devuelve resultados (asumiendo notas con embeddings existentes para el usuario de test).
- [ ] DevTools de Tauri NO muestra el error `Refused to connect because it violates the document's Content Security Policy` apuntando a `cloudfunctions.net`.
- [ ] Build producción (`npm run tauri:build`) genera MSI + NSIS sin errores.

**Archivos a crear/modificar:**

- `src-tauri/tauri.conf.json` — Agregar 1 hostname al `connect-src` (línea 43).

**Notas de implementación:**

- Mantener el orden existente del `connect-src`: hostnames Firebase agrupados, luego CDN `jsdelivr`. Insertar el nuevo dominio en el bloque Firebase, después de `securetoken.googleapis.com` y antes de `www.googleapis.com` (mantiene el agrupamiento lógico identitytoolkit/securetoken/cloudfunctions = backend Firebase del proyecto).
- NO usar wildcard `https://*.cloudfunctions.net`. La consistencia con `identitytoolkit.googleapis.com` y `securetoken.googleapis.com` (ambos subdominios específicos, no `*.googleapis.com`) es el patrón. Si en el futuro se agregan callables en otras regiones, agregar cada hostname explícito en el momento que se necesite.
- Esta es la misma decisión que llevó F39 a agregar `worker-src` como key explícita en vez de modificar `default-src`.

---

### F44.2: Actualizar gotcha existente sobre CSP Firebase

**Qué:** El gotcha "CSP Firebase explícito en `tauri.conf.json`" en [`Spec/gotchas/tauri-desktop.md:47-49`](../gotchas/tauri-desktop.md) enumera los hostnames Firebase pero NO menciona `cloudfunctions.net` para callables. Actualizar la enumeración para incluirlo y dejar registro de que F44 cerró esta omisión.

**Criterio de done:**

- [ ] El gotcha en `gotchas/tauri-desktop.md` lista `*.cloudfunctions.net` (o el subdominio específico) como parte de la enumeración requerida.
- [ ] Una línea breve explica que aplica a callables (`httpsCallable`), no a triggers Firestore/scheduled (que no salen del WebView).
- [ ] Anchor del gotcha sin cambios si el título no cambia, o índice de `ESTADO-ACTUAL.md` actualizado si se renombra.

**Archivos a crear/modificar:**

- `Spec/gotchas/tauri-desktop.md` — Editar gotcha "CSP Firebase explícito en `tauri.conf.json`" (líneas 47-49).

**Notas de implementación:**

- No crear gotcha nuevo separado. Es complemento a uno existente — el conocimiento canónico sigue siendo "el `connect-src` enumera hostnames Firebase necesarios". F44 corrige una omisión, no descubre comportamiento nuevo.
- Si el anchor cambia (renombre del título), actualizar también el índice en `Spec/ESTADO-ACTUAL.md` § "Gotchas por dominio (índice) → Tauri Desktop".

---

### F44.3: Release coordinado v0.2.10

**Qué:** Bump coordinado de v0.2.9 → v0.2.10 en los 3 frentes (web + desktop + Android) vía skill `release-ecosystem`. Web y Android pasan idénticos funcionalmente (solo bump de versión); el cambio real solo aplica a Tauri pero el release coordinado evita drift entre artefactos.

**Criterio de done:**

- [ ] `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` (entry `secondmind`), `src-tauri/tauri.conf.json`, `android/app/build.gradle` (`versionCode` derivado del tag por CI, `versionName` también) actualizados a `0.2.10` donde aplica.
- [ ] Tag `v0.2.10` empujado a origin.
- [ ] Workflow `release.yml` cierra ambos jobs `release-tauri` + `release-capacitor` en success.
- [ ] GitHub Release v0.2.10 con MSI + NSIS + `latest.json` firmados.
- [ ] APK desplegado a Firebase App Distribution grupo `owner`.
- [ ] Hosting deployado manualmente con `npm run deploy` (paso del skill `release-ecosystem`, antes del tag).
- [ ] Auto-updater Tauri descarga v0.2.10 sin errores en una instalación v0.2.9 baseline (smoke test post-release).

**Archivos a crear/modificar:**

- `package.json` — bump `version`.
- `src-tauri/Cargo.toml` — bump `version`.
- `src-tauri/Cargo.lock` — bump entry `secondmind` (auto via cargo).
- `src-tauri/tauri.conf.json` — bump `version`.

**Notas de implementación:**

- Skill `release-ecosystem` ya orquesta el orden crítico (hosting deploy ANTES del tag, bumps atómicos de los 5 archivos).
- `android/app/build.gradle` NO se bumpea manualmente — `versionCode`/`versionName` se computan del tag por CI (gotcha existente "`versionName`/`versionCode` del APK via Gradle props `-P` derivados del tag" en `tauri-desktop.md`).
- Pre-release sanity check: validar en `npm run tauri:dev` ANTES del tag que el fix funciona; el tag es punto de no retorno (auto-updater notifica a usuarios baseline).

---

## Orden de implementación

1. **F44.1** → Fix CSP. Bloquea todo lo demás; sin esto la búsqueda híbrida sigue rota y no hay nada que validar.
2. **F44.2** → Actualizar gotcha. Independiente de F44.1 pero depende de la decisión de hostname (subdominio específico vs wildcard) tomada al ejecutar F44.1. Se puede hacer en el mismo commit que F44.1 si el cambio es trivial, o aparte si el rewrite del gotcha es sustancial.
3. **F44.3** → Release coordinado. Solo después de validar F44.1 + F44.2 en `tauri:dev` + smoke test en MSI local. Tag empujado dispara CI → distribución a usuarios baseline vía auto-updater.

---

## Estructura de archivos

Sin archivos nuevos. Tres archivos editados:

```
src-tauri/
└── tauri.conf.json          # F44.1 (1 línea connect-src) + F44.3 (version bump)

Spec/gotchas/
└── tauri-desktop.md          # F44.2 (update gotcha CSP existente)

# Bumps de release F44.3
package.json
src-tauri/Cargo.toml
src-tauri/Cargo.lock
```

---

## Definiciones técnicas

### D1: Subdominio específico vs wildcard en `connect-src`

- **Opciones consideradas:**
  - **A.** `https://us-central1-secondmindv1.cloudfunctions.net` (subdominio específico del proyecto + región).
  - **B.** `https://*.cloudfunctions.net` (wildcard sobre el TLD de Cloud Functions).
- **Decisión:** A.
- **Razón:** Consistencia con el resto del `connect-src`. `identitytoolkit.googleapis.com` y `securetoken.googleapis.com` son subdominios específicos enumerados; solo `*.googleapis.com` usa wildcard, y aplica al TLD entero. Wildcard sobre `cloudfunctions.net` permitiría conexiones a CFs de proyectos ajenos si alguna dependencia introdujera un fetch malicioso. La superficie ampliada no compra nada porque solo invocamos CFs de `secondmindv1`. Si en el futuro se agrega una región (ej. `europe-west1-secondmindv1.cloudfunctions.net`), se enumera explícito en ese momento. Mismo razonamiento que F39 (D1) para `worker-src`: enumeración explícita > wildcard genérico cuando la lista es chica y estable.

### D2: Release coordinado vs hotfix Tauri-only

- **Opciones consideradas:**
  - **A.** Hotfix Tauri-only (solo bump de `tauri.conf.json` + `Cargo.toml`, release Tauri en CI sin tocar Android/web).
  - **B.** Release coordinado v0.2.10 (skill `release-ecosystem`, bump 5 archivos, tag `v*` dispara ambos jobs).
- **Decisión:** B.
- **Razón:** Misma decisión que F39 (D2). Drift de versiones entre los 3 frentes complica troubleshooting ("¿qué versión web tengo?" vs "¿qué versión desktop?") y rompe la mental model de "v0.2.X es la misma app en los 3 lados". El bump de web/Android es barato (CI corre los 2 jobs igual) y mantiene el ecosistema alineado. Único costo: usuarios Android/web reciben un release sin cambios funcionales — aceptable, ya pasó con F39 y F41 (también Tauri-only).

### D3: Actualizar gotcha existente vs crear gotcha nuevo

- **Opciones consideradas:**
  - **A.** Crear gotcha nuevo "Callables Firebase requieren `cloudfunctions.net` en `connect-src`" en `tauri-desktop.md`.
  - **B.** Editar el gotcha existente "CSP Firebase explícito en `tauri.conf.json`" para incluir `cloudfunctions.net` en la enumeración.
- **Decisión:** B.
- **Razón:** El gotcha existente ya es la fuente de verdad sobre qué hostnames lista el CSP. Crear un gotcha separado por una omisión fragmenta el conocimiento ("¿está en el gotcha CSP o en el de callables?"). La regla canónica del repo "el `connect-src` enumera hostnames Firebase necesarios" sigue siendo correcta; F44 solo agrega un ítem a esa enumeración. Si en el futuro callables introducen comportamiento adicional (ej. timeouts diferentes, regiones múltiples, CORS específico), entonces sí amerita gotcha propio.

---

## Checklist de completado

- [ ] `npm run tauri:dev` arranca sin errores de CSP nuevos.
- [ ] Búsqueda híbrida en `/notes` devuelve resultados en MSI local (smoke test pre-release).
- [ ] `npm run tauri:build` genera MSI + NSIS sin errores.
- [ ] Gotcha de CSP en `tauri-desktop.md` refleja la enumeración completa post-F44.
- [ ] Release coordinado v0.2.10 publicado: GitHub Release con MSI + NSIS + `latest.json`, APK en App Distribution, hosting en `https://secondmind.web.app`.
- [ ] Auto-updater Tauri instala v0.2.10 desde v0.2.9 baseline sin errores.
- [ ] Step 8 SDD: SPEC archivado a registro de implementación, ESTADO-ACTUAL actualizado con F44 en índice de features (gotcha de tauri-desktop actualizado in-place, no nueva entry en el índice por D3).

---

## Siguiente fase

F45 sin candidata definida. F44 cierra una omisión específica del CSP; no abre nuevas líneas de trabajo. Posibles follow-ups oportunistas (no scope F44):

- **Font OTS error en Tauri:** `geist-latin-wght-normal.woff2` devuelve HTML (404 SPA fallback) en build Tauri — visible en consola pero sin impacto visual (cae a `font-sans`). Investigar si el woff2 falta en el bundle o si el path está mal en el CSS importado.
- **DevTools `com.chrome.devtools.json` probe** bloqueado por CSP — auto-probe inocuo de Chromium DevTools, ignorable salvo que moleste el ruido de consola.
