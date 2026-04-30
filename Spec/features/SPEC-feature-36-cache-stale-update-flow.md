# SPEC — Feature 36: Cache stale cross-platform + flujo de update sin intervención manual

> Alcance: Eliminar el ciclo "deploy → bundle viejo persistido → workaround manual (Ctrl+Shift+R / borrar datos)" en hosting web, Tauri desktop y Capacitor Android.
> Dependencias: F8 (Tauri auto-updater), F9 (Capacitor auto-update), F28-F30 (retry queues in-memory).
> Estimado: 2-3 sesiones.
> Stack relevante: `vite-plugin-pwa@^1.2.0`, Firebase Hosting, Tauri@2 + WebView2, Capacitor@8 + Android WebView, Sentry, TinyBase persister, `preferences.ts`, `saveQueue.ts`.
> DRAFT origen: `Spec/drafts/DRAFT-cache-stale-update-flow.md` (eliminar al merge).

---

## Objetivo

Tras un deploy a Hosting (sólo web) o un release nuevo de desktop/Android, las versiones instaladas hoy siguen sirviendo el bundle anterior hasta que el usuario fuerza hard-reload o borra datos del OS. Síntoma observado: "no me permite crear ideas" sin error visible. Esta feature ataca cinco capas independientes que se manifiestan como un único fallo: PWA SW mal configurado, CDN sin cache headers, WebView storage no purgado en native update, schema sin versionado, y cero observabilidad runtime en mobile/desktop instalado.

Al cerrar F36, un deploy nuevo se propaga en menos de una hora a clientes web/PWA con prompt visible al usuario, y un release nativo (MSI/NSIS/APK) llega con SW limpio y storage compatible con el bundle nuevo. Cualquier error runtime en cliente — incluso en producción mobile — es diagnosticable sin reproducción local.

---

## Disparador

Sebastián reporta que tras cualquier update (a) Ctrl+Shift+R en desktop, (b) borrar caché y datos en celular son los pasos manuales para desbloquearse. Cuando no los hace, "no me permite crear ideas" — falla silencioso, sin mensaje. Sin observabilidad cliente la hipótesis no se confirma; lo más probable según mapeo del repo: el SW viejo sirve un bundle JS desactualizado contra un endpoint Cloud Function (probable `processInboxItem` post-F26 que cambió `aiConfidence`/`aiPriority` shape) cuyo schema input/output cambió. Confirmar requiere F5-F6 (observabilidad) implementadas primero.

---

## Decisiones cerradas

### D1 — Sentry-only en MVP

`@sentry/react` cubre web + Tauri (renderer JS) + Capacitor (WebView JS) con un único SDK. Crashlytics for Web sigue en beta perpetua y aporta cobertura redundante para >80% de los crashes (que son JS, no nativos). Si post-deploy Crashlytics nativo se justifica para crashes del WebView Android que no llegan al SDK JS, agregar en feature posterior.

**Tradeoff:** Free tier Sentry (5k events/mes) suficiente para single-user; SaaS implica que stack traces salen del entorno local. Aceptable.

### D2 — Purge-on-mismatch en schema versioning

Detectar mismatch entre `SCHEMA_VERSION` actual y persistido → descartar storage local → rehidratar desde Firestore. Migración real (función `migrate(oldData, oldV, newV)` por bump) escalable post-MVP si hay reporte de pérdida de datos.

**Tradeoff:** Pierde estado offline en momento del bump. Mitigado parcialmente por F4 (flush queues antes de purge si online; si offline → diferir purga con banner "Datos en migración, conectate a internet").

### D3 — Banner update web sin auto-aplicar

`updateSW(true)` solo dispara con click explícito del usuario. Banner sticky no-dismissible hasta que el user accione. NO auto-aplicar tras N segundos: puede romper trabajo en progreso (typing, inbox-batch processing).

### D4 — Un solo SPEC con cinco fases internas

Las cinco capas comparten root cause ("deploy nuevo no se propaga") y dependencias bidireccionales (Sentry confirma hipótesis del schema; flush-before-reload conecta SW + saveQueue; useVersionCheck reusa `getVersion` de F8/F9). Splitear en SPECs separados pierde contexto inter-fase.

### D5 — Numeración F36

F35 cerrada (último entry de ESTADO-ACTUAL). F25 ausente del listado pero no impacta el siguiente número.

### D6 — saveQueue NO requiere SCHEMA_VERSION

Corrección al DRAFT §4.4: `saveQueue.ts` es un `Map<string, QueueEntry>` puramente in-memory sin persistencia a disco (verificado en `saveQueue.ts:63`). F28 mitiga pérdida con `beforeunload` flush + `online` recovery, pero entre versiones de app no hay rows persistidos que rompan hidratación. F8 schema versioning aplica solo a TinyBase persister + preferences.

### D7 — Riesgo de schema mismatch es semántico, no syntactic

TinyBase v8 muta rows al `setRow` quitando campos no-en-schema, y al hidratar inicializa con defaults del schema (`''`, `0`, `false`). Crashes runtime tipo `Cannot read property 'X' of undefined` son raros; lo común es **valor desconocido** (ej: F26 agregó `aiConfidence: number` y status nuevo `'high-confidence'` que cliente viejo no sabe interpretar). F8 sigue justificándose por consistencia semántica.

---

## Features

### Fase A — CDN cache headers

#### F1: Headers explícitos en `firebase.json`

**Qué:** Separar caching long-term de assets con hash (`assets/index-abc123.js`) del navegacional (`index.html`, `sw.js`, `manifest.webmanifest`) que siempre debe ser fresh.

**Criterio de done:**

- [ ] `curl -I https://secondmind.web.app/index.html` devuelve `Cache-Control: no-cache, no-store, must-revalidate`.
- [ ] `curl -I https://secondmind.web.app/assets/<algun-hash>.js` devuelve `Cache-Control: public, max-age=31536000, immutable`.
- [ ] `curl -I https://secondmind.web.app/sw.js` devuelve `Cache-Control: no-cache, no-store, must-revalidate`.
- [ ] Deploy a hosting con `npm run deploy` exitoso, sin warnings.

**Archivos:**

- `firebase.json` — agregar sección `headers` dentro de `hosting` (entre `rewrites` y el cierre del bloque).

**Snippet (estructura objetivo):**

```json
"hosting": {
  "site": "secondmind",
  "public": "dist",
  "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
  "rewrites": [{ "source": "**", "destination": "/index.html" }],
  "headers": [
    { "source": "**/*.@(js|css|woff2|woff|ttf|otf)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] },
    { "source": "**/*.@(png|jpg|jpeg|svg|ico|webp)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=86400" }] },
    { "source": "/index.html", "headers": [{ "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" }] },
    { "source": "/sw.js", "headers": [{ "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" }] },
    { "source": "/manifest.webmanifest", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] }
  ]
}
```

**Notas:** Assets con hash son safe a cachear forever — el filename cambia cuando cambia el contenido. `index.html` es el único entry point que el browser pide siempre con el mismo nombre, así que tiene que ser fresh para descubrir nuevos hashes.

---

### Fase B — PWA Service Worker con update prompt

#### F2: `vite-plugin-pwa` `registerType: 'prompt'` + workbox sin `skipWaiting`

**Qué:** Cambiar de `autoUpdate` (que registra el SW pero no expone UI) a `prompt` (expone callbacks `onNeedRefresh` / `onOfflineReady` para que el cliente decida cuándo aplicar).

**Criterio de done:**

- [ ] `vite.config.ts` con `registerType: 'prompt'`, `workbox.skipWaiting: false`, `workbox.clientsClaim: false` explícitos.
- [ ] Build pasa (`npm run build` sin errores).
- [ ] Inspector → Application → Service Workers muestra el SW en estado `waiting` tras un deploy nuevo (no `activated` automáticamente).

**Archivos:**

- `vite.config.ts` — modificar el block `VitePWA({ ... })`.

**Snippet:**

```ts
VitePWA({
  registerType: 'prompt', // antes: 'autoUpdate'
  // ... manifest, includeAssets ...
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
    maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
    navigateFallback: 'index.html',
    navigateFallbackDenylist: [/^\/api/, /^\/__\//],
    skipWaiting: false,
    clientsClaim: false,
    runtimeCaching: [
      /* ... google fonts intacto ... */
    ],
  },
});
```

#### F3: `registerSW()` en `main.tsx` + `<UpdateBanner />` + polling cada hora

**Qué:** Suscribirse a los callbacks del plugin para detectar SW `waiting`, exponer un componente UI (banner sticky-top) que invita al user a actualizar, y disparar `r.update()` cada hora para apps que el user mantiene abiertas días.

**Criterio de done:**

- [ ] Tras deploy nuevo, banner aparece dentro de los 60s (tiempo del próximo polling tick) o al recargar la pestaña.
- [ ] Click "Actualizar ahora" dispara `updateSW(true)` → SW promueve a `active` → reload automático.
- [ ] Click NO dispara reload si hay writes pendientes en queues — bloqueado/diferido por F4.
- [ ] Banner NO se cierra ni se oculta sin acción del user (sticky no-dismissible).

**Archivos:**

- `src/main.tsx` — agregar `registerSW({ onNeedRefresh, onOfflineReady, onRegisteredSW })` antes del `createRoot`.
- `src/components/layout/UpdateBanner.tsx` — nuevo componente. Sigue patrón shell de `TopBar.tsx` (full-width fixed, theming via `bg-background border-border text-foreground`).
- `src/hooks/useSwUpdate.ts` — nuevo hook que expone `{ needRefresh: boolean, applyUpdate: () => void }` para que `<UpdateBanner />` consuma estado reactivo (el plugin emite via callback, hay que adaptar a useSyncExternalStore o useState + setter).
- `src/app/layout.tsx` — montar `<UpdateBanner />` en el shell global (sobre `<TopBar />` o como header del `<main>`).

**Snippet `main.tsx`:**

```ts
import { registerSW } from 'virtual:pwa-register';
import { setSwUpdateAvailable, setApplyUpdate } from '@/hooks/useSwUpdate';

const updateSW = registerSW({
  onNeedRefresh() {
    setSwUpdateAvailable(true);
  },
  onOfflineReady() {
    // toast "Listo para usar offline" — opcional MVP
  },
  onRegisteredSW(_url, r) {
    if (!r) return;
    setInterval(() => r.update(), 60 * 60 * 1000); // 1h
  },
});

setApplyUpdate(() => updateSW(true));
```

**Notas:** El plugin emite callbacks, no observable. Patrón propuesto: hook `useSwUpdate` con un módulo-level `let updateAvailable = false; const subscribers = new Set()` (mismo patrón que `useOnlineStatus`). El `setApplyUpdate` permite que F4 envuelva la función con flush-before-reload.

#### F4: Handshake flush-before-reload contra `saveQueue` (adición F36)

**Qué:** Antes de que `updateSW(true)` dispare reload, ejecutar `flushAll()` sobre los 11 queues exportados en `saveQueue.ts:415` (`allQueues`). Sin esto, cualquier write pendiente in-memory se pierde silenciosamente al reload.

**Criterio de done:**

- [ ] Click "Actualizar ahora" con `usePendingSyncCount > 0` muestra estado "Sincronizando antes de actualizar…" en el banner y bloquea el botón hasta `flushAll` resuelva.
- [ ] Si todos los flushes resuelven con `'synced'`, dispara reload automático.
- [ ] Si algún flush resuelve con `'failed'`, banner cambia a "Algunos cambios no se sincronizaron — [Reintentar / Actualizar igual / Cancelar]".
- [ ] Sin entries pendientes: comportamiento idéntico a F3 (reload directo).

**Archivos:**

- `src/components/layout/UpdateBanner.tsx` — extender estados de UI.
- `src/hooks/useSwUpdate.ts` — `applyUpdate()` espera flush antes de invocar el `updateSW(true)` del plugin.
- `src/lib/saveQueue.ts` — sin cambios (`allQueues` y `flushAll` ya están).

**Notas:** `flushAll` retorna `Map<string, 'synced' | 'failed'>`. Iterar sobre `allQueues`, hacer `Promise.all(queue.flushAll())`, agregar resultados. UI distingue tres estados: `idle` → `flushing` → (`success` → reload | `partial-failure` → choice).

---

### Fase E — Observabilidad

#### F5: Sentry `@sentry/react` + `<ErrorBoundary>` global + DSN env

**Qué:** Instalar `@sentry/react`, inicializar en `main.tsx` con DSN desde `import.meta.env.VITE_SENTRY_DSN`, montar `<Sentry.ErrorBoundary>` envolviendo `<RouterProvider>` con fallback UI mínimo. Tag `release` con la versión del bundle.

**Criterio de done:**

- [ ] Crear cuenta Sentry + proyecto "secondmind" + obtener DSN. Documentar en `.env.example` con comentario de cómo obtenerlo.
- [ ] `main.tsx` inicializa Sentry antes del `createRoot`.
- [ ] Throw artificial en una ruta de prueba dispara captura en Sentry dashboard dentro de 60s.
- [ ] React errors atrapados por ErrorBoundary muestran fallback UI ("Algo salió mal — [Reintentar]") y reportan a Sentry con component stack.
- [ ] Errores `unhandledrejection` y `window.onerror` capturados automáticamente por el SDK.

**Archivos:**

- `src/lib/sentry.ts` — config + `initSentry()` exportado.
- `src/main.tsx` — llamar `initSentry()` antes del primer render. Envolver `<RouterProvider>` con `<Sentry.ErrorBoundary fallback={...}>`.
- `src/components/layout/ErrorFallback.tsx` — UI minimalista para el fallback (botón "Reintentar" hace `window.location.reload()`).
- `.env.example` — agregar `VITE_SENTRY_DSN=`.
- Plataformas: el mismo init aplica a web, Tauri renderer y Capacitor WebView (todos cargan `main.tsx`).

**Snippet `sentry.ts`:**

```ts
import * as Sentry from '@sentry/react';

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    release: import.meta.env.VITE_APP_VERSION ?? 'unknown',
    environment: import.meta.env.DEV ? 'development' : 'production',
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0, // perf desactivado en MVP
  });
}
```

**Notas:** `VITE_APP_VERSION` se inyecta via `vite.config.ts` desde `package.json:version` (patrón estándar). Verificar que el `release` matchea exactamente con el tag de source map upload (F6).

#### F6: CI source maps upload + release tag

**Qué:** Step en `.github/workflows/release.yml` (existente, agregado por F8) para subir source maps a Sentry usando `@sentry/cli` o `@sentry/wizard`. Sin esto los stack traces son ofuscados.

**Criterio de done:**

- [ ] Tag `release` en Sentry matchea con `tauri.conf.json:version` y `package.json:version`.
- [ ] Errors de un build de producción muestran código fuente legible en Sentry dashboard (no minificado).
- [ ] CI no falla si la upload falla (continue-on-error) — el deploy sigue, solo se pierde la legibilidad del trace.

**Archivos:**

- `.github/workflows/release.yml` — agregar step `Upload sourcemaps to Sentry` después del `npm run build`.
- Secrets GitHub: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`. Documentar en `Spec/features/SPEC-feature-36-cache-stale-update-flow.md` mismo (cierre).

**Snippet workflow:**

```yaml
- name: Upload sourcemaps to Sentry
  if: env.SENTRY_AUTH_TOKEN != ''
  continue-on-error: true
  run: |
    npx @sentry/cli releases new $VERSION
    npx @sentry/cli releases files $VERSION upload-sourcemaps ./dist --rewrite
    npx @sentry/cli releases finalize $VERSION
  env:
    SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
    SENTRY_ORG: ${{ secrets.SENTRY_ORG }}
    SENTRY_PROJECT: ${{ secrets.SENTRY_PROJECT }}
    VERSION: ${{ github.ref_name }}
```

---

### Fase C — Purga WebView nativa

#### F7: `useVersionCheck` hook + SW unregister en boot (Tauri + Capacitor)

**Qué:** Hook que en el primer mount detecta version mismatch entre la version del bundle actual (`import.meta.env.VITE_APP_VERSION`) y la "última versión observada" guardada en storage que sobrevive a la purga (Tauri: `@tauri-apps/plugin-store`; Capacitor: `@capacitor/preferences`; web/PWA: skip — el SW prompt de F3 ya cubre). En mismatch: `navigator.serviceWorker.getRegistrations()` + `.unregister()` + reload una vez. Preserva IndexedDB y localStorage (donde vive saveQueue offline / preferences hint).

**Criterio de done:**

- [ ] Instalar v0.X.0 desktop. Cortar v0.X.1 con auto-update tag. Update se descarga, app reinicia. Boot detecta mismatch, unregistra SW, recarga, app arranca con bundle nuevo sin Ctrl+Shift+R.
- [ ] Mismo escenario en Android (APK Firebase App Distribution).
- [ ] PWA web: hook NO ejecuta (detección via `if (isCapacitor() || isTauri()) return`); banner de F3 maneja el flujo.
- [ ] localStorage `secondmind:sidebarHidden:` (hint anti-flash F32.4) sobrevive el reload.
- [ ] Si el user está offline en momento del mismatch: hook detecta y skip purga; banner global muestra "Datos en migración, conectate a internet".

**Archivos:**

- `src/hooks/useVersionCheck.ts` — nuevo hook, ejecuta una vez al mount del shell layout.
- `src/lib/platformVersion.ts` — abstracción `getInstalledVersion()` y `setLastSeenVersion(v)` que delega a Tauri Store o Capacitor Preferences según `isTauri()` / `isCapacitor()`.
- `src/app/layout.tsx` — invoke `useVersionCheck()` en el top-level del Layout (después de `useAuth`, antes de cualquier render que dependa de TinyBase).
- `package.json` — `npm i @tauri-apps/plugin-store` (si no está) y verificar `@capacitor/preferences` (probablemente ya transitiva, validar).

**Snippet `useVersionCheck.ts` (esqueleto):**

```ts
export function useVersionCheck() {
  useEffect(() => {
    void (async () => {
      if (!isTauri() && !isCapacitor()) return;
      const current = import.meta.env.VITE_APP_VERSION;
      const lastSeen = await getInstalledVersion();
      if (lastSeen === current) return;
      // Mismatch: purga SW, marca version, reload
      if (!navigator.onLine) {
        showOfflineMigrationBanner();
        return;
      }
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
      await setLastSeenVersion(current);
      window.location.reload();
    })();
  }, []);
}
```

**Notas:** El check ocurre ANTES del init de TinyBase / Firebase para evitar que el SDK intente hidratar contra IndexedDB potencialmente incompat. Si llamamos al hook adentro de Layout y Layout es child del Provider en main.tsx, ya hubo init — pero la purga del SW no toca IndexedDB, solo SW registrations, así que no hay conflicto. Validar comportamiento con SW purgado mid-session.

---

### Fase D — Schema versioning

#### F8: `SCHEMA_VERSION` en TinyBase persister + preferences + purge-on-mismatch

**Qué:** Constante `SCHEMA_VERSION = 1` en `tinybase.ts` y `preferences.ts`. Al hidratar, leer la versión guardada (en un campo del row del schema, o en localStorage como bandera global). Si mismatch con la del bundle: descartar el storage local de esa entidad y rehidratar desde Firestore. Versionado independiente por capa (TinyBase rows vs preferences) para que un bump en una no fuerce purga en la otra.

**Criterio de done:**

- [ ] `tinybase.ts` exporta `SCHEMA_VERSION = 1`. Persister lee la metadata de versión de un sentinel `__schemaVersion` en una tabla auxiliar o en localStorage `secondmind:tinybase:schemaVersion`.
- [ ] `preferences.ts` exporta `PREFERENCES_SCHEMA_VERSION = 1`. `parsePrefs` rechaza prefs con versión distinta y devuelve `DEFAULT_PREFERENCES`.
- [ ] Bump artificial (cambiar a 2) en dev → app borra cache local TinyBase + re-hidrata desde Firestore → rows visibles tras 1-2s.
- [ ] Bump artificial de prefs schema → preferencias vuelven a defaults sin error visible.
- [ ] Documentar en CLAUDE.md: "Bumpear `SCHEMA_VERSION` cuando se cambia el shape de un Row o de UserPreferences".

**Archivos:**

- `src/lib/tinybase.ts` — agregar `SCHEMA_VERSION` + lógica purge-on-mismatch en `getPersisted` (primer arg de `createCustomPersister`).
- `src/lib/preferences.ts` — agregar `PREFERENCES_SCHEMA_VERSION` + chequeo en `parsePrefs`.
- `CLAUDE.md` — sección nueva "Schema versioning" en gotchas universales (1-2 líneas + pointer a este SPEC).

**Notas:** Para TinyBase, el patrón canónico es guardar la versión en localStorage (no en Firestore) porque Firestore es la fuente de verdad — no se le aplica versionado, solo al cache local. La purga consiste en `store.delTable(name)` para todas las tablas + `localStorage.setItem('secondmind:tinybase:schemaVersion', String(SCHEMA_VERSION))`. El persister naturalmente re-hidrata desde Firestore en el siguiente `startAutoLoad`.

---

### Validación end-to-end

#### F9: E2E full update cycle

**Qué:** Test manual + scripted que valida el ciclo completo "deploy → user observa update banner → click → app actualizada sin pérdida de datos".

**Criterio de done:**

- [ ] **Web:** abrir `https://secondmind.web.app` con devtools, `Application > Service Workers > Update on reload` desactivado. Hacer un cambio dummy + deploy. En el browser viejo: dentro de 1h aparece banner "Hay versión nueva". Click → app actualizada. localStorage + IndexedDB intactos.
- [ ] **Web con writes pendientes:** simular network offline (devtools), tipear en una nota nueva (entry queda en saveContentQueue), volver online, click "Actualizar ahora" → banner muestra "Sincronizando…" → al terminar reload → al recargar la nota está sincronizada.
- [ ] **Tauri desktop:** instalar v0.X.0. Cortar v0.X.1 (`gh release create v0.X.1` con bundle). Abrir app v0.X.0, auto-updater detecta, descarga, app reinicia, boot detecta mismatch, unregister SW, segundo reload, app v0.X.1 funciona sin Ctrl+Shift+R.
- [ ] **Android:** instalar APK v0.X.0 vía Firebase App Distribution. Subir v0.X.1. Abrir app vieja, prompt update, instalar, abrir, boot detecta mismatch, app v0.X.1 funciona sin "borrar datos".
- [ ] **Sentry:** generar error artificial (botón en `/settings` debug, opcional) y verificar que aparece en dashboard con stack trace legible.
- [ ] Documentar resultados en cierre del SPEC.

**Archivos:** ninguno nuevo. Documentar en este mismo SPEC al cerrar.

---

## Orden de implementación

Defendido en DRAFT §3 con E al medio para validar A+B antes de tocar capa nativa:

1. **F1** (Fase A — cache headers) — 1 archivo, deploy directo. Resuelve ~30% del síntoma para usuarios web.
2. **F2 → F3 → F4** (Fase B — PWA SW prompt) — depende de F1 estable. Resuelve ~70% acumulado para web/PWA.
3. **F5 → F6** (Fase E — observabilidad) — antes de C/D para confirmar hipótesis del schema mismatch en runtime de cliente real, y para tener trace cuando F7/F8 introduzcan bugs.
4. **F7** (Fase C — purga nativa) — depende de F1+F2 deployados (sin SW limpio el flow nativo no completa).
5. **F8** (Fase D — schema versioning) — última. Con observabilidad ya activa, podemos confirmar si schema mismatch es realmente la fuente del "no me permite crear ideas" antes de invertir.
6. **F9** — validación end-to-end. Punto de cierre.

**Release "canario" entre F4 y F7:** deploy a hosting con A+B+E, instalar app desktop con versión vieja, validar que el banner aparece y el flow funciona ANTES de tocar la capa nativa. Documentar resultado.

---

## Estructura de archivos

```
firebase.json                                             # F1
vite.config.ts                                            # F2
src/
├── main.tsx                                              # F3 (registerSW + initSentry + ErrorBoundary)
├── lib/
│   ├── sentry.ts                                         # F5 nuevo
│   ├── platformVersion.ts                                # F7 nuevo
│   ├── tinybase.ts                                       # F8
│   └── preferences.ts                                    # F8
├── hooks/
│   ├── useSwUpdate.ts                                    # F3 nuevo
│   └── useVersionCheck.ts                                # F7 nuevo
├── components/
│   └── layout/
│       ├── UpdateBanner.tsx                              # F3 + F4 nuevo
│       └── ErrorFallback.tsx                             # F5 nuevo
└── app/
    └── layout.tsx                                        # F3 montar UpdateBanner, F7 useVersionCheck
.github/
└── workflows/
    └── release.yml                                       # F6 step sourcemaps
.env.example                                              # F5 VITE_SENTRY_DSN
CLAUDE.md                                                 # F8 sección schema versioning
package.json                                              # F5 @sentry/react, F7 @tauri-apps/plugin-store
```

---

## Checklist de completado

Al cerrar F36, TODAS estas condiciones deben ser verdaderas:

- [ ] `npm run build` y `npm run lint` pasan sin warnings.
- [ ] `npm test` pasa (130+ tests existentes; agregar tests para `useSwUpdate`, `useVersionCheck`, schema purge).
- [ ] `curl -I` sobre `index.html` y `sw.js` confirma headers no-cache.
- [ ] Deploy a hosting + instalar app desktop con versión previa + verificar update flow sin Ctrl+Shift+R.
- [ ] Deploy a Android (Firebase App Distribution) + instalar APK previo + update flow sin "borrar datos".
- [ ] Sentry recibe al menos 1 error de prueba con stack trace legible.
- [ ] DRAFT `Spec/drafts/DRAFT-cache-stale-update-flow.md` eliminado.
- [ ] `Spec/ESTADO-ACTUAL.md` actualizado con entry F36 (siguiendo regla de escalación: gotchas que aplican a >1 dominio suben acá).
- [ ] CLAUDE.md gotcha "Schema versioning bump cuando cambia shape de Row o Preferences" agregado.

---

## Riesgos / fuera de scope

- **NO** migra a `persistentLocalCache` de Firestore — el default `memoryLocalCache` sigue. Si offline-first robusto se necesita, decisión separada.
- **NO** cubre conflict resolution cliente↔servidor (CRDT). Dos clientes editando la misma nota en paralelo siguen sin garantías.
- **NO** garantiza zero-downtime para deploys con breaking API changes en Cloud Functions. Clientes viejos rompen hasta actualizar — F3+F5 mitigan haciendo el update inmediato y observable.
- **NO** cubre rollback de deploy buggy (operations, no esta feature).
- **NO** elimina auto-updater Tauri ni Firebase App Distribution. F7 los complementa con purga del SW post-update.
- **NO** activa `@sentry/tracing` (perf monitoring). MVP es errores únicamente.

---

## Siguiente fase

Post-F36 el ecosistema queda con observabilidad cliente y propagación garantizada de updates. Siguiente fase candidata: enviar header `X-App-Version` en todas las requests a CFs y rechazar versiones mínimas con mensaje accionable (`{ error: 'OUTDATED_CLIENT', minVersion }`) para forzar update tras breaking change CF — ortogonal a F36, justificable solo si hay incidente cross-version observado en Sentry.
