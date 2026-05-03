# DRAFT — Privatizar repo GitHub + Migrar endpoint Tauri updater a host público

> **Estado:** DRAFT / discovery — **NO es un SPEC formal** > **Vida útil:** temporal. Eliminar este archivo al convertirlo en un `SPEC-feature-N-*.md` desde el PC personal.
> **Redactado en:** PC empresa (sesión Claude Code), 2026-04-23
> **Limitación de contexto:** esta máquina no tiene el `.env.local` real del proyecto ni corre builds Tauri. Cualquier verificación que requiera env vars de Firebase/OAuth se pospuso para el PC personal.

---

## 1. Objetivo

Dos metas ligadas, no separables:

1. **Privatizar** el repo `sebasgc0399/SecondMind` en GitHub.
2. **Mantener el Tauri auto-updater funcionando** en cualquier PC donde la app desktop esté instalada — sin requerir que esa PC tenga el proyecto clonado o credenciales de GitHub.

## 2. Problema y por qué esto merece ser feature (no edición puntual)

Hoy el Tauri updater ([src-tauri/tauri.conf.json:66](../../src-tauri/tauri.conf.json#L66)) apunta a:

```
https://github.com/sebasgc0399/SecondMind/releases/latest/download/latest.json
```

Esta URL es pública **exclusivamente porque el repo lo es**. Al privatizar, cualquier request anónimo al endpoint responde 404. El auto-updater falla silenciosamente en todas las instalaciones existentes — una regresión directa de la Feature 8 completada en abril 2026.

La Feature 8 tomó la decisión D1 explícita ([SPEC-feature-8-tauri-auto-updater.md](../features/SPEC-feature-8-tauri-auto-updater.md#L27)):

> **D1** — GitHub Releases para binarios, no Firebase Hosting
> **Razón:** Repo público → assets sin auth. tauri-action genera Release + latest.json automáticamente. Firebase agregaría credenciales CI y upload manual de ~40MB.

Esa justificación deja de ser válida tras privatizar. Este draft es el input para la feature que reemplaza D1 con un host independiente de GitHub.

### Contexto del journey (para registro)

La sesión arrancó con "quiero crear un MIT para este proyecto personal". Iteración rápida descartó cada opción:

- **MIT / permisivas** — contrario al objetivo (autoriza todo).
- **All Rights Reserved sin privatizar** — no impide lectura ni re-implementación; solo el corte físico de acceso (privado) lo hace.
- **BUSL 1.1** — compromete a una change date futura; overhead sin ambición comercial.
- **PolyForm Noncommercial** — otorga derechos de uso no-comercial a terceros; complica relicenciar.
- **Dos repos (showcase público + código privado)** — duplica narrativa; la app viva en `secondmind.web.app` ya es mejor showcase.
- **Git submodule (sub-repo privado dentro de repo público)** — DX mala; rompe paths relativos y configs Vite/Firebase.
- **Deshabilitar updater** — pragmática para builds manuales, pero descartada por el requisito definitorio.

El requisito que consolidó la decisión fue: **poder instalar y actualizar la app desktop desde cualquier PC sin tener el proyecto clonado**.

## 3. Decisión preliminar

**Privatizar + mover el endpoint del updater a un host público del propio proyecto `secondmindv1`**, aprovechando que Firebase Hosting (`secondmind.web.app`) y Firebase Storage son ya infraestructura propia, ya autenticada en CI (secret `FIREBASE_SERVICE_ACCOUNT_KEY`), y su disponibilidad pública es independiente de la visibilidad del repo.

Defensa en profundidad que queda después:

- Código privado → nadie puede leer / re-implementar copia exacta.
- 17 secrets en GitHub Secrets encriptados → nadie puede buildear contra `secondmindv1` aunque tuviera el código.
- Binarios firmados con `TAURI_SIGNING_PRIVATE_KEY` → aunque alguien interceptara un binario desde el endpoint público, el updater rechaza cualquier MSI no firmado con la pubkey embebida.

## 4. Implicaciones técnicas identificadas

Profundizar al armar el SPEC formal. Ninguna validada desde esta sesión.

### 4.1. Tauri updater — nuevo endpoint

Archivos que la feature tocará:

- [src-tauri/tauri.conf.json:54-67](../../src-tauri/tauri.conf.json#L54-L67) — `createUpdaterArtifacts`, `updater.endpoints[]`, `updater.pubkey`. Cambia URL del endpoint.
- [src-tauri/src/lib.rs:26](../../src-tauri/src/lib.rs#L26) — `.plugin(tauri_plugin_updater::Builder::new().build())` se mantiene.
- [src-tauri/capabilities/default.json:20](../../src-tauri/capabilities/default.json#L20) — `updater:default` se mantiene.
- [src-tauri/Cargo.toml:31](../../src-tauri/Cargo.toml#L31) — dep `tauri-plugin-updater` se mantiene.
- `src/hooks/useAutoUpdate.ts` — sin cambios (el hook no conoce la URL, la resuelve el plugin).
- [src-tauri/src/tray.rs:146](../../src-tauri/src/tray.rs#L146) — solo comentario, ignorar.

Candidatos de host (el SPEC formal debe elegir uno):

| Opción                                                   | Pro                                                                             | Contra                                                                                                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Firebase Hosting** (`secondmind.web.app/updater/…`) | Ya público, URLs fijas simples, CDN gratis                                      | Hosting tiene límites de tamaño por archivo (verificar: MSI + NSIS + APK pueden superar), diseñado para assets web, no binarios grandes               |
| **B. Firebase Storage** con reglas públicas              | Infra existente, SDK en CI disponible, URLs `storage.googleapis.com/…` estables | Requiere ajustar `storage.rules` para permitir reads anónimos del bucket de releases; validar que no contamine reglas existentes del bucket principal |
| **C. GCS bucket separado**                               | Aislado del resto del proyecto                                                  | Proveedor nuevo para provisionar, sin reusar la integración Firebase ya hecha                                                                         |

Recomendación tentativa: **B (Firebase Storage)** con un bucket o prefijo dedicado (`releases/`). Validar en casa los límites reales y el estado de `storage.rules`.

### 4.2. GitHub Actions `release.yml`

Archivo: [.github/workflows/release.yml](../../.github/workflows/release.yml)

Hoy [línea 62](../../.github/workflows/release.yml#L62) tiene `includeUpdaterJson: true` que sube `latest.json` al GitHub Release (tauri-action). Tras privatizar el repo, ese Release queda tras login; la URL de download rompe.

Cambio requerido al workflow: agregar step nuevo que **suba `latest.json` + los binarios** al host público elegido (Storage o Hosting), usando el secret ya existente `FIREBASE_SERVICE_ACCOUNT_KEY`.

Decisión abierta para el SPEC: ¿mantener también la subida al GitHub Release privado (backup interno) o eliminar `includeUpdaterJson`? Recomendación: **mantener** — el GitHub Release privado sirve como histórico para Sebastián; no cuesta nada.

Reaprovechable: el patrón de "generate `.env.production` en step previo" consolidado tras **Bug C de Feature 8** ([SPEC-feature-8-tauri-auto-updater.md](../features/SPEC-feature-8-tauri-auto-updater.md#L43)) — la feature nueva no requiere re-aplicarlo, pero está ahí como antecedente del porqué tauri-action tiene ese patrón peculiar.

### 4.3. Android / Capacitor — no afectado

[release.yml:64-172](../../.github/workflows/release.yml#L64-L172) sube el APK a **Firebase App Distribution**, no al GitHub Release. El auto-update de Android vive en App Distribution (requiere login de Sebastián como miembro del group `owner`). Sin cambios.

Pregunta abierta tangencial: cuando quiera distribuir a terceros (beta testers), App Distribution escala. No hay acción aquí.

### 4.4. Secrets de GitHub — confirmados, sin acción

Lista de 17 secrets validada contra el workflow. Matchea exactamente lo que `release.yml` consume:

- **Android (5):** `ANDROID_GOOGLE_SERVICES_JSON_BASE64`, `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`
- **Firebase distribución (2):** `FIREBASE_ANDROID_APP_ID`, `FIREBASE_SERVICE_ACCOUNT_KEY`
- **Tauri signing (2):** `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- **Vite Firebase (7):** `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_MEASUREMENT_ID`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`
- **Google OAuth (1):** `VITE_GOOGLE_WEB_CLIENT_ID`

Los secrets son encriptados y su existencia es independiente de la visibilidad del repo. Privatizar no los afecta; el workflow los consume igual.

### 4.5. Inconsistencia a investigar en PC personal

[.env.example:10-11](../../.env.example#L10-L11) declara `VITE_GOOGLE_OAUTH_CLIENT_ID` y `VITE_GOOGLE_OAUTH_CLIENT_SECRET` (para el flow OAuth Desktop de Tauri, implementado en F6 de Fase 5.1), pero:

- NO aparecen en la lista de GitHub Secrets confirmada (solo aparece `VITE_GOOGLE_WEB_CLIENT_ID` para el flow mobile/web).
- NO se inyectan al `.env.production` del step "Generate .env.production for Vite" en [release.yml:39-48](../../.github/workflows/release.yml#L39-L48).

Hipótesis 1: los releases MSI/NSIS no necesitan esos valores en runtime porque el flow OAuth Desktop los lee de otro lado en producción. Hipótesis 2: bug real — los builds de release tienen OAuth Desktop roto; solo builds locales funcionan porque `.env.local` sí los contiene.

**Desde el PC empresa no se puede validar.** El `.env.local` de aquí no refleja la config real. Pendiente investigar en PC personal — si es bug real, es scope pre-privatización (si los releases tienen OAuth Desktop roto, los usuarios ya sufren esto hoy, pero privatizar lo haría más visible al testear el flow de updates).

### 4.6. Historia pública ya indexada — no-reversible

396 commits estuvieron públicos desde la creación del repo. Caches de GitHub search, Google, archive.org pueden tener copias. Forks existentes (revisar https://github.com/sebasgc0399/SecondMind/network/members antes de privatizar) no se privatizan retroactivamente.

Aceptado, sin acción. Mencionar en el SPEC solo como nota.

### 4.7. README — sin cambios

[README.md](../../README.md) asume visibilidad pública (instrucciones `git clone` línea 102-104, sección "Distribución"). Tras privatizar nadie externo lo lee.

Decisión para el SPEC: **dejar el README como está**. Inversión valiosa como memoria interna del proyecto, cero retorno de simplificarlo. Si en el futuro molesta, se reduce.

## 5. Preguntas abiertas que el SPEC formal debe resolver

1. **Host del updater** — Firebase Hosting vs Storage. Medir tamaño real de los binarios del último release (MSI + NSIS) y chequear límites de Hosting (archivo individual y bucket total).
2. **Estructura de URLs** — ej. `releases/{version}/latest.json` + `releases/{version}/SecondMind_x64_en-US.msi`. Pero `latest.json` necesita URL FIJA para que el updater la resuelva — probablemente `releases/latest.json` en la raíz, con contenido que apunte a la versión actual.
3. **Versión dentro del `latest.json`** — tauri-action ya la genera desde el tag git. Al cambiar de endpoint no cambia la lógica de generación, solo destino.
4. **Firmas Tauri** — los `.sig` generados para cada binario (ed25519, `TAURI_SIGNING_PRIVATE_KEY`) deben vivir al lado de los binarios en el nuevo host. El `latest.json` referencia las URLs de los `.sig`. Confirmar que el cambio de host actualiza consistentemente URLs del binario Y del `.sig`.
5. **Retención** — ¿borrar versiones viejas de Storage o acumular? Sin usuarios externos, acumular es más seguro (permite downgrade). Decidir umbral de cleanup.
6. **Orden de ejecución crítico** — primero implementar el endpoint nuevo con repo AÚN público, testear 2 releases consecutivos (baseline + upgrade) verificando que la transición aplica, y **recién después** privatizar. Privatizar antes rompería updates de todas las instalaciones existentes durante la ventana de transición.
7. **Storage rules** — si se usa Firebase Storage, agregar reglas para read público del prefijo `releases/` sin afectar el resto. Revisar `storage.rules` actual.
8. **Inconsistencia de OAuth Desktop secrets** (§4.5) — investigar y decidir si se fixea en esta feature o en otra.
9. **Versionado del endpoint** — ¿seguir `v1Compatible` de tauri-action? Gotcha histórico de F8 Bug A: `createUpdaterArtifacts` solo acepta `true | false | "v1Compatible"`.

## 6. Pasos sugeridos para el SPEC formal

Propuesta de estructura F1..Fn para cuando Sebastián arme el SPEC en casa:

- **F1 — Diseño del host y storage rules:** decidir Hosting vs Storage, medir tamaños, definir estructura de URLs, ajustar `storage.rules` si aplica.
- **F2 — Workflow: step de publicación al nuevo host:** extender `release.yml` con job/step que sube `latest.json` + `.msi` + `.nsis` + `.sig` al nuevo host usando `FIREBASE_SERVICE_ACCOUNT_KEY`.
- **F3 — Actualizar `tauri.conf.json` al nuevo endpoint:** cambiar URL de `updater.endpoints[]`.
- **F4 — Validación pre-privatización:** cortar tag `v0.1.X` con repo aún público; instalar MSI v0.1.X; cortar tag `v0.1.(X+1)`; verificar que la app v0.1.X detecta y aplica el update desde el nuevo host.
- **F5 — Privatizar repo en la UI de GitHub** (acción manual del usuario, no en código):
  - Pre-check: https://github.com/sebasgc0399/SecondMind/network/members — lista de forks existentes.
  - Settings → Change visibility → Private → confirmar tipeando nombre del repo.
  - Post-check: abrir repo en incógnito → 404.
- **F6 — Validación post-privatización:** cortar tag `v0.1.(X+2)`; verificar que la app v0.1.(X+1) instalada detecta y aplica el update desde el nuevo host (con el repo ya privado).
- **F7 (opcional) — Cleanup workflow del GitHub Release:** si se decide eliminar `includeUpdaterJson: true`, hacerlo acá; si no, terminar acá.

## 7. Qué NO es esta feature

- **No** es una decisión sobre LICENSE — se descartó agregar una licencia, no aporta protección real con repo privado.
- **No** reemplaza ni afecta al auto-update de Android / Capacitor — Firebase App Distribution sigue igual.
- **No** toca `README.md` ni `Docs/` salvo que el SPEC formal decida lo contrario.
- **No** cubre limpiar la historia pública cacheada — imposible.
- **No** cubre el OAuth Desktop secrets (§4.5) salvo que el SPEC decida incluirlo.

## 8. Input para el SPEC

Al abrir Claude Code en el PC personal:

1. Leer este DRAFT y [SPEC-feature-8-tauri-auto-updater.md](../features/SPEC-feature-8-tauri-auto-updater.md) como base.
2. Medir el tamaño de los binarios del último release desde `src-tauri/target/release/bundle/` (si existe) o descargándolos del GitHub Release actual.
3. Validar §4.5 — revisar `.env.local` local para ver si `VITE_GOOGLE_OAUTH_CLIENT_ID` está seteado y funciona en release builds.
4. Revisar el archivo `storage.rules` del proyecto Firebase para planear el cambio en §F1.
5. Armar `Spec/features/SPEC-feature-N-privatizar-repo-updater-firebase.md` con el template del proyecto — Objetivo, F1..Fn con criterio de done y archivos a tocar, Decisiones clave, Orden, Checklist.
6. **Eliminar este archivo DRAFT** una vez el SPEC formal está commiteado, para evitar dos fuentes de verdad.
