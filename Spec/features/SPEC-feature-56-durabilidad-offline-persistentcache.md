# SPEC — Feature 56: Durabilidad offline (`persistentLocalCache`)

> **Estado:** 📋 **Planificado · no implementado.** Generado tras research multi-fuente (Context7 oficial Firebase + research web Capacitor/Tauri WebView) y **GO/NO-GO del asesor: GO con Opción C, pre-requisito de la apertura de beta**. La decisión A/B/C está **cerrada y es definitiva** — este SPEC NO re-evalúa opciones.
> **Severidad:** **Pre-requisito de la apertura de beta (v0.5.0).** La beta NO abre hasta que el gate de QA (Frente C) pase en los 3 frentes **y** la durabilidad ya esté liberada y validada en prod. **La feature NO es v0.5.0:** se libera en 0.4.x; la apertura de beta es un evento manual posterior que **verifica** este pre-requisito, no lo incluye en su release.
> **Tipo:** infraestructura de datos, **client-side**. Hereda en Tauri/Capacitor sin código por plataforma, pero **requiere release coordinado 0.4.x** (los 3 frentes) por el gotcha del SW: la mejora solo llega cuando el bundle nuevo se sirve (rebuild nativo, no solo deploy web).
> **Versión:** bump a **0.4.x** (siguiente patch tras v0.4.7 — probablemente 0.4.8, número exacto a criterio de Sebastián al release), release coordinado (hosting + Tauri + Android). **NO v0.5.0** — ese número queda reservado para la apertura de beta (evento manual posterior). Tauri NO es opcional (toca `src-tauri/tauri.conf.json`); Android NO es opcional (debe servir el bundle nuevo).
> **Bake time:** liberar en 0.4.x deja la durabilidad **horneándose en producción con un solo user real** (la cuenta de Sebastián) antes de exponerla a los ~100 de la beta — **doble red** (gate de QA + bake en prod) previa a la apertura de v0.5.0.
> **Depende de:** nada técnico. Es pre-requisito de la apertura de beta.
> **Branch:** `feat/offline-durability` (creada desde `main` esta sesión).
> **Origen / causa-raíz:** `src/lib/firebase.ts:18` usa `getFirestore(app)` plano (cache en memoria). Combinado con que **TinyBase no tiene persister local** (único persister = `createFirestorePersister`, Firestore↔TinyBase) y que `startAutoLoad()`→`getDocs()` offline no trae nada, hoy hay **DOBLE pérdida offline tras reload**: (1) writes pendientes (11 saveQueues en memoria), (2) **app VACÍA** — el usuario reabre sin red y no ve ninguna de sus notas.

## Objetivo

Hacer que SecondMind sobreviva offline a un reload **sin pérdida de datos ni de visibilidad**: tras un reload/relaunch sin red, (a) los datos del usuario **siguen visibles** (no app vacía) y (b) los writes hechos offline **se replayan y persisten** al reconectar. Se logra delegando durabilidad + replay + lectura offline al **SDK de Firestore** vía `persistentLocalCache` (IndexedDB), reemplazando el `getFirestore(app)` plano. Cambio mínimo (~10–15 LOC), reversible en un commit, sin tocar el patrón de datos del repo.

## Contexto / punto de partida (verificado en código + research esta sesión)

- **Init actual:** `src/lib/firebase.ts:18` → `export const db = getFirestore(app)` plano. **`db` es la única instancia Firestore** del proyecto (el persister la importa de ahí). `getFunctions(app, 'us-central1')` no se toca.
- **TinyBase sin persister local (verificado):** grep de `createLocalPersister`/`persister-browser`/`persister-indexed-db` = 0 hits. Único persister = `createFirestorePersister` (`src/lib/tinybase.ts`). Rehidratación al boot = `persister.startAutoLoad()` → `getDocs()` (`src/hooks/useStoreInit.ts:62`). Los `localStorage.setItem` existentes son solo theme / install-prompt / sidebar-hint / schema-version — **no datos de dominio**.
- **`setDoc` offline (Context7 oficial Firebase):** _"the promise will not resolve while you're offline"_ — **con o sin cache**. El write se aplica al cache local (latency compensation, listeners disparan con `hasPendingWrites=true`), pero la promesa de `setDoc` **no resuelve hasta el ack del server**. Implicación: el executor `await setDoc` de las saveQueues **sigue colgándose offline** → P2 (copy "Guardando…") **no se resuelve con este cambio** (es ortogonal, ver Alcance OUT).
- **API moderna (Context7):** `initializeFirestore(app, settings)` con `settings.localCache = persistentLocalCache({ tabManager, cacheSizeBytes })`. **No** pasar `cacheSizeBytes` top-level junto a `localCache` → error de init. `CACHE_SIZE_UNLIMITED = -1` (NO usar). `persistentMultipleTabManager()` para multi-tab.
- **WebView Tauri (research):** Windows/WebView2 IndexedDB **durable** (alta confianza). **Riesgo #1: cambio de scheme HTTP↔HTTPS entre releases reubica la carpeta IndexedDB** → data loss masivo (issue tauri-apps/tauri #11252). `tauri.conf.json` **NO setea `useHttpsScheme` hoy** → corre en el **default de Tauri 2 (HTTP, `http://tauri.localhost`)**.
- **WebView Capacitor Android (research):** IndexedDB funciona bajo `localhost` pero es **best-effort/transient** — Capacitor lo declara _"transient… the OS will reclaim local storage from Web Views"_; eviction LRU **all-or-nothing** del origen (MDN); `navigator.storage.persist()` ayuda pero **puede devolver `false`** en un WebView sin historial. El SDK **degrada a memoria sin crashear** si IndexedDB falla. Bug abierto de **corrupción** de cache del SDK (firebase-js-sdk #8593: cache sirve doc NULL tras "clear site data", no se auto-recupera).
- **Gotcha SW (v0.4.6):** una mejora client-side solo llega cuando el bundle nuevo se sirve → el release necesita **rebuild nativo en los 3 frentes**, no solo deploy web.

## Decisiones

| #       | Decisión                                                                                                                                                                                                                                                                                                                                                                                          | Estado                                                                                                                                                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1**  | **Opción C: `persistentLocalCache` — el SDK asume durabilidad de writes (mutation-queue durable) + lectura offline (rehidrata TinyBase tras reload).** Descartadas A-sola y B.                                                                                                                                                                                                                    | **Cerrada (asesor, GO).** B (persistir las saveQueues a mano) reinventa la mutation-queue durable del SDK con 15–30× más LOC y mismo techo IndexedDB en Android. Anti-patrón YAGNI.                                                         |
| **D2**  | **`persistentMultipleTabManager()` explícito desde el arranque.** No "validar el default en QA".                                                                                                                                                                                                                                                                                                  | **Cerrada (C2, no negociable).** La PWA web debe sobrevivir a 2 pestañas abiertas; el manager single-tab rompe la persistencia en la 2ª. Se decide acá, no se descubre en QA.                                                               |
| **D3**  | **`cacheSizeBytes` = 40 MB (40 · 1024 · 1024). NUNCA `CACHE_SIZE_UNLIMITED`.**                                                                                                                                                                                                                                                                                                                    | **Cerrada (asesor).** En Android la eviction LRU del OS ya es el techo; un cache ilimitado solo acelera la presión de almacenamiento. 40 MB para MVP, medir en beta.                                                                        |
| **D4**  | **Congelar `useHttpsScheme` EXPLÍCITO en `tauri.conf.json` = `false`** (mantener el default HTTP actual). **Invariante permanente** documentado en CLAUDE.md/gotchas.                                                                                                                                                                                                                             | **Cerrada (C3, no negociable).** Hoy no está seteado (default implícito). Hacerlo explícito blinda contra cambios de default futuros de Tauri. Cambiarlo en cualquier release futuro = data loss masivo en todos los desktops (#11252).     |
| **D5**  | **NO persistir las 11 saveQueues. Quedan INTACTAS** como vista de status en-sesión (`PendingSyncIndicator`/`PendingSyncDot`). Su rol de durabilidad ahora es del SDK.                                                                                                                                                                                                                             | **Cerrada (asesor).** Evita doble fuente de durabilidad y doble-replay. No se tocan.                                                                                                                                                        |
| **D6**  | **Reversibilidad de UN commit** a `getFirestore(app)` plano (kill-switch). El gate de QA cubre **cache corrupta sirviendo datos stale/malos**, no solo init-failure.                                                                                                                                                                                                                              | **Cerrada (C1, no negociable).** Corrupción ≠ fallo de init; la corrupción es la peligrosa en un store de conocimiento. El revert acota el peor caso al status quo de hoy.                                                                  |
| **D7**  | **Read-through cache: la lectura offline requiere ≥1 arranque online previo.** El primer launch post-update estando offline sigue vacío. **Está bien — se documenta, no se arregla.**                                                                                                                                                                                                             | **Cerrada (asesor).** Naturaleza del diseño, no defecto.                                                                                                                                                                                    |
| **D8**  | **Android es best-effort estructural.** El plugin nativo `@capacitor-firebase/firestore` (persiste en filesystem) es **escalada CONDICIONAL post-beta**, solo si la beta evidencia pérdida real. **NO se construye ahora.**                                                                                                                                                                       | **Cerrada (asesor, YAGNI).** Se documenta el techo + el camino de escalada. La señal de escalada es **cualitativa** (reportes de los 100 beta users, sin telemetría) — aceptable para MVP. `persist()==false` en QA **no** bloquea el gate. |
| **D9**  | **Fuera de scope:** P2 (copy "Guardando…"→"Sin conexión") = fix aparte; P3 (SaveIndicator refleja meta-edits) = diferido; refactor status→`hasPendingWrites` / eliminar saveQueues = futuro.                                                                                                                                                                                                      | **Cerrada (asesor).** P2 no cae gratis (`setDoc` cuelga offline igual). No inflar scope.                                                                                                                                                    |
| **D10** | **Release coordinado 0.4.x (3 frentes; siguiente patch tras v0.4.7), DESPUÉS de que el gate de QA pase.** Vía skill `release-ecosystem`. **v0.5.0 NO lo dispara esta feature:** queda reservado para la apertura de beta, evento MANUAL y posterior que Sebastián lanza explícitamente.                                                                                                           | **Cerrada.** El gotcha SW exige rebuild nativo; un deploy solo-hosting no entrega la mejora a Tauri/Android. v0.5.0 (apertura de beta) es manual y posterior, fuera de este release.                                                        |
| **D11** | **Ventana pre-`setDoc` (debounce del autosave) = residual aceptado.** Entre el keystroke y el `setDoc` media el debounce (`AUTOSAVE_DEBOUNCE_MS`); en esa ventana lo escrito vive solo en la saveQueue en memoria y un reload lo pierde (la mutación aún no entró a la mutation-queue durable del SDK). NO se arregla acá — tocar el debounce o persistir las queues sería scope creep contra D5. | **Cerrada (asesor).** El SDK cubre durabilidad desde `setDoc`, no desde el keystroke; D5 deja el debounce como el factor limitante real. Residual honesto; si resulta material → SPEC futuro. Cuantificado por el Caso B de F5/F6/F7.       |

---

## Sub-features

### Frente A — Implementación (client-side, ~10–15 LOC)

#### F1 — `initializeFirestore` con `persistentLocalCache` + `persistentMultipleTabManager` + `cacheSizeBytes` 40 MB

- **Qué:** en `src/lib/firebase.ts`, reemplazar `export const db = getFirestore(app)` por `initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager(), cacheSizeBytes: 40 * 1024 * 1024 }) })`. **Confirmar la firma exacta con Context7 al implementar** (nombre del campo `cacheSizeBytes` vs `sizeBytes` según factory vs class; `cacheSizeBytes` NO debe ir top-level junto a `localCache`).
- **Criterio de done:**
  - [ ] `npm run build` (tsc + vite) verde; `npm run lint` verde.
  - [ ] `db` sigue siendo la **única** instancia Firestore: grep de `getFirestore(` en `src/**` devuelve **0** usos fuera de — y `initializeFirestore` aparece **solo en** — `src/lib/firebase.ts`. (Si hubiera otro `getFirestore(app)` ejecutándose antes, `initializeFirestore` tiraría `failed-precondition` al boot.)
  - [ ] App arranca **online** sin error de init; el custom persister (`createFirestorePersister`) sigue hidratando TinyBase normal (notas/tasks/etc. visibles).
  - [ ] En DevTools → Application → IndexedDB aparece la base del SDK de Firestore (`firestore/[project]/...`) poblándose tras el primer load online.
- **Archivos:** `src/lib/firebase.ts`.
- **Notas:** `initializeFirestore` debe correr **antes** de cualquier `getFirestore`/uso de `db`. Como `firebase.ts` es el módulo singleton que exporta `db`, el orden se garantiza solo. StrictMode (doble-mount en dev) no afecta: el módulo se evalúa una vez.

#### F2 — `navigator.storage.persist()` en boot (best-effort)

- **Qué:** invocar `navigator.storage.persist()` una vez al boot para intentar marcar el origen como _persistent_ y escapar de la eviction LRU (mejora el piso de Android). Best-effort, no bloquea el render, loggea el retorno. Guard de capability (`navigator.storage?.persist`).
- **Criterio de done:**
  - [ ] Al boot, se llama `navigator.storage.persist()` **a lo sumo una vez** por sesión (idempotente respecto a StrictMode double-mount).
  - [ ] El retorno (`true`/`false`) queda en `console.info` con prefijo identificable (ej. `[storage:persist]`) para poder leerlo en logcat (Android) / consola (web/Tauri) durante el gate de QA.
  - [ ] No rompe en entornos sin `navigator.storage` (guard verificado).
- **Archivos:** `src/lib/storagePersist.ts` (**nuevo**, helper idempotente), llamado desde `src/main.tsx`.

#### F3 — Congelar `useHttpsScheme` explícito en Tauri (invariante · C3)

- **Qué:** en `src-tauri/tauri.conf.json`, fijar `useHttpsScheme: false` **explícito** en cada window de `app.windows[]` (hoy implícito por default). Mantiene el scheme HTTP actual (`http://tauri.localhost`) — **cero migración** porque aún no hay datos en IndexedDB de Firestore que huérfanar. Blinda contra cambios de default futuros de Tauri. Confirmar con docs Tauri v2 la ubicación exacta de la key (`WindowConfig.useHttpsScheme`).
- **Criterio de done:**
  - [ ] `tauri.conf.json` contiene `useHttpsScheme: false` explícito en las windows `main` y `capture`.
  - [ ] `npm run tauri:build` compila sin error de schema.
  - [ ] Build Tauri: la app sirve desde `http://tauri.localhost` (verificable en DevTools → origin del documento) — sin cambio respecto al comportamiento actual.
- **Archivos:** `src-tauri/tauri.conf.json`.

### Frente B — Invariantes + documentación

#### F4 — Documentar invariantes, naturaleza del diseño y kill-switch (C1/C3)

- **Qué:** escribir en CLAUDE.md (gotchas universales) y/o `Spec/gotchas/<dominio>.md` (escalación SDD): (1) **C3 — `useHttpsScheme` es invariante permanente**: cambiarlo = data loss masivo en todos los desktops (#11252); (2) **D7 — read-through cache**: la lectura offline requiere ≥1 boot online previo; (3) **D8 — Android best-effort** + escalada condicional al plugin nativo; (4) **C1 — kill-switch**: cómo revertir a `getFirestore(app)` plano en un commit si aparece corrupción en prod.
- **Criterio de done:**
  - [ ] CLAUDE.md (o gotcha de dominio + índice en `ESTADO-ACTUAL.md`) documenta los 4 puntos, sin duplicar entre niveles (regla de escalación SDD).
  - [ ] El procedimiento de revert (kill-switch) está escrito como pasos concretos (no "revertir el commit" a secas).
- **Archivos:** `CLAUDE.md`, `Spec/gotchas/tinybase-firestore.md` (o el dominio que aplique), `Spec/ESTADO-ACTUAL.md` (índice).

### Frente C — Gate de QA (pre-requisito de la beta — el costo real está acá)

> **Regla de datos (gotcha de memoria):** usar una **nota de QA dedicada** (crear con un marcador único, editar, borrar al cierre). **NUNCA** borrar/editar notas existentes de la cuenta real de Sebastián (`gYPP7NIo...`). Verificación de server vía Firebase MCP (`firestore_get_document`) en modo lectura.

#### F5 — Gate Web (Playwright + Firebase MCP)

- **Qué:** suite manual/Playwright en Chromium contra `npm run preview` (build de prod).
- **Criterio de done (cada uno verificable):**
  - [ ] **Lectura offline:** con ≥1 boot online previo (cache poblada) → DevTools network **offline** → **reload** → la lista de notas renderiza ≥1 nota del usuario (NO vacía). Verificable: `noteCards.count() > 0` offline post-reload.
  - [ ] **Replay de write — Caso A (post-flush · BLOQUEANTE):** offline → editar la nota de QA con un marcador único `QA-56-<token>` → **esperar a que el flush ocurra** (`setDoc` ya disparado — observable: el SaveIndicator pasó por "Guardando…"/"Reintentando…", o expiró el debounce `AUTOSAVE_DEBOUNCE_MS`) → reload **aún offline** → el marcador **DEBE persistir** → volver **online** → esperar sync → leer el doc en server vía Firebase MCP → el marcador **está en el doc del server**. _Es la promesa central de P1; si falla, falla el gate._
  - [ ] **Replay de write — Caso B (reload inmediato post-keystroke · DIAGNÓSTICO, no bloqueante):** editar el marcador → reload **inmediato aún offline SIN esperar el flush** → **medir y documentar** si el marcador persiste o se pierde. Cuantifica la ventana pre-`setDoc` (D11). **NO falla el gate** — bloquear por un residual ya aceptado sería contradictorio; solo se registra.
  - [ ] **Corrupción degrada limpio (C1/D6):** inyectar basura/borrado parcial en la object store de IndexedDB del SDK (Playwright `evaluate`) → reload → la app **NO** muestra notas con contenido corrupto/stale como válidas; recupera (refetch al estar online) o muestra skeleton/empty, **nunca** sirve datos malos en silencio. Documentar qué se inyectó y qué se observó.
  - [ ] **Init-failure degrada limpio:** IndexedDB no disponible (contexto que lo bloquee) → la app **arranca** (cae a memoria, warning esperado del SDK), sin crash; reads online funcionan.
  - [ ] **Multi-tab (C2/D2):** abrir **2 pestañas** de la PWA simultáneamente → **ambas operan** (leen/escriben), la persistencia **NO se bloquea** — sin `failed-precondition` ni modo exclusivo single-tab; un write en una pestaña se refleja en la otra. Gate de la decisión D2: sin esto, `persistentMultipleTabManager()` quedaría como decisión sin verificar.
  - [ ] **Reversibilidad (C1):** checkout del commit de revert (`getFirestore` plano) → rebuild → la app vuelve al comportamiento conocido (sin lectura offline, **sin pérdida de datos del server**). Confirma el kill-switch de 1 commit.
- **Archivos:** procedimiento de QA documentado (no código de producción).

#### F6 — Gate Tauri Windows (.exe release)

- **Qué:** `npm run tauri:build` → instalar el MSI/NSIS → probar en el `.exe`.
- **Criterio de done:**
  - [ ] **Lectura offline tras restart:** boot online una vez → **cerrar la app** → desconectar red → **relanzar** el `.exe` → las notas siguen visibles offline.
  - [ ] **Replay de write — Caso A (post-flush · BLOQUEANTE):** offline → editar nota de QA (marcador único) → **esperar el flush** (el SaveIndicator pasó por "Guardando…"/"Reintentando…", o expiró el debounce) → **cerrar+relanzar** la app aún offline → el marcador **DEBE persistir** → reconectar → verificar el doc en server vía Firebase MCP.
  - [ ] **Replay de write — Caso B (relanzar inmediato · DIAGNÓSTICO, no bloqueante):** editar el marcador → **cerrar+relanzar inmediato SIN esperar el flush** → **medir y documentar** si persiste. Cuantifica la ventana pre-`setDoc` (D11). NO falla el gate.
  - [ ] **Scheme/IndexedDB durable:** la IndexedDB sobrevive un restart completo de la app; el origin del documento es `http://tauri.localhost` (= valor congelado en F3).
- **Archivos:** procedimiento de QA documentado.

#### F7 — Gate Android device real (Capacitor) — **el escenario que motiva el blocker**

- **Qué:** `npm run cap:build` → `adb install -r` en un **device físico** → probar el relaunch de WebView que ocurre solo en redes flojas.
- **Criterio de done:**
  - [ ] **Lectura offline + relaunch de WebView:** boot online una vez → **force-stop** de la app (`adb shell am force-stop com.secondmind.app` o swipe-away) → **airplane mode** → relanzar → las notas siguen visibles offline. (Reproduce el "abro mi segundo cerebro y está vacío".)
  - [ ] **Replay de write — Caso A (post-flush · BLOQUEANTE):** airplane mode → editar nota de QA (marcador único) → **esperar el flush** (el SaveIndicator pasó por "Guardando…"/"Reintentando…", o expiró el debounce) → force-stop → relanzar aún offline → marcador **DEBE persistir** → desactivar airplane → verificar el doc en server vía Firebase MCP.
  - [ ] **Replay de write — Caso B (force-stop inmediato · DIAGNÓSTICO, no bloqueante):** editar el marcador → **force-stop inmediato SIN esperar el flush** → relanzar aún offline → **medir y documentar** si persiste. Cuantifica la ventana pre-`setDoc` (D11). NO falla el gate.
  - [ ] **Medir `navigator.storage.persist()`:** capturar y **registrar el valor de retorno real** en el device (logcat, prefijo `[storage:persist]` de F2). Documentar `true`/`false` — define el techo best-effort de Android (D8).
- **Notas (honestidad del techo Android · D8):** (a) **`persist()==false` en el device de QA NO bloquea el gate** — best-effort por diseño. (b) El force-stop reproduce el **relaunch feliz**, NO la **eviction LRU del OS bajo presión de memoria** (el techo que D8 admite): pasar F7 **no garantiza cero pérdida** en Android real. (c) La señal de escalada D8 es **cualitativa** — reportes de los 100 beta users, sin telemetría instrumentada; aceptable para el MVP, dicho acá para que no sorprenda.
- **Archivos:** procedimiento de QA documentado + valor de `persist()` registrado en el registro de implementación.

---

## Orden de implementación

1. **F1** → el cambio core; sin él nada del resto aplica. Verificar instancia única de Firestore antes de seguir.
2. **F2** → `persist()` en boot; independiente de F1 pero conviene junto (mismo PR, mejora el piso de Android que se medirá en F7).
3. **F3** → congelar scheme Tauri; independiente del código JS, necesario antes del gate Tauri (F6).
4. **F4** → documentar invariantes + kill-switch; antes de cerrar, para no perder el contexto de las decisiones.
5. **F5 → F6 → F7** → gates de QA, dependen de F1–F3 buildeados. Orden web→Tauri→Android por costo creciente (Playwright barato → device real caro). **Los 3 deben pasar antes de abrir la beta.**

## Estructura de archivos

```
src/lib/storagePersist.ts          # NUEVO (F2) — helper idempotente navigator.storage.persist() + log del retorno
```

**Modificados:** `src/lib/firebase.ts` (F1), `src/main.tsx` (F2, llama al helper), `src-tauri/tauri.conf.json` (F3), `CLAUDE.md` + `Spec/gotchas/*` + `Spec/ESTADO-ACTUAL.md` (F4).

## Definiciones técnicas

### Por qué `setDoc` colgado offline NO es un problema para P1 (pero sí lo es para P2)

`setDoc` no resuelve su promesa offline (Context7). El executor `await setDoc` de las saveQueues se cuelga → status `syncing` → "Guardando…" persiste (eso es **P2**, fuera de scope). **Pero la durabilidad de P1 no depende de que la promesa resuelva**: con `persistentLocalCache`, el SDK **ya persistió la mutación en su mutation-queue durable de IndexedDB** apenas se llamó `setDoc`, y la **replaya al reconectar** — sobreviva o no la saveQueue en memoria al reload. Por eso P1 se resuelve sin tocar las queues (D5).

**Residual aceptado — la ventana pre-`setDoc` (debounce del autosave):** la durabilidad del SDK arranca **en `setDoc`, no en el keystroke**. Entre que el usuario tipea y que el executor de la saveQueue dispara `setDoc` media el debounce del autosave (`AUTOSAVE_DEBOUNCE_MS`); durante esa ventana lo escrito vive **solo en la saveQueue en memoria** y un reload lo pierde — la mutación todavía no entró a la mutation-queue durable del SDK. D5 (no tocar las queues) deja ese debounce como el **factor limitante real** de la durabilidad de P1. **No se arregla en F56** (reducir el debounce o persistir las queues sería scope creep contra D5); se acepta como residual honesto y, si resulta material, es input para un SPEC futuro (D11). El gate lo **cuantifica** vía el Caso B de «Replay de write» (F5/F6/F7), sin bloquear por él.

### Por qué no hay conflicto cache-Firestore ↔ custom-persister-TinyBase

No existe persister local de TinyBase (verificado). La IndexedDB de Firestore sería la **única** caché local y es **complementaria**: alimenta a TinyBase vía `onSnapshot`/`getDocs` (resuelve el "app vacía offline"). El custom persister sigue idéntico (`getDocs`/`onSnapshot`/`setDoc merge:true`). Único matiz a observar en QA: con cache, `onSnapshot`/`getDocs` disparan primero `fromCache=true` y luego server — benigno para el flujo unidireccional actual.

### Restricciones del codebase que NO se rompen

- `content` de notas sigue **fuera de TinyBase** (Firestore directo vía repos `setDoc merge:true`).
- Custom persister Firestore↔TinyBase **intacto**.
- Las 11 saveQueues **intactas** (D5).
- Cambio **client-side** → hereda en Tauri/Capacitor sin código por plataforma (salvo F3, que es config Tauri).

---

## Checklist de completado

Al cerrar la feature, TODAS deben ser verdaderas:

- [ ] `src/lib/firebase.ts` usa `initializeFirestore` + `persistentLocalCache({ tabManager: persistentMultipleTabManager(), cacheSizeBytes: 40 MB })`; `db` es la única instancia Firestore (grep verificado).
- [ ] `navigator.storage.persist()` se llama una vez en boot y loggea su retorno (F2).
- [ ] `tauri.conf.json` fija `useHttpsScheme: false` explícito; invariante documentado en CLAUDE.md/gotchas (F3/F4).
- [ ] Read-through (D7), Android best-effort + escalada (D8) y kill-switch (C1) documentados, sin duplicar niveles.
- [ ] `npm run build` + `npm run lint` verdes.
- [ ] **Gate Web (F5):** criterios verdes — lectura offline, **replay Caso A (post-flush)** verificado en server, **multi-tab (2 pestañas, sin `failed-precondition`)**, corrupción degrada limpio, init-failure degrada limpio, revert probado. **Caso B (reload inmediato)** medido y documentado (no bloqueante, D11).
- [ ] **Gate Tauri Windows (F6):** lectura offline tras restart + **replay Caso A (post-flush)** verificado en server + IndexedDB durable. (Caso B medido, no bloqueante.)
- [ ] **Gate Android device real (F7):** lectura offline tras force-stop+relaunch + **replay Caso A (post-flush)** verificado en server + retorno de `persist()` registrado. (Caso B medido, no bloqueante.)
- [ ] **Las 11 saveQueues sin tocar** (diff de `src/lib/saveQueue.ts` y los hooks de status vacío).
- [ ] Release coordinado **0.4.x** (hosting + Tauri + Android) ejecutado **después** del gate, vía `release-ecosystem` (D10). **v0.5.0 NO se dispara acá** — la apertura de beta es un evento manual posterior que verifica que este pre-requisito ya está liberado y validado.

## Siguiente fase

- **P2 (fix aparte):** copy del `SaveIndicator` offline "Guardando…" → "Sin conexión" usando `useOnlineStatus` (ya existe). PR/commit independiente, ~5 líneas. No bloquea la beta.
- **Escalada condicional Android (D8):** SOLO si la beta evidencia pérdida real en Android → evaluar `@capacitor-firebase/firestore` (SDK nativo, persiste en filesystem). No antes (YAGNI).
- **Refactor futuro:** derivar el status de sync de `hasPendingWrites`/`waitForPendingWrites()` del SDK y simplificar/eliminar las saveQueues — solo si el costo de mantenerlas lo justifica.
