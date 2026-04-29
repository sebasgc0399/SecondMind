# DRAFT — Cache stale cross-platform + flujo de update sin intervención manual

> **Estado:** DRAFT / discovery — **NO es un SPEC formal**
> **Vida útil:** temporal. Eliminar este archivo al convertirlo en un `SPEC-feature-N-*.md`.
> **Redactado en:** PC personal (sesión Claude Code), 2026-04-29
> **Disparador:** Sebastián reporta que tras cualquier deploy (web-only o release nuevo de desktop/Android), las versiones instaladas siguen sirviendo el bundle viejo. Workaround actual: **Ctrl+Shift+R** en desktop, **"borrar datos"** en Android. Síntoma concreto observado: "no me permite crear ideas" desde la app vieja, sin error visible.

---

## 1. Objetivo

Tres metas ligadas:

1. **Que un deploy a Hosting actualice automáticamente** la PWA, la app Tauri y la app Capacitor sin que el usuario tenga que hard-reload, borrar caché, ni desinstalar.
2. **Que un deploy con cambios incompatibles** (schema de datos, API de Cloud Functions) no rompa silenciosamente al cliente viejo — falle con un mensaje accionable o, mejor, fuerce update antes de operar.
3. **Visibilidad de errores cliente en runtime** desde la app instalada (mobile/desktop), donde hoy no hay devtools accesible. Sin esto no se puede diagnosticar el "no me permite crear ideas".

## 2. Problema y por qué esto merece ser feature (no edición puntual)

El síntoma "no me permite crear ideas" es el caso visible. Debajo hay tres problemas separados, en tres capas distintas, que se manifiestan como uno solo:

**Capa web/PWA — Service Worker mal configurado.**

- [vite.config.ts:16-71](../../vite.config.ts#L16-L71) configura `vite-plugin-pwa` con `registerType: 'autoUpdate'` y `workbox.globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}']`. Esto **precachea index.html y todos los JS/CSS bundled**.
- **NO hay** `skipWaiting: true` ni `clientsClaim: true` en la config de workbox. El SW nuevo se descarga pero queda en estado **`waiting`** hasta que TODOS los tabs/clients del SW viejo se cierren. En PWA standalone (instalada en home screen / Capacitor WebView / Tauri WebView que mantiene sesión) eso prácticamente nunca pasa por sí solo.
- **NO hay llamada a `registerSW()`** con callbacks `onNeedRefresh` / `onOfflineReady` en `src/` (verificado con grep). `autoUpdate` registra el SW automáticamente pero no expone UI al usuario para promover el `waiting` a `active`. Resultado: la versión nueva queda en limbo hasta cierre completo de la app.
- Combinado: el SW viejo sirve `index.html` cacheado → ese HTML referencia bundles JS viejos por hash → el cliente queda atrapado en el snapshot del último deploy que tomó por primera vez.

**Capa CDN — Firebase Hosting sin cache headers explícitos.**

- [firebase.json:14-19](../../firebase.json#L14-L19) define `hosting` sin sección `headers`. Firebase Hosting aplica defaults que cachean assets ~1h, **incluyendo `index.html`**. Esto agrava el problema del SW: incluso si el SW se actualizara correctamente, el navegador puede servir un `index.html` cacheado del CDN.
- Los assets con hash en el nombre (`assets/index-abc123.js`) son seguros de cachear long-term — el bug es específicamente que `index.html` también se cachea.

**Capa nativa — WebView storage no se purga al reinstalar.**

- **Tauri**: WebView2 mantiene su propio directorio de storage en `%LOCALAPPDATA%\com.secondmind.app\EBWebView\` (IndexedDB, localStorage, Service Worker registrations, HTTP cache). Reinstalar el MSI/NSIS **no toca ese directorio** — el SW registrado contra el origen virtual de Tauri sigue vivo, sirviendo bundles viejos al WebView nuevo.
- **Capacitor**: [capacitor.config.ts:8](../../capacitor.config.ts#L8) usa `androidScheme: 'https'` → assets servidos desde `https://localhost` dentro del WebView Android. WebView Android persiste IndexedDB / localStorage / app_webview cache en el data dir de la app. `adb install -r` (reinstall) **no purga** ese data dir. Solo "borrar datos" en Settings lo hace — exactamente el workaround que Sebastián describe.

**Capa de datos — schema sin versionado ni migración.**

- [src/lib/firebase.ts:18](../../src/lib/firebase.ts#L18) usa `getFirestore(app)` sin `initializeFirestore({ localCache: persistentLocalCache(...) })`. En Firebase SDK v10+, el default es `memoryLocalCache` (no persistente). Eso significa que el cache del SDK Firestore **no** es la fuente del problema. ✓
- Pero el proyecto sí persiste estado en otros lugares: TinyBase via custom persister ([src/lib/tinybase.ts](../../src/lib/tinybase.ts)), `saveQueue` con retry y persistencia ([src/lib/saveQueue.ts](../../src/lib/saveQueue.ts)), `preferences` ([src/lib/preferences.ts](../../src/lib/preferences.ts)). Cualquiera de esos almacena rows con shape específico.
- **No hay versionado de schema** declarado para esos almacenes (verificado con grep de `version|migration|schema`). Si la versión nueva del cliente cambia el shape de una `NoteRow` / `TaskRow` y la versión vieja escribió rows en formato anterior, hidratar puede tirar un error silencioso → exactamente el síntoma "no me permite crear ideas, sin error visible".

**Capa de observabilidad — sin remote error reporting.**

- No hay Sentry, Firebase Crashlytics, ni un error reporter custom en `src/`. En desktop se podría abrir devtools en build de dev pero en release NO. En mobile no hay forma de ver errores a menos que se conecte ADB con `chrome://inspect`. Resultado: errores en runtime de la app instalada son invisibles, y diagnosticar problemas reportados por el user requiere reproducir localmente — que muchas veces no replica el estado de cache del user.

Diferencia con un fix puntual: esto NO es un bug en una pantalla, ni un error de validación. Es un patrón sistémico que toca **5 capas independientes** (PWA SW, CDN headers, WebView storage en 2 plataformas, schema de persistencia, observabilidad) y que afecta el ciclo completo deploy → update → uso. Cada capa tiene su propio root cause y su propia mitigación. Merece SPEC formal con varias fases.

### Contexto del journey (para registro)

Sebastián reporta el síntoma en una sola frase: tras cualquier update tiene que (a) Ctrl+Shift+R en desktop, (b) borrar caché y datos en celular. Cuando no lo hace, "no me permite crear ideas" — falla silencioso, sin mensaje. La sesión arrancó por una idea de mejora general, no por un bug específico — Sebastián no podía darme stack trace porque no hay forma de obtenerlo desde la app instalada.

Tras exploración del repo, los root causes se identificaron como una constelación de problemas en distintas capas, no como un bug único. La hipótesis específica del "no me permite crear ideas" más probable, dado lo encontrado, es: el SW viejo sirve un bundle JS desactualizado que apunta a un endpoint Cloud Function (probablemente `processInboxItem` o similar) cuyo schema de input cambió en deploy reciente; el cliente viejo manda payload incompatible; la CF rechaza con error que la UI vieja ni siquiera está preparada para mostrar correctamente. Confirmar requiere tener observabilidad (capa §4.6 de este draft) implementada.

## 3. Decisión preliminar

**Plan en cinco fases, ordenadas por impacto / costo:**

1. **Fase A — Cache headers explícitos en `firebase.json`** (1 archivo, 1 hora). Quita el caching agresivo del CDN sobre `index.html`.
2. **Fase B — Service Worker con update prompt** (vite.config + 1 componente UI nuevo). El SW se actualiza inmediatamente y el usuario ve un prompt "Hay una versión nueva, recargar".
3. **Fase C — Purga de WebView storage en update nativo** (Tauri + Capacitor). Hooks que limpian IndexedDB / localStorage / SW registrations antes de cargar el bundle nuevo, o forzar reload tras detección de versión nueva.
4. **Fase D — Versionado de schema de datos persistidos + migración o purge-on-mismatch** (TinyBase + saveQueue + preferences). Garantiza que un cliente con datos viejos hidrata correctamente o purga + recompone desde Firestore.
5. **Fase E — Remote error reporting** (Sentry o equivalente). Habilita diagnóstico de errores runtime en mobile/desktop sin reproducir localmente.

**Defensa del orden:** A y B son lo más barato y resuelven el 70% del síntoma para usuarios web/PWA. C es necesaria para Tauri/Capacitor. D es la única que ataca el "no me permite crear ideas" en su raíz (incompat de datos persistidos). E es una inversión que se amortiza desde el primer bug post-deploy que no se puede reproducir local.

**Orden alternativo defendible:** ejecutar E primero para tener observabilidad antes de iterar. Tradeoff: E sin A/B/C significa diagnosticar problemas que A/B/C ya hubieran prevenido. Recomendación: A → B → E → C → D, donde E va al medio para validar que A+B mitigaron lo esperado antes de pasar a las capas nativas.

## 4. Implicaciones técnicas identificadas

### 4.1. Firebase Hosting — cache headers explícitos

Archivo: [firebase.json](../../firebase.json)

Agregar sección `headers` que separe assets con hash (cacheables long-term) de archivos navegacionales (`index.html`, manifest, SW):

```json
{
  "hosting": {
    "site": "secondmind",
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }],
    "headers": [
      {
        "source": "**/*.@(js|css|woff2|woff|ttf|otf)",
        "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
      },
      {
        "source": "**/*.@(png|jpg|jpeg|svg|ico|webp)",
        "headers": [{ "key": "Cache-Control", "value": "public, max-age=86400" }]
      },
      {
        "source": "/index.html",
        "headers": [{ "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" }]
      },
      {
        "source": "/sw.js",
        "headers": [{ "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" }]
      },
      {
        "source": "/manifest.webmanifest",
        "headers": [{ "key": "Cache-Control", "value": "no-cache" }]
      }
    ]
  }
}
```

Justificación:

- Assets con hash (`assets/index-abc123.js`): `immutable` + 1 año. Cambian de nombre cuando cambia contenido, son seguros de cachear forever.
- `index.html`: no-cache. Es el único archivo que el browser pide siempre con el mismo nombre y necesita ser fresh para descubrir nuevos hashes.
- `sw.js` y `manifest.webmanifest`: no-cache. El SW debe poder actualizarse en cada navegación.

Decisión D abierta: ¿usar `must-revalidate` o `private` también? `must-revalidate` fuerza al browser a chequear con el server siempre; es lo correcto para `index.html`.

### 4.2. PWA Service Worker — update prompt + skipWaiting

Archivos: [vite.config.ts](../../vite.config.ts), `src/main.tsx`, componente nuevo (ej: `src/components/layout/UpdateBanner.tsx`).

**Cambio en vite.config.ts:**

```ts
VitePWA({
  registerType: 'prompt', // antes: 'autoUpdate'
  // ...
  workbox: {
    // ...
    skipWaiting: false, // explícito: el SW espera prompt
    clientsClaim: false,
    // dejar al user decidir cuándo aplicar via UI
  },
});
```

Cambiar de `autoUpdate` a `prompt` mode: el plugin expone callbacks `onNeedRefresh` / `onOfflineReady` cuando hay versión nueva esperando.

**Registro del SW con UI:**

```ts
// src/main.tsx
import { registerSW } from 'virtual:pwa-register';

const updateSW = registerSW({
  onNeedRefresh() {
    // mostrar UpdateBanner con botón "Actualizar"
    showUpdateBanner(() => updateSW(true));
  },
  onOfflineReady() {
    // log/toast: app lista offline
  },
});
```

**Componente UpdateBanner:**

Banner persistente (sticky bottom, similar al patrón de F32 hidden sidebar) con texto "Hay una nueva versión disponible" + botón "Actualizar ahora". Click → llama `updateSW(true)` que hace `skipWaiting` + reload.

Para PWAs offline-first, también agregar un toast "Listo para usar offline" cuando `onOfflineReady` dispara la primera vez.

Decisión D abierta: ¿permitir auto-aplicar tras N segundos sin interacción del user? Tradeoff: UX vs predictibilidad. Recomendación: NO auto-aplicar (puede romper trabajo en progreso); SÍ marcar el banner como sticky/no-dismissible hasta que el user accione.

### 4.3. Capa nativa — Tauri y Capacitor: detección de versión y reload

**Tauri.**

El plugin updater de Tauri ([src-tauri/tauri.conf.json:64-72](../../src-tauri/tauri.conf.json#L64-L72)) descarga e instala el MSI/NSIS nuevo. Eso renueva el bundle frontend. El problema es que el WebView2 mantiene su storage (incluyendo SW) entre reinstalaciones.

Opciones:

- **(a) Limpiar WebView2 storage en cada update.** En el flow del updater, antes de cargar la nueva versión, eliminar `%LOCALAPPDATA%\com.secondmind.app\EBWebView\Default\Service Worker\` y opcionalmente `IndexedDB\` y `Local Storage\`. Pro: garantiza fresh start. Contra: pierde datos offline locales (si el user tiene saveQueue con writes pendientes que no llegaron a Firestore, se pierden).
- **(b) Detectar versión en boot y purgar selectivamente.** Comparar versión Tauri (`@tauri-apps/api/app::getVersion`) contra una versión guardada en localStorage. Si difieren: borrar SW registrations (vía `navigator.serviceWorker.getRegistrations()` + `.unregister()`), pero preservar IndexedDB / saveQueue. Solo recargar.
- **(c) Modo híbrido:** purgar SW + flush saveQueue antes de purgar IndexedDB. Requiere saveQueue idempotente y flush bloqueante.

Recomendación: **(b)** — purga conservadora del SW (que es el causante del bundle stale), preserva datos del user.

Implementación: hook en `src-tauri/src/lib.rs` o en `main.tsx` que en el primer mount detecta version mismatch y dispara la purga.

**Capacitor.**

Capacitor sirve assets desde el bundle empaquetado al WebView. Reinstalar APK → bundle nuevo. Pero el storage del WebView persiste.

Misma estrategia que Tauri pero con `@capacitor/app::App.getInfo()` para obtener versión. Detectar mismatch → unregister SW + reload.

Plugin custom o uso de `@capacitor/preferences` (ya disponible) para guardar la versión observada.

Decisión D abierta: ¿la "última versión observada" se guarda en (a) localStorage del WebView (puede purgarse con el resto), (b) `@capacitor/preferences` / `@tauri-apps/plugin-store` (sobrevive a la purga). Recomendación: (b), para que la lógica de "esto ya lo purgué" no se pierda en el mismo evento de purga.

### 4.4. Schema versioning de datos persistidos

Archivos a tocar: [src/lib/tinybase.ts](../../src/lib/tinybase.ts), [src/lib/saveQueue.ts](../../src/lib/saveQueue.ts), [src/lib/preferences.ts](../../src/lib/preferences.ts), `src/types/repoRows.ts`.

Hoy ningún store persistido declara su versión. Si el shape de `NoteRow` / `TaskRow` cambia, el código nuevo lee un row con campos faltantes y puede tirar `Cannot read property 'X' of undefined` silenciosamente — exactamente el "no me permite crear ideas".

**Patrón propuesto:**

1. Agregar constante `SCHEMA_VERSION = N` en cada archivo de store / persister / queue.
2. Al hidratar, leer la versión guardada en el storage y comparar contra `SCHEMA_VERSION`.
3. Si mismatch: ejecutar migración registrada (idealmente una función `migrate(oldData, oldVersion, newVersion)`) o, en mínima implementación, **descartar el storage local y rehidratar desde Firestore**.
4. Subir `SCHEMA_VERSION` cuando se cambia el shape.

Para el persister TinyBase Firestore: TinyBase tiene mecanismos nativos (`Schema`) — investigar si los usa y cómo.

Para `saveQueue`: si tiene state persistido (verificar con lectura completa del archivo), aplicar el mismo patrón.

Para `preferences`: usar pattern como `localStorage.setItem('preferences:v2', JSON.stringify(...))` — la clave incluye versión, la versión vieja queda huérfana y se ignora.

Decisión D abierta: **¿migración o purge-on-mismatch?** Migración es más cuidadosa (preserva datos del user) pero requiere escribir y testear funciones de migración por cada cambio. Purge es más simple pero pierde estado offline. Recomendación: **purge-on-mismatch en MVP**, escalando a migración real si el user reporta pérdida de datos.

Decisión D abierta: **¿qué precisa estar online para hidratar tras purge?** Si el user está offline cuando ocurre el mismatch, purgar destruye su capacidad de operar. Mitigación: detectar offline en el momento del mismatch y diferir la purga hasta tener conectividad, mostrando un banner "Datos en migración, conectate a internet para sincronizar". Complica significativamente la implementación. Defer a SPEC.

### 4.5. Remote error reporting — Sentry

Hoy no hay forma de ver errores runtime en mobile/desktop instalado. Hipótesis sobre "no me permite crear ideas" no se pueden confirmar sin esto.

**Opciones evaluadas:**

| Opción                        | Pro                                                                                                                  | Contra                                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Sentry**                    | Best-in-class para JS errors. SDK soporta web, Capacitor, Tauri (como web). Source maps, breadcrumbs, releases tags. | Cuenta nueva, costo si excede free tier (5k errors/mes). Privacidad: errors envían al cloud SaaS |
| **Firebase Crashlytics**      | Ya hay Firebase project. Gratis ilimitado. SDK Android nativo robusto.                                               | NO funciona para JS/web nativo — Crashlytics for Web está en beta perpetua. Cobertura parcial.   |
| **Custom logger → Firestore** | Control total, sin SaaS extra. Reusa infra existente.                                                                | Reinventar la rueda: stack traces, deduplication, source maps. Costo en lecturas/escrituras.     |

Recomendación: **Sentry** para web/Tauri, **Crashlytics** para Capacitor Android nativo (atrapa crashes que no vienen de JS — ej: native plugin issues).

Implementación mínima:

- `@sentry/react` en main.tsx con `Sentry.init({ dsn, release: import.meta.env.VITE_APP_VERSION })`.
- ErrorBoundary global que captura React errors.
- Source maps subidos en CI (release.yml step) para que stack traces sean legibles.
- Tag `release` con versión Tauri/Capacitor para correlacionar con builds específicos.

Decisión D abierta: ¿activar también `@sentry/tracing` para perf? Recomendación: NO en MVP, agregar si hay incidente que lo justifique.

### 4.6. Compat con auto-updater Tauri existente

Tauri ya tiene auto-updater (Feature 8) que descarga + instala MSI/NSIS automáticamente. Las nuevas mecánicas (§4.3) deben integrarse, no competir.

Flujo objetivo:

1. App Tauri abre → `useAutoUpdate` hook chequea `latest.json`.
2. Hay update → descarga + instala.
3. App reinicia con bundle nuevo.
4. **Nuevo:** boot detecta `prevVersion !== currentVersion` → unregister SW + reload una vez.
5. Bundle nuevo arranca contra storage limpio de SW.

Si el chequeo de mismatch (step 4) ocurre ANTES del init de TinyBase / Firebase, evita que el SDK intente hidratar contra IndexedDB potencialmente incompat.

### 4.7. Frecuencia de chequeo de updates web

vite-plugin-pwa con `registerType: 'prompt'` chequea actualizaciones del SW en cada navigation event y cada 24h por defecto. Para una app que el user mantiene abierta días en standalone PWA, eso es lento.

Considerar agregar:

```ts
const updateSW = registerSW({
  onRegisteredSW(swUrl, r) {
    if (!r) return;
    setInterval(() => r.update(), 60 * 60 * 1000); // cada hora
  },
  onNeedRefresh() {
    /* ... */
  },
});
```

Decisión D abierta: frecuencia. Cada hora es razonable; cada 5 min es excesivo. Recomendación: cada hora.

## 5. Preguntas abiertas que el SPEC formal debe resolver

1. **Reproducir el síntoma "no me permite crear ideas" de forma controlada antes de fixar.** Sin Sentry hoy es ciego — el SPEC arranca con (a) implementar Fase E primero y (b) reproducir el bug específico para confirmar la hipótesis del schema mismatch.
2. **Granularidad del split en fases.** ¿SPEC único con F1..F12, o tres SPECs independientes (web/PWA, nativo, observability+schema)? Recomendación: **SPEC único** con fases claras — están todas relacionadas por el mismo problema raíz.
3. **¿Migración o purge-on-mismatch para schema?** §4.4. Recomendación: purge en MVP.
4. **¿Auto-aplicar update tras N segundos en banner web?** §4.2. Recomendación: NO.
5. **¿Sentry vs Crashlytics vs ambos?** §4.5. Recomendación: ambos según plataforma.
6. **¿Versión del cliente expuesta a Cloud Functions?** Si las CFs reciben requests de clientes viejos por el bug del SW, podrían rechazar con un mensaje claro (`{ error: 'OUTDATED_CLIENT', minVersion: 'X.Y.Z' }`) que la UI puede usar para forzar update. Requiere protocolo `X-App-Version` header. Útil pero ortogonal a la solución del SW; agendar como fase opcional.
7. **¿"Borrar datos" como botón en Settings?** Una opción más segura para el user que el "borrar datos" del OS — botón que hace un `localStorage.clear() + indexedDB.deleteDatabase() + caches.delete() + reload`. Útil como red de seguridad mientras Fases A-E maduran.
8. **Tauri WebView2: instalación es Edge runtime; ¿qué pasa en máquinas con Edge muy viejo?** El comportamiento del SW puede diferir. Documentar versión mínima de Edge soportada.
9. **Capacitor: ¿`@capacitor/preferences` o nativo?** Para guardar `lastSeenVersion`. Recomendación: `@capacitor/preferences`.
10. **CI: ¿upload de source maps a Sentry como step de release.yml?** Sí, pero solo si Sentry se elige.
11. **Costo Sentry vs free tier.** Free tier es 5k errors/mes. Para un user solo → suficiente. Si se abre a otros users en el futuro → escalable.

## 6. Pasos sugeridos para el SPEC formal

Estructura tentativa F1..F11:

### Fase A — CDN cache headers

- **F1 — Headers en `firebase.json`** según §4.1. Deploy a Hosting. Validar con `curl -I https://secondmind.web.app/index.html` que devuelve `Cache-Control: no-cache`.

### Fase B — PWA SW con update prompt

- **F2 — Cambiar `vite.config.ts` a `registerType: 'prompt'`** + workbox sin `skipWaiting`.
- **F3 — Implementar `registerSW` en `src/main.tsx`** con callbacks `onNeedRefresh` / `onOfflineReady`.
- **F4 — Componente `UpdateBanner`** + integración en root layout.
- **F5 — Polling de updates cada hora** según §4.7.

### Fase E — Observability

- **F6 — Setup Sentry** (`@sentry/react` + ErrorBoundary + DSN como env var).
- **F7 — Setup Crashlytics Capacitor** vía plugin oficial.
- **F8 — Source maps upload en `release.yml`**.

### Fase C — Purga WebView nativa

- **F9 — Hook de detección de versión + purga SW** en boot, compartido entre Tauri y Capacitor (con detección de plataforma vía `@capacitor/core` + `@tauri-apps/api`).
- **F10 — Test E2E**: instalar v0.X.0 → cortar v0.X.1 → reinstalar → verificar que la app arranca sin Ctrl+Shift+R ni borrar datos.

### Fase D — Schema versioning

- **F11 — Agregar `SCHEMA_VERSION` a TinyBase persister, saveQueue, preferences** + lógica purge-on-mismatch.

### Validación E2E

- Tras F11: cerrar y reabrir el ciclo "deploy → user observa update banner → click → app actualizada sin pérdida de datos del user". Documentar el resultado en el cierre del SPEC.

## 7. Qué NO es esta feature

- **No** es una migración a Firestore offline persistence (`persistentLocalCache`). El default `memoryLocalCache` es suficiente. Si en el futuro se quiere offline-first robusto, es decisión separada.
- **No** es un rework de Capacitor → React Native ni de Tauri → otra cosa. Asume el stack actual.
- **No** elimina el auto-updater Tauri ni el Firebase App Distribution para Android. Los complementa.
- **No** cubre conflictos cliente↔servidor (ej: dos clientes editando la misma nota). Eso es CRDT / conflict resolution, otro tema.
- **No** garantiza zero-downtime durante deploys con breaking changes. Si una CF cambia su API de forma breaking, los clientes viejos van a romper hasta que actualicen — Fase B/E mitigan el síntoma haciendo el update inmediato y visible.
- **No** cubre "rollback de deploy" si el deploy nuevo es buggy. Eso es operations, no esta feature.

## 8. Input para el SPEC

Al arrancar la ejecución del SPEC formal:

1. Leer este DRAFT y los archivos referenciados en §4 ([firebase.json](../../firebase.json), [vite.config.ts](../../vite.config.ts), [src-tauri/tauri.conf.json](../../src-tauri/tauri.conf.json), [capacitor.config.ts](../../capacitor.config.ts), [src/lib/firebase.ts](../../src/lib/firebase.ts)).
2. Confirmar versión actual de `vite-plugin-pwa` (`package.json`) y revisar docs si el API `registerSW` cambió en alguna versión reciente — `use context7` con `vite-plugin-pwa`.
3. Decidir Sentry vs Crashlytics vs ambos (§5.5). Si Sentry: crear cuenta + DSN antes de F6.
4. Crear `Spec/features/SPEC-feature-N-cache-stale-update-flow.md` con F1..F11 + decisiones D1..Dn.
5. Crear branch `feat/cache-stale-update-flow` y ejecutar fases en orden A → B → E → C → D (ver §3 sobre el orden).
6. **Hacer un release "canario"** entre A+B y C: deploy a hosting, instalar app desktop con versión vieja, validar que el banner aparece y que el flow funciona ANTES de tocar la capa nativa.
7. **Eliminar este archivo DRAFT** una vez el merge esté en main, para evitar dos fuentes de verdad.
