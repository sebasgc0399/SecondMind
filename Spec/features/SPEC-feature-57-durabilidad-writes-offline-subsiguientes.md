# SPEC — Feature 57: Durabilidad de writes offline subsiguientes (D13 — re-disparo del `saveQueue`)

> **Alcance:** offline, el 2º+ `setDoc` de una entidad se vuelve durable (re-disparo al SDK) → la app sobrevive a un kill sin perder lo escrito **después** del primer write.
> **Dependencias:** SPEC-56 (`persistentLocalCache` provee la mutation-queue durable del SDK; sin ella este fix no tiene dónde persistir).
> **🔴 Pre-requisito DURO de beta — bloquea v0.5.0.** La beta NO abre sin este fix + sus gates de QA verdes.
> **Stack relevante:** `saveQueue` ([src/lib/saveQueue.ts](../../src/lib/saveQueue.ts)), Firestore SDK 12.x `persistentLocalCache`.
> **Base de evidencia:** dos research-first con spikes descartables (browser real + `persistentLocalCache` + emulador, verificado en server). Hallazgos en el Decision Log + memorias `reference-offline-durability-spike` / `reference-firestore-write-rejection-observability`.

---

## Objetivo

Cerrar el residual **D13** de SPEC-56: hoy, offline, solo el **primer** `setDoc` de cada entidad es durable ante un kill — los cambios subsiguientes viven en la `saveQueue` en memoria y se pierden si la app muere antes de reconectar (force-stop, OS-kill del WebView en background, crash). Al terminar esta fase, tras editar una nota **varias veces offline** y morir la app antes de reconectar, al reabrir + reconectar el **server recibe el estado FINAL** (no solo el primer write). En móvil el OS-kill hace este escenario realista — es exactamente el daño que SPEC-56 existía para prevenir.

---

## Qué resuelve — root cause de D13

`saveQueue` serializa por entidad. En `enqueue` ([saveQueue.ts:181](../../src/lib/saveQueue.ts)), cuando llega un upsert y el entry ya está `syncing`, reemplaza el payload y bumpea `version` **pero NO re-dispara** `setDoc`:

```ts
// enqueue, rama upsert (L206-211)
status: wasSyncing ? 'syncing' : 'pending',
version: ++nextVersion,
...
if (!wasSyncing) void executeEntry(id);   // ← wasSyncing ⇒ NO re-dispara
```

Confía en el version-check post-`await` del `executeEntry` en vuelo ([saveQueue.ts:116](../../src/lib/saveQueue.ts), `if (current.version !== startVersion) void executeEntry(id)`). Pero **offline ese `await setDoc` nunca resuelve** (la promesa espera el ack del backend — Context7) → el version-check nunca corre → el payload nuevo nunca llega a la mutation-queue durable del SDK. **Solo el primer `setDoc`** (ya entregado al SDK antes de suspender el `await`) sobrevive a un kill.

**Fix (Option A):** offline, que el upsert subsiguiente **re-dispare `executeEntry`** (= un `setDoc` con el payload final entregado a la queue durable del SDK ahora, sin esperar a que resuelva el primero).

---

## Decision Log

| #      | Decisión                                                                                                                                                                                                                                                                                                                                      | Estado / Razón                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | **Dirección = FIX MÍNIMO (Option A):** re-disparar `setDoc` offline. Descartado: refactor a `hasPendingWrites` (eliminar la serialización del `saveQueue`, SDK como fuente única de status).                                                                                                                                                  | **Cerrada (research-first).** El refactor se descarta por **DOS** razones, no solo costo: **(a)** pierde el fast-fail de errores permanentes — el SDK reintenta indefinidamente un write rechazado en vez de marcarlo `error`; **(b)** el spike probó que **el SDK NO expone el rechazo de write por `onSnapshot`** (solo vía la promesa de `setDoc` o un rollback silencioso) → sin el `.catch` del executor, F29 pasaría de "funciona same-session" a **"nunca dispara"**. Es **regresión de capacidad**, no solo más caro.                                                                                                                                                                                                                                                                                                                  |
| **D2** | **Re-disparo vía el EXECUTOR (`executeEntry`), NUNCA fire-and-forget.**                                                                                                                                                                                                                                                                       | **Cerrada (no negociable).** El `.catch` del executor (`await entry.executor(payload)`) es el único punto donde `isPermanentError` ve el rechazo permanente same-session. Un `setDoc` fire-and-forget entregaría durabilidad pero **sacaría el re-disparo del executor → rompería F29**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **D3** | **El re-disparo se gatea a OFFLINE** (`navigator.onLine === false`, mismo signal que [useOnlineStatus.ts](../../src/hooks/useOnlineStatus.ts)). Online + `wasSyncing` mantiene el comportamiento actual (no re-dispara; el in-flight resuelve rápido y su version-check ya maneja).                                                           | **Cerrada (restricción 2).** No regresar el caso online + app-viva (ya funciona). **Residual conocido del gate (NO es "captive portal raro"):** cuando `navigator.onLine===true` pero el `setDoc` no ackea pronto (red móvil degradada, conexión sin salida real, captive portal), el fix NO se activa → los writes subsiguientes NO son durables; si la app muere en esa ventana (OS-kill en background) se pierden IGUAL que en D13. La ventana es estrecha (red-degradada-pero-online + edición múltiple + kill antes de que la red vuelva o el user reabra) PERO incluye el caso **Android red-lenta + OS-kill**, plausible para el target de la beta. Se acepta como residual pre-beta por simplicidad + el patrón de diferir-con-datos; se mide en beta y se cierra gateando por timeout (candidato post-beta — ver § Fuera de alcance). |
| **D4** | **Idempotencia por el version-check EXISTENTE, sin rediseño.** El re-disparo crea un executor concurrente al in-flight; al reconectar ambos resuelven y el version-check ([saveQueue.ts:116](../../src/lib/saveQueue.ts), `:164`) converge (el de `startVersion` desactualizado re-ejecuta/retorna; el de versión actual finaliza el status). | **Cerrada — se LOCKEA con unit test (F2), no con código nuevo.** Residual aceptado: un `setDoc` extra en la reconexión (write-amplification), **acotado por el debounce de 2 s** (`AUTOSAVE_DEBOUNCE_MS`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **D5** | **Overhead de N mutaciones = trade-off documentado, SIN coalescencia.** El SDK no colapsa: guarda N mutaciones (verificado — dos `setDoc` offline al mismo doc dejan dos mutaciones, ambas replayadas).                                                                                                                                       | **Cerrada (YAGNI).** El debounce de 2 s ya coalesce el typing rápido → solo tandas de edición separadas (>2 s) generan mutaciones distintas. Cada mutación es chica; el SDK las replaya **en orden, último gana** (verificado en server) → correctness intacta. Agregar coalescencia (cancelar el in-flight + reemplazar) es complejidad que la durabilidad no necesita.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

---

## Features

### F1: Re-disparo offline del `setDoc` subsiguiente en `saveQueue.enqueue`

**Qué:** En la rama upsert de `enqueue`, además de re-disparar cuando `!wasSyncing` (hoy), re-disparar también cuando el entry estaba `syncing` **y** `navigator.onLine === false`. Entrega el payload final a la mutation-queue durable del SDK sin esperar al `setDoc` en vuelo.

**Criterio de done:**

- [ ] Offline, `enqueue(id, v2)` sobre un entry `syncing` invoca `executeEntry(id)` (re-dispara `setDoc(v2)`).
- [ ] Online, `enqueue(id, v2)` sobre un entry `syncing` **NO** invoca `executeEntry(id)` (comportamiento idéntico al actual — restricción 2).
- [ ] Sin upsert (entry nuevo) el comportamiento no cambia.
- [ ] `npm run lint` + `npm run build` verdes.

**Archivos a crear/modificar:**

- `src/lib/saveQueue.ts` — condición de re-disparo en la rama upsert de `enqueue` (~L211).

**Notas de implementación:**
Cambio mínimo en una línea de decisión:

```ts
const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
notify();
if (!wasSyncing || offline) void executeEntry(id);
```

Guard `typeof navigator` por seguridad en entornos sin DOM (tests/SSR). No tocar `executeEntry` ni el version-check — su lógica de convergencia (D4) ya es correcta; este fix solo cambia **cuándo** se re-dispara.

---

### F2: Unit tests — F29 preservado + durabilidad + no-regresión online

**Qué:** Tres tests en `saveQueue.test.ts` que cierran las restricciones 1 y 2 sobre el path nuevo (upsert-during-syncing), que hoy **ningún test cubre**.

**Criterio de done:**

- [ ] **F2a (durabilidad):** offline, `enqueue(id,v1)` (executor queda pending) → `enqueue(id,v2)` durante `syncing` (bump version + re-dispara) → al resolver ambos `setDoc` con éxito, el executor se llamó con `v2` y el status final es `synced` con el payload `v2`.
- [ ] **F2b (F29 fast-fail por el path re-disparado):** offline, `enqueue(id,v1)` pending → `enqueue(id,v2)` durante `syncing` → **ambos** intentos rechazan `FirebaseError('permission-denied')` → status final `error`, **sin** retries de backoff, una sola transición final a `error`. (Valida que el version-check re-execute no se traga el permanente y que `isPermanentError` lo cosecha.)
- [ ] **F2c (no-regresión online):** online (`navigator.onLine` mockeado `true`), `enqueue(id,v2)` durante `syncing` → `executeEntry` NO se invoca por el enqueue (el in-flight + su version-check manejan, como hoy).
- [ ] Los 3 verdes con `npm test`.

**Archivos a crear/modificar:**

- `src/lib/saveQueue.test.ts` — 3 tests nuevos.

**Notas de implementación:**
Mockear `navigator.onLine` por test (jsdom default `true`). Reusar el patrón de executors controlables (promesa diferida) del suite existente (test 6 = permission-denied; test 14 = version-mismatch re-execute con éxito) — F2b combina ambos ejes, que es justo el gap.

---

### F3: Gates de QA — 3 frentes, Caso A bloqueante

**Qué:** Verificar el fix end-to-end en web → Tauri → Android, replicando el patrón de gates de SPEC-56 (F5/F6/F7).

**Criterio de done (Caso A bloqueante por frente):**

- [ ] **F3-web (Playwright + Firebase MCP):** editar una nota offline en **≥2 tandas separadas (>2 s)** → kill (reload/cerrar pestaña) **antes de reconectar** → reabrir → reconectar → **verificar EN SERVER (Firebase MCP)** que el doc tiene el **estado FINAL** (no solo el primer write). NO-GO si el server solo tiene el primer write.
- [ ] **F3-tauri (Windows):** idem, cerrar + relanzar la app offline antes de reconectar.
- [ ] **F3-android (device real):** idem con **OS-kill (force-stop)** offline + airplane mode; verificar server tras reconexión (replay puede tardar ~1 min en Android — esperar, no asumir inmediato).
- [ ] **No-regresión online (los 3 frentes o al menos web):** editar online en varias tandas → el server converge al estado final igual que hoy, sin writes espurios observables.

**Archivos a crear/modificar:** ninguno (QA). Dev server `npm run dev`; UID de QA de Sebastián (no borrar sus datos).

---

### F4: Cierre de docs — escalar D13 a "resuelto"

**Qué:** Actualizar el gotcha D13 de "límite conocido" a "resuelto en SPEC-57", el registro, y el tracking en ESTADO-ACTUAL.

**Criterio de done:**

- [ ] `Spec/gotchas/tinybase-firestore.md` — la entrada D13 marca el fix aplicado (re-disparo offline + gate `navigator.onLine`) y el residual cross-restart como **fuera de alcance** (ver abajo).
- [ ] `Spec/ESTADO-ACTUAL.md` § Candidatos próximos — SPEC-57 movido a "en curso/cerrado" con pointer; registrados los 2 candidatos nuevos (cross-restart + adelgazar saveQueue).
- [ ] Este SPEC convertido a registro de implementación al cerrar (SDD step 8, skill `archive-spec`).

**Archivos a crear/modificar:**

- `Spec/gotchas/tinybase-firestore.md`, `Spec/ESTADO-ACTUAL.md`, este archivo.

---

## Orden de implementación

1. **F1** → el fix. Sin él no hay nada que testear.
2. **F2** → depende de F1; lockea la corrección (F29 + durabilidad + no-regresión) antes de QA manual.
3. **F3** → gates E2E; corren con F1+F2 verdes. El Caso A bloqueante es el GO/NO-GO de la feature.
4. **F4** → docs, al cerrar (tras gates verdes + release si aplica).

---

## Fuera de alcance (explícito — que NO se cuele)

- **Gap cross-restart de rollback silencioso.** Tras un kill, un write durable que el server **rechaza** (permission-denied) revierte el doc al valor server **sin aviso** (en doc existente, la edición del usuario desaparece y reaparece el valor viejo). Es **PRE-EXISTENTE** (nació con la durabilidad de SPEC-56, no con D13) y **ortogonal**: el fix no lo causa ni cambia su resultado **por-doc** (el rollback es uno por doc). El fix sí **amplía la cantidad** de mutaciones que pueden entrar al agujero (de 1 a N durables), pero esos writes estaban destinados al rechazo igual. **NO se aborda acá.** Candidato separado: reconciliación vía listener (detectar la row que rollbackeó). Trigger: frecuencia de errores permanentes en beta.
- **Residual del gate `navigator.onLine` (online-degradado).** El gate no cubre la ventana red-degradada-pero-online (incl. **Android red-lenta + OS-kill**): si el `setDoc` no ackea y la app muere antes de reconectar, los writes subsiguientes se pierden como en D13 (caracterización completa en D3). **Distinto del cross-restart:** acá el write nunca llegó a la mutation-queue durable del SDK; allá llegó y fue rechazado. **NO se aborda acá.** Candidato separado: gatear por **timeout** (re-disparar si el `setDoc` lleva >N s en vuelo) en vez de `navigator.onLine`. Trigger: frecuencia de pérdidas por write-en-vuelo-no-durable observada en beta.
- **Adelgazar / refactorizar el `saveQueue`** (endgame del refactor). Candidato separado — y NO puede ser `hasPendingWrites` puro (debe conservar el `.catch` del executor para F29; ver D1).
- **Generalización a otros `PERMANENT_ERROR_CODES`** más allá de `permission-denied` (el código real de rechazo por security rules; `unauthenticated` suele disparar token-refresh + retry, no reject+rollback).
- **P2 copy "Sin conexión", auto-recuperación `dd85`/D12, escalada Android al plugin nativo** — ya fuera por SPEC-56.

---

## Checklist de completado

Al cerrar SPEC-57, TODAS verdaderas:

- [ ] F1 implementado; `npm run lint` + `npm run build` verdes.
- [ ] F2a/F2b/F2c verdes (`npm test`).
- [ ] **F3 Caso A bloqueante verde en los 3 frentes** (web + Tauri + Android), verificado EN SERVER vía Firebase MCP.
- [ ] No-regresión online confirmada.
- [ ] D13 escalado a "resuelto" en gotchas; cross-restart declarado fuera de alcance; ESTADO-ACTUAL actualizado.
- [ ] (Si se libera) release coordinado 3 frentes vía skill `release-ecosystem`.

---

## Siguiente fase

Con D13 resuelto se levanta el **último bloqueante duro de la beta v0.5.0**. Los dos candidatos derivados (reconciliación cross-restart + adelgazar el `saveQueue`) quedan registrados en ESTADO-ACTUAL con trigger común = **frecuencia de errores permanentes observada en la beta** — se priorizan con datos, no antes.
