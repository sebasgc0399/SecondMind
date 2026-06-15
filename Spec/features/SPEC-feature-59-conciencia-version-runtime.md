# SPEC — Feature 59: Conciencia de versión en runtime unificada (+ modal what's-new)

> **Estado:** Pendiente — a implementar. Branch `feat/version-awareness` creada desde `main` esta sesión. SPEC en revisión ANTES de cualquier código.
> **Alcance:** Un accessor único `getRunningVersion()` que devuelve la versión que está corriendo de forma uniforme en los 3 frentes (web/PWA, Tauri, Android/Capacitor), y sus dos consumidores: (1) `AppInfoSection` extendido a los 3 frentes, (2) un modal what's-new one-time por versión, catalog-driven. **FUERA de alcance (YAGNI, diferido):** sección consultable de historial de versiones en Settings, badge de "novedades", acumulación de versiones saltadas, fetch del body del GitHub Release.
> **Dependencias:** Ninguna bloqueante — toda la infra existe (i18n SPEC-58, preferences F36.F8, patrón `WelcomeModal` F49, `version_check.rs` F36). `@capacitor/app@8.1.0` ya instalado.
> **Estimado:** ~1 sesión de dev (no compromiso). Frente A es el grueso; B/C son aditivos sobre patrones existentes.
> **Versión:** la feature **no bumpea** versión de producto por sí sola; se libera en un release futuro. La **primera entrada de catálogo** apunta a `0.6.0` (beta) — si el merge coincide con el release `0.6.0`, la entrada `v060` se autorea en ese momento (D6).
> **Stack relevante:** Vite `define` (build-time, web), `@tauri-apps/api/app::getVersion()` (Tauri, ya usado), `@capacitor/app::App.getInfo()` (Android, ya instalado — sin dep nueva), `@base-ui/react` Dialog (modal), i18next (catálogo bilingüe).
> **Tipo:** feature. Single-concern: conciencia de versión en runtime; el modal es el primer consumidor, no el objetivo.
> **Gotchas vigentes:** [`Spec/gotchas/pwa-offline.md`](../gotchas/pwa-offline.md) (heading "El SW no debe registrarse en native…", donde vive la nota de remoción de `__APP_VERSION__`/`useVersionCheck`) · [`Spec/gotchas/tinybase-firestore.md`](../gotchas/tinybase-firestore.md) (§ Schema versioning de preferences).

---

## Objetivo

Hoy la app **no tiene una forma uniforme de saber qué versión está corriendo**: solo Tauri lee su versión en runtime (`getVersion()` en `AppInfoSection`, que retorna `null` en los otros dos frentes); web no conoce su número de versión (el `define __APP_VERSION__` fue removido en `e349bcf`) y Android nunca lo leyó desde el frontend. Al cerrar esta feature existirá **un solo accessor** (`getRunningVersion()`) que devuelve la versión corriendo en cualquiera de los 3 frentes, `AppInfoSection` mostrará versión + plataforma en los tres, y los usuarios verán **un modal "Novedades" una sola vez** tras actualizar a una versión que tenga entrada de catálogo (bilingüe, en el repo).

---

## Contexto / punto de partida (verificado en código esta sesión)

- **No hay accessor unificado.** 3 lecturas distintas y solo Tauri lee en runtime:
  - Tauri: `AppInfoSection.tsx:16-19` → `const { getVersion } = await import('@tauri-apps/api/app'); const v = await getVersion();`. Todo el componente retorna `null` si `!isTauri()` (`AppInfoSection.tsx:22`).
  - Web/PWA: **no lee versión**. `__APP_VERSION__` removido en `e349bcf` (`vite.config.ts -6`, `src/vite-env.d.ts -2`). Grep `__APP_VERSION__` en `src/` → 0 matches; grep `define\s*:` en `vite.config.ts` → sin matches.
  - Android: `versionName`/`versionCode` tag-derived por CI (`android/app/build.gradle:6-7`); el frontend **no los lee**.
- **`@capacitor/app@8.1.0` YA instalado** (`package.json:29`) y sincronizado en Android (`android/app/src/main/assets/capacitor.plugins.json`). `App.getInfo()` → `{ name, id, build, version }`. **NO se importa en `src/` todavía** — es el hueco a llenar. **No es dep nueva.**
- **Guards de plataforma puros, listos:** `isCapacitor()` (`src/lib/capacitor.ts:3-5`, `Capacitor.isNativePlatform()` → true solo en Android nativo), `isTauri()` (`src/lib/tauri.ts:1-3`, `'__TAURI_INTERNALS__' in window`). Convención: early-return `if (!isX()) return`.
- **`vite-plugin-pwa` modo `prompt`** (`vite.config.ts:17`) + `skipWaiting:false` (`:62`) + `clientsClaim:false` (`:63`): el SW viejo sigue sirviendo el bundle hasta que el usuario acepta el update y la página recarga. El reload real vive en `useSwUpdate.ts:64-75` (`applyUpdate` → `updateServiceWorker(true)`), disparado por `UpdateBanner` → `useFlushThenUpdate`. **Esto justifica que la versión se lea DESPUÉS del reload** (ver D1).
- **Familia de overlays globales** en `src/app/layout.tsx:166-170` (`QuickCapture`, `ShareIntentMount`, `CommandPalette`, `InstallPrompt`, `WelcomeModal`), dentro del `return` final post-gates (splash + auth + verify). `WelcomeModal` (`:170`) es el análogo más cercano: modal one-shot, sin props, auto-open en `useEffect` post-hidratación con `autoOpenedRef` (`WelcomeModal.tsx:53-59`), gateado por flag en preferences (`onboardingWelcomeSeen`).
- **Preferences:** `UserPreferences` en `src/types/preferences.ts`; `parsePrefs` (`src/lib/preferences.ts:67-97`) hace parse defensivo de campos aditivos (`locale`, `onboarding*`, `splitPaneLayout`) **sin bumpear** `PREFERENCES_SCHEMA_VERSION` (`src/lib/preferences.ts:17` = `1`). Path Firestore `users/{uid}/settings/preferences`.
- **i18n:** catálogo `src/locales/{es,en}/translation.json`, namespace único `translation`, `keySeparator '.'`, consumido con `t()` (`react-i18next`). Tipos auto-generados en `src/types/resources.d.ts`. **Regenerar tipos = `i18next-cli types` + `prettier --write src/types/resources.d.ts`. NUNCA `i18next-cli extract` para cambios de copy (purga keys).**
- **Versiones hoy:** `0.5.1` (consenso `package.json:4`, `Cargo.toml:3`, `tauri.conf.json:5`). Beta `0.6.0` = próxima entrada del roadmap, **aún no liberada** (`ESTADO-ACTUAL.md:18`). La **primera entrada de catálogo apuntaría a `0.6.0`**.

---

## Decididas en revisión

> Los 2 puntos que quedaban abiertos los resolvió Sebastián en la revisión del SPEC; quedan promovidos a decisiones formales (no hay puntos abiertos pendientes):

1. **Supresión en primer arranque de usuario nuevo → D9.** Suprimir el modal si `lastSeenVersion === null` **y** `onboardingWelcomeSeen === false` (instalación nueva). Wireado en F6, con caso E2E activo.
2. **Lista de items en i18n → `returnObjects`.** `t('changelog.<key>.items', { returnObjects: true }) as string[]` (ver D6 + § Definiciones técnicas); fallback a keys indexadas SOLO si `returnObjects` queda no-funcional. No bloquea.

---

## Decisiones

| #      | Decisión                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Estado                                                                             |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **D1** | **Accessor `getRunningVersion(): Promise<string>`** con branching `isCapacitor()` → `isTauri()` → web. Web reintroduce el `define __APP_VERSION__` (build-time). **Justificación anti-regresión:** el `useVersionCheck` removido leía la versión para **detectar** un update (circular: bundle viejo reporta versión vieja). Acá se lee **después** de que el SW activó el bundle nuevo (post-reload del `UpdateBanner`), para **saber qué notas mostrar**, no para detectar el update. Timing invertido → correcto. | Cerrada (Sebastián). Justificación se escala como gotcha en `pwa-offline.md` (F7). |
| **D2** | **`AppInfoSection` extendido a los 3 frentes** como consumidor secundario del accessor (hoy solo Tauri). EN scope.                                                                                                                                                                                                                                                                                                                                                                                                   | Cerrada (Sebastián).                                                               |
| **D3** | **Persistencia: campo `lastSeenVersion: string \| null`** en `UserPreferences`, default `null`, **aditivo**, parse defensivo en `parsePrefs`, **SIN bumpear** `PREFERENCES_SCHEMA_VERSION` (mismo criterio que `locale`/`onboarding*`).                                                                                                                                                                                                                                                                              | Cerrada (Sebastián). Sentinel anti-bump en `preferences.test.ts` (F4).             |
| **D4** | **Trigger catalog-driven:** en boot, si `currentVersion !== lastSeenVersion` → buscar entrada de catálogo para `currentVersion`; si existe → modal; si no existe → avanzar `lastSeenVersion` en silencio. **Igualdad de string, SIN semver compare.** MVP muestra solo notas de la versión actual (no acumula saltadas). Dismiss → `lastSeenVersion = currentVersion`.                                                                                                                                               | Cerrada (Sebastián). Excepción de instalación nueva = D9.                          |
| **D5** | **Sin anti-flash.** Modal = overlay post-paint que espera a que resuelvan versión (async en native) **y** `lastSeenVersion` (async Firestore, `isLoaded`) y aparece después. Sin gate síncrono pre-render.                                                                                                                                                                                                                                                                                                           | Cerrada (Sebastián). Calca patrón `WelcomeModal`.                                  |
| **D6** | **Contenido = catálogo bilingüe en el repo**, keys bajo namespace `translation` con prefijo `changelog.<key>.*`, es + en, consumido con `t()`. Se autorea junto al GitHub Release pero **vive en el repo** (NO Firestore, NO fetch del Release body).                                                                                                                                                                                                                                                                | Cerrada (Sebastián). Lista de items vía `returnObjects` (Definiciones técnicas).   |
| **D7** | **UX MVP = solo modal one-time** con `@base-ui/react` Dialog, montado en `Layout` junto a la familia `WelcomeModal`/overlays. **Diferir** historial consultable + badge (YAGNI hasta evidencia).                                                                                                                                                                                                                                                                                                                     | Cerrada (Sebastián).                                                               |
| **D8** | **Normalización de key de versión.** `keySeparator` es `'.'`, así que la versión `0.6.0` no puede ser segmento de key (anidaría `0→6→0`). El registry de catálogo mapea `version: '0.6.0'` → `key: 'v060'`. El accessor compara contra el `version` crudo; el i18n usa el `key` normalizado.                                                                                                                                                                                                                         | Decisión del SPEC (deriva de D6 + `keySeparator '.'`).                             |
| **D9** | **Supresión en primer arranque de usuario nuevo.** Si `lastSeenVersion === null` **y** `onboardingWelcomeSeen === false` → avanzar `lastSeenVersion` en silencio, sin modal. Discrimina "null por instalación nueva" (welcome sin ver → suprimir) de "null por campo nuevo en usuario establecido" (welcome ya visto → mostrar la entrada inaugural `0.6.0`; sin esto, ningún usuario actual la vería). Garantiza que `WhatsNewModal` y `WelcomeModal` sean mutuamente excluyentes.                                  | Cerrada (Sebastián, en revisión del SPEC). Wireada en F6.                          |

---

## Sub-features

### Frente A — Accessor unificado de versión (el núcleo)

#### F1 — Reintroducir el `define __APP_VERSION__` build-time (web)

- **Qué:** reponer en `vite.config.ts` las 3 piezas removidas en `e349bcf` y el `declare` en `src/vite-env.d.ts`, para que la build web tenga la versión de `package.json` embebida como constante.
- **Criterio de done:**
  - [ ] `vite.config.ts` tiene de vuelta: `import { readFileSync } from 'node:fs'` (junto al import de `path`, L1), `const pkg = JSON.parse(readFileSync('./package.json','utf-8')) as { version: string }` (nivel módulo, antes del comentario `// https://vite.dev/config/`), y el bloque `define: { __APP_VERSION__: JSON.stringify(pkg.version) }` como key de primer nivel **entre `envPrefix` (L13) y `plugins` (L14)**.
  - [ ] `src/vite-env.d.ts` tiene `declare const __APP_VERSION__: string;` (debajo del `/// <reference types="vite/client" />`).
  - [ ] `tsc -b` compila; `__APP_VERSION__` resuelve al valor de `package.json` en build y en dev server.
- **Archivos:** `vite.config.ts`, `src/vite-env.d.ts`.
- **Notas:** NO usar esta constante para detectar updates (ese fue el error self-defeating de `useVersionCheck`); solo como dato de "qué bundle está corriendo ahora". Bajo `prompt`+`skipWaiting:false`, refleja el bundle servido por el SW activo — que es exactamente lo que queremos leer **post-reload**. Ver gotcha en F7.

#### F2 — Accessor `getRunningVersion()` (`src/lib/version.ts` — nuevo)

- **Qué:** helper único, async, con branching de plataforma; sibling de `capacitor.ts`/`tauri.ts`.
- **Criterio de done:**
  - [ ] `export async function getRunningVersion(): Promise<string>` con orden: `if (isCapacitor())` → `App.getInfo().version`; `if (isTauri())` → `getVersion()`; else → `__APP_VERSION__`.
  - [ ] Import de Tauri es **dinámico** (`await import('@tauri-apps/api/app')`) como en `AppInfoSection.tsx:16` (no romper el bundle web). Import de `@capacitor/app` puede ser estático o dinámico — elegir el patrón que no infle el bundle web (preferir dinámico, espeja `useShareIntent`).
  - [ ] Devuelve un string no vacío en cada frente (Android: `version` de `getInfo()`; Tauri: versión de `tauri.conf.json` vía `getVersion()`; web: `__APP_VERSION__`).
  - [ ] Test unit con `isCapacitor`/`isTauri` mockeados cubre las 3 ramas.
- **Archivos:** `src/lib/version.ts` (**nuevo**), `src/lib/version.test.ts` (**nuevo**).
- **Notas:** firma **async** y orden del branching (`isCapacitor()` primero) → razón en § Definiciones técnicas. **Fail-safe:** si la promesa rechaza (import dinámico falla, `getInfo()` error), el consumidor trata la versión como "desconocida" y hace no-op, sin crash (ver F6).

#### F3 — `AppInfoSection` en los 3 frentes (consumidor secundario)

- **Qué:** que la sección "Versión y plataforma" de Settings muestre versión + plataforma en web, Tauri y Android (hoy retorna `null` salvo Tauri).
- **Criterio de done:**
  - [ ] Se elimina el `if (!isTauri()) return null` (`AppInfoSection.tsx:22`); el componente renderiza siempre.
  - [ ] La versión sale de `getRunningVersion()` (no del import directo de Tauri).
  - [ ] Muestra la plataforma: Android (`isCapacitor`), Escritorio (`isTauri`), Web (else), con su label i18n.
  - [ ] Web: muestra `0.5.1` (o la que esté en `package.json`); Tauri: la del binario; Android: la del APK.
- **Archivos:** `src/components/settings/AppInfoSection.tsx`, `src/locales/{es,en}/translation.json` (labels de plataforma).
- **Notas:** el valor web proviene de `__APP_VERSION__` (F1, build-time), NO de lectura runtime — **F3 depende de F1**. Mantener el estado de carga (`version === null` mientras resuelve la promesa) y **preservar** la lógica solo-Tauri de "check de actualización" (`handleCheck` → `CHECK_UPDATES_EVENT`, `AppInfoSection.tsx:24-32`) detrás de su propio `isTauri()` — no romperla al generalizar el render.

### Frente B — Persistencia

#### F4 — Campo `lastSeenVersion` en `UserPreferences` (aditivo, sin bump)

- **Qué:** agregar `lastSeenVersion: string | null` al type, default `null`, parse defensivo, sin tocar `PREFERENCES_SCHEMA_VERSION`.
- **Criterio de done:**
  - [ ] `UserPreferences` (`src/types/preferences.ts`) tiene `lastSeenVersion: string | null` con comentario explicando que es aditivo (no bumpea schema, criterio `locale`/`onboarding*`).
  - [ ] `DEFAULT_PREFERENCES.lastSeenVersion = null`.
  - [ ] `parsePrefs` (`src/lib/preferences.ts`) parsea defensivo: `typeof data?.lastSeenVersion === 'string' ? data.lastSeenVersion : null`.
  - [ ] `PREFERENCES_SCHEMA_VERSION` sigue en `1` (sin cambios).
  - [ ] Test en `preferences.test.ts`: parse de `lastSeenVersion` (string válido, ausente→null, tipo inválido→null) **y** sentinel que falla si `PREFERENCES_SCHEMA_VERSION !== 1`.
- **Archivos:** `src/types/preferences.ts`, `src/lib/preferences.ts`, `src/lib/preferences.test.ts`.
- **Notas:** la escritura usa `setPreferences(uid, { lastSeenVersion })` existente = `setDoc` directo (merge) a `users/{uid}/settings/preferences` (inyecta `_schemaVersion`), **NO** la capa offline de TinyBase. Offline: un `lastSeenVersion` no persistido es benigno (peor caso: el modal reaparece una vez al volver online) → sin manejo especial.

### Frente C — Modal what's-new (primer consumidor)

#### F5 — Catálogo bilingüe (registry + i18n)

- **Qué:** un registry tipado de versiones-con-entrada + las keys i18n con el contenido es/en.
- **Criterio de done:**
  - [ ] `src/lib/changelog.ts` (**nuevo**) exporta `CHANGELOG_ENTRIES: ReadonlyArray<{ version: string; key: string }>` ordenado, p. ej. `[{ version: '0.6.0', key: 'v060' }]`, y un helper `findChangelogEntry(version: string)` que hace `find(e => e.version === version)`.
  - [ ] `src/locales/es/translation.json` y `en/translation.json` tienen `changelog.v060.title`, `changelog.v060.items` (array, consumido con `t(..., { returnObjects: true }) as string[]` — D6) y el chrome del modal (`changelog.dismiss`), en ambos idiomas.
  - [ ] Tipos regenerados con `i18next-cli types` + `prettier --write src/types/resources.d.ts` (NUNCA `extract`).
  - [ ] `npm run lint` y `tsc -b` verdes con las nuevas keys tipadas.
- **Archivos:** `src/lib/changelog.ts` (**nuevo**), `src/locales/es/translation.json`, `src/locales/en/translation.json`, `src/types/resources.d.ts` (regenerado), `src/lib/changelog.test.ts` (**nuevo**).
- **Notas:** las keys i18n usan el `key` normalizado (`v060`), no la versión cruda (`0.6.0`), por el `keySeparator '.'` (D8). El registry es la fuente de verdad de "¿existe entrada?"; i18n es solo el contenido. Mecánica de la lista de items → D6 / § Definiciones técnicas.

#### F6 — `WhatsNewModal` + hook de elegibilidad, montado en Layout

- **Qué:** modal one-time que aparece tras actualizar a una versión con entrada de catálogo; calca el patrón `WelcomeModal`.
- **Criterio de done:**
  - [ ] `useWhatsNew()` (`src/hooks/useWhatsNew.ts`, **nuevo**): resuelve `getRunningVersion()` + lee `preferences.lastSeenVersion` y `preferences.onboardingWelcomeSeen` vía `usePreferences`; **solo evalúa cuando `isLoaded === true`** (preferences hidratadas) y la versión resolvió. Si `currentVersion !== lastSeenVersion`: **(D9) si `lastSeenVersion === null && onboardingWelcomeSeen === false` (instalación nueva) → silent-advance sin modal**; si no, si `findChangelogEntry(currentVersion)` existe → `open=true` con la entry; si no → silent-advance. El silent-advance hace `setPreferences({ lastSeenVersion: currentVersion })`. Usa un ref de sesión que cubra AMBAS ramas (ver Notas).
  - [ ] `WhatsNewModal` (`src/components/changelog/WhatsNewModal.tsx`, **nuevo**): sin props; usa `useWhatsNew()`; renderiza el Dialog de `@base-ui/react` (`import { Dialog } from '@base-ui/react/dialog'`, subpath `/dialog` como `WelcomeModal.tsx:2`; `Dialog.Root/Portal/Backdrop/Popup`) con `t('changelog.<key>.title')` + items; dismiss → `setPreferences({ lastSeenVersion: currentVersion })` + cierra.
  - [ ] Montado en `src/app/layout.tsx` en el grupo de overlays (junto a `WelcomeModal`, ~L170), NO entre los banners in-flow (L140-141).
  - [ ] Modal NO aparece durante el splash ni a usuarios no autenticados/no verificados (hereda los gates del `return` final del Layout).
  - [ ] Contenido cambia con el locale activo (es/en) sin reload (vía `t()` reactivo).
- **Archivos:** `src/hooks/useWhatsNew.ts` (**nuevo**), `src/components/changelog/WhatsNewModal.tsx` (**nuevo**), `src/app/layout.tsx` (montaje).
- **Notas:**
  - **Gatear en `isLoaded`** es crítico: si se evalúa sobre el default `null` antes de que Firestore resuelva, podría abrir el modal y luego llegar el valor real → flicker.
  - **Ref de sesión sobre AMBAS ramas (no solo el open):** un único ref "ya manejé esta versión en esta sesión" que cubra tanto abrir el modal como el silent-advance, para que el `setPreferences({ lastSeenVersion })` silencioso no se dispare varias veces antes de que converja el snapshot de Firestore (writes redundantes).
  - **Fail-safe de versión:** si `getRunningVersion()` rechaza, "versión desconocida" = no-op (NO modal, NO write, NO crash).
  - **Mutua exclusión con `WelcomeModal` (D9):** la supresión en instalación nueva garantiza que what's-new y welcome no se solapen en el primer arranque.
  - El `set-state-in-effect` post-hidratación lleva el mismo `eslint-disable` documentado que `WelcomeModal.tsx:53-59`.

### Frente D — Cierre

#### F7 — Verificación E2E + escalación de gotchas + ESTADO-ACTUAL

- **Qué:** correr la matriz E2E, escalar el gotcha de D1 y sincronizar docs (step 8 SDD).
- **Criterio de done:**
  - [ ] Matriz E2E ejecutada (ver § Verificación E2E) con resultado registrado.
  - [ ] Gotcha de la justificación del `define` reintroducido escalado a `Spec/gotchas/pwa-offline.md`, al lado de la nota de remoción de `__APP_VERSION__` (heading "El SW no debe registrarse en native…"). Regla: "leer la versión POST-reload para mostrar notas ≠ leerla para detectar update; lo segundo es self-defeating bajo SW `prompt`".
  - [ ] **Fix del índice desincronizado:** el índice `Spec/ESTADO-ACTUAL.md` § "Gotchas por dominio" omite el bullet del heading "SW en native" de `pwa-offline.md` (donde vive la nota de `__APP_VERSION__`). Re-contar contra el archivo (no hardcodear el total) y reponer ese bullet al agregar el nuevo.
  - [ ] `ESTADO-ACTUAL.md` actualizado: línea de la feature 59 (1-2 líneas + pointer a este SPEC) e índice de gotchas.
- **Archivos:** `Spec/gotchas/pwa-offline.md`, `Spec/ESTADO-ACTUAL.md`, este SPEC (a registro de implementación al cerrar).
- **Notas:** este SPEC se convierte a registro de implementación con la skill `archive-spec` al cerrar; F7 es el paso de cierre SDD, no toca producción.

---

## Orden de implementación

1. **F1** (define web) → base para la rama web del accessor; sin esto `getRunningVersion()` no compila en web.
2. **F2** (accessor) → núcleo; depende de F1 para la rama web (las ramas native usan APIs ya disponibles).
3. **F3** (AppInfoSection) → consumidor del accessor; depende de F2. Verifica el accessor en los 3 frentes de forma visible/manual.
4. **F4** (lastSeenVersion) → independiente de F1-F3; se puede hacer en paralelo. Requerido por F6.
5. **F5** (catálogo) → independiente; requerido por F6.
6. **F6** (modal) → depende de F2 (versión), F4 (persistencia) y F5 (catálogo). Es el integrador.
7. **F7** (cierre) → último: E2E + gotchas + docs.

---

## Estructura de archivos

```
src/
├── lib/
│   ├── version.ts            # F2 — NUEVO: getRunningVersion() (isCapacitor→isTauri→web)
│   ├── version.test.ts       # F2 — NUEVO: cubre las 3 ramas mockeadas
│   ├── changelog.ts          # F5 — NUEVO: CHANGELOG_ENTRIES + findChangelogEntry
│   └── changelog.test.ts     # F5 — NUEVO
├── hooks/
│   └── useWhatsNew.ts        # F6 — NUEVO: elegibilidad (versión + lastSeenVersion + registry)
└── components/
    └── changelog/
        └── WhatsNewModal.tsx # F6 — NUEVO: base-ui Dialog, patrón WelcomeModal
```

**Modificados:** `vite.config.ts` (F1: define), `src/vite-env.d.ts` (F1: declare), `src/components/settings/AppInfoSection.tsx` (F3: 3 frentes), `src/types/preferences.ts` (F4: campo), `src/lib/preferences.ts` (F4: parsePrefs), `src/lib/preferences.test.ts` (F4: test + sentinel), `src/locales/{es,en}/translation.json` (F3 labels + F5 catálogo), `src/types/resources.d.ts` (F5: regenerado), `src/app/layout.tsx` (F6: montaje), `Spec/gotchas/pwa-offline.md` + `Spec/ESTADO-ACTUAL.md` (F7).

---

## Definiciones técnicas

### Accessor: por qué async y orden del branching

`getRunningVersion()` devuelve `Promise<string>` porque Tauri (`getVersion()`) y Capacitor (`App.getInfo()`) son async; la rama web resuelve síncronamente `__APP_VERSION__` pero se envuelve para uniformar la firma. Orden `isCapacitor()` → `isTauri()` → web: `Capacitor.isNativePlatform()` es true **solo** en Android nativo (false en Tauri/web) y `isTauri()` es false en Android, así que el orden no tiene solape; web es el `else` final.

### Invariante de consenso de versión entre frentes

`getVersion()` (Tauri JS API) lee la versión de `tauri.conf.json` — **no** literalmente `CARGO_PKG_VERSION`; van sincronizadas porque el bump de release toca `package.json` + `Cargo.toml` + `tauri.conf.json` atómicamente (skill `release-ecosystem`), y `versionName` de Android es tag-derived por CI. El trigger por igualdad de string (D4) **descansa en este invariante**: en un release limpio los 3 frentes reportan el mismo string. Si alguna vez divergen (release manual desalineado), el modal podría dispararse de más o de menos. Enlazado al checklist "versión correcta en los 3 frentes".

### Catálogo: registry como fuente de verdad + key normalizada (D8)

El "¿existe entrada para esta versión?" lo responde el **registry** (`CHANGELOG_ENTRIES`), no un `i18n.exists()`: (1) es testeable sin i18n inicializado, (2) evita que la detección dependa del locale activo, (3) desacopla "qué versiones tienen novedades" del contenido. El porqué de la key normalizada `v060` (vs la versión cruda `0.6.0`) → D8.

### Mecánica de la lista de items (D6)

La lista se consume con `t('changelog.<key>.items', { returnObjects: true }) as string[]`, con los items como array en el JSON. La fricción de tipos (cómo `i18next-cli` tipa un array en `resources.d.ts` — tupla `readonly` vs `string[]`) se resuelve **inline en F5 con un cast documentado** (`as string[]` / `as readonly string[]`). Fallback SOLO si `returnObjects` queda no-funcional: keys indexadas `changelog.<key>.items.0/.1/...` (sigue cumpliendo D6). No bloquea el SPEC.

### Flujo del trigger post-update (por qué funciona sin detectar el update)

Tras aceptar el `UpdateBanner`, `useSwUpdate.applyUpdate()` activa el SW nuevo y recarga; el bundle nuevo corre y `__APP_VERSION__` ya es la versión nueva. `lastSeenVersion` (Firestore) sigue en la vieja. `useWhatsNew` (tras `isLoaded`) ve `currentVersion !== lastSeenVersion` → busca entrada → muestra. **No** se compara contra la red ni se "detecta" nada: se lee la versión del bundle **ya activo**. En Tauri/Android no hay SW: la versión nueva está en el binario/APK desde el primer arranque post-update.

---

## Checklist de completado

Al cerrar la feature, TODAS deben ser verdaderas:

- [ ] `npm run lint` + `tsc -b` (build) + `npm test` verdes sobre todo el repo.
- [ ] `getRunningVersion()` devuelve la versión correcta en los 3 frentes (web/Tauri/Android), verificado.
- [ ] `AppInfoSection` muestra versión + plataforma en los 3 frentes.
- [ ] El modal aparece **una sola vez** tras update a una versión CON entrada de catálogo, en web (post-reload), Tauri y Android.
- [ ] Una versión patch SIN entrada de catálogo **no** muestra modal pero **igual** avanza `lastSeenVersion`.
- [ ] `lastSeenVersion` persiste a Firestore (`users/{uid}/settings/preferences`) y sobrevive reload.
- [ ] El contenido del modal cambia con el locale (es/en).
- [ ] **`PREFERENCES_SCHEMA_VERSION` sigue en `1`** (cero bump) — sentinel en `preferences.test.ts` verde.
- [ ] Cero regresión en `WelcomeModal`, `UpdateBanner`, `InstallPrompt` (overlays vecinos).
- [ ] Gotcha de D1 escalado a `pwa-offline.md` + índice de ESTADO-ACTUAL re-sincronizado.

---

## Verificación E2E

Política de datos: emulador preferido; prod (cuenta real) permitido bajo protocolo de CLAUDE.md step 5 (anunciar, revertir+verificar, hard-delete) — el único write mutado acá es `preferences.lastSeenVersion`, revertible. SUNSET en beta 0.6.0.

**Golden path (por frente, versión CON entrada de catálogo `v060`):**

- [ ] **Web:** con build que tenga entrada `0.6.0` y `lastSeenVersion` previo `0.5.1` → reload (post-`UpdateBanner`) → modal aparece; dismiss → `lastSeenVersion='0.6.0'` en Firestore (verificado server-side). Segundo reload → NO reaparece.
- [ ] **Tauri:** update del binario a una versión con entrada → primer arranque → modal. (smoke manual; revertir `lastSeenVersion`.)
- [ ] **Android:** update del APK a una versión con entrada → primer arranque → `App.getInfo().version` correcta → modal. (smoke manual.)

**Edge / regresión:**

- [ ] Versión SIN entrada de catálogo (`currentVersion` no está en `CHANGELOG_ENTRIES`) → NO modal, pero `lastSeenVersion` avanza igual.
- [ ] Locale es ↔ en → el contenido del modal cambia sin reload.
- [ ] Usuario con `lastSeenVersion === currentVersion` → NO modal (caso estable).
- [ ] **Instalación nueva (D9):** usuario nuevo (`lastSeenVersion===null && onboardingWelcomeSeen===false`) → NO modal, avanza en silencio (mutuamente excluyente con `WelcomeModal`).
- [ ] **Usuario establecido con campo nuevo (D9):** `lastSeenVersion===null && onboardingWelcomeSeen===true` y versión actual con entrada de catálogo → SÍ ve la entrada inaugural (`0.6.0`).
- [ ] `AppInfoSection` en los 3 frentes muestra la versión correcta.

`TaskStop` al dev server al terminar.

---

## Siguiente fase

Habilita (diferido, NO en este SPEC): **historial consultable** de versiones en Settings (consumiría el mismo `CHANGELOG_ENTRIES` + i18n) y **badge** de novedades en el nav. Candidatos a evaluar contra evidencia de uso — registrar en `Spec/ESTADO-ACTUAL.md` § Candidatos si se priorizan.
