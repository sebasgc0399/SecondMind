# SPEC — Feature 12: Persister diff-based (TinyBase ↔ Firestore)

> Alcance: el custom persister de TinyBase emite `setDoc`/`deleteDoc` solo para las rows que cambiaron entre saves, no para toda la tabla.
> Dependencias: F10 (capa de repos) y F11 (store isolation + gating). El factory `createFirestoreRepo` queda intacto; el cleanup de `useStoreInit` sigue intacto.
> Estimado: 1-2 días dev (1 archivo core + tests + validación E2E).
> Stack relevante: TinyBase v8 `createCustomPersister` (API nativa `changes` desde v4.0+), Firebase Firestore (`setDoc`, `deleteDoc`, `onSnapshot`), Vitest 4.1 (`vi.mock` para firebase/firestore).

---

## Objetivo

El callback `setPersisted` actual itera todas las rows de la tabla en cada save. Con 500 items y 1 update local, dispara 500 `setDoc` redundantes a Firestore. F12 **delega el diff a la API nativa `changes`** (param 2 de `setPersisted` en TinyBase v8): el callback recibe el delta de la transacción ya computado por TinyBase y emite writes solo para added/modified y `deleteDoc` para removed. Reduce write amplification de O(N) a O(cambios) sin mantener ningún snapshot manual y, como bonus, cierra el gap de `delRow → deleteDoc` que F11 documentó.

---

## Features

### F1: Refactor `setPersisted` con `changes` nativo + delete detection + `onIgnoredError`

**Qué:** Reescribir el callback `setPersisted(getContent, changes?)` para consumir directamente el parámetro `changes` que TinyBase v8 provee. Para cada row en `changes[0][tableName]`: emitir `deleteDoc` si el valor es `null/undefined` (row eliminada) o `setDoc(fullRow, {merge:true})` usando el row reconstruido desde `getContent()`. Usar `Promise.allSettled` para que un write fallido no aborte los demás del mismo tick. Reportar rejects a través de un `onIgnoredError` conectado como 6º arg de `createCustomPersister`.

**Criterio de done:**

- [ ] `store.setRow('tasks', 'id-1', {...})` → `setDocMock` invocado 1× con el row entero y `merge:true`.
- [ ] `store.setPartialRow('tasks', 'id-1', {status: 'done'})` → `setDocMock` invocado 1× con el row entero (no parcial).
- [ ] `store.delRow('tasks', 'id-1')` → `deleteDocMock` invocado 1×.
- [ ] Con 500 rows en la tabla y 1 row modificada → 1 `setDoc` (no 500).
- [ ] `merge: true` preservado en todos los `setDoc` (precondición global del schema).
- [ ] Rejects individuales del `Promise.allSettled` se loguean con `console.error` filtrando `SILENT_ERROR_CODES` (patrón ya usado en `handleListenerError`), y se re-throwean al final (AggregateError si múltiples) para que `onIgnoredError` los reciba.

**Archivos a crear/modificar:**

- `src/lib/tinybase.ts` — refactor de `setPersisted` + helper local `isSilentError` para filtrar errores benignos de logout + 6º arg `onIgnoredError` pasado a `createCustomPersister`.

**Notas de implementación:**

- **`null` vs `undefined` en `Changes`:** el TYPE de TinyBase ([store/index.d.ts:1521-1529](../../node_modules/tinybase/%40types/store/index.d.ts#L1521-L1529)) permite solo `undefined` para "row eliminada", pero el JSDoc del mismo type usa `null` como ejemplo (`"fido": null`). Defensa: comparar con `== null` (doble igual) — matchea ambos sin costo de runtime.
- **`Promise.allSettled` (no `Promise.all`):** cada write completa independientemente. Con `Promise.all`, el primer reject hace que el `await` retorne sin esperar las demás promesas en vuelo. Con `allSettled` todas completan y recolectamos rejects al final para reportar juntos via `AggregateError`. Un `deleteDoc` fallido no debe abortar un `setDoc` OK del mismo tick.
- **Reconstrucción full-row desde `getContent()`:** `changes` trae deltas a nivel de cell (value parcial o `undefined` por cell), no el row completo. Reconstruir `fullRow = rowsContent[rowId]` desde el state actual es más simple y safe que aplicar cell-changes parciales.
- **Orden crítico de F11 intacto:** `destroy() → delTable()` en cleanup de `useStoreInit`. F12 NO toca esto. Tras destroy, el `firestoreUnsubscribe` está apagado y `delTable` no dispara save → no se borra Firestore en logout. Pero si alguien invierte el orden: `delTable` con persister vivo produce `tableChanges == null` (ver gotcha abajo) — no borra masivamente porque se trata como path de warn defensivo.
- **`delTable` masivo NO se implementa:** cuando TinyBase emite `tableChanges == null` (tabla entera borrada), `getContent()` post-delTable ya no tiene los rows → no podemos enumerar IDs para borrar. Branch defensivo: `console.warn` + return. Un `getDocs(col)` extra solo sería útil si `delTable` se llama con persister vivo, escenario que F11 evita por diseño.
- **Esta feature cambia el comportamiento documentado en [Spec/ESTADO-ACTUAL.md](../ESTADO-ACTUAL.md) línea 47:** "delTable con persister snapshot-based NO borra Firestore" queda reemplazado por "`delRow → deleteDoc` sí propaga post-F12; `delTable` con persister activo dejaría docs huérfanos pero F11 destruye el persister antes → no es problema en producción". Actualizar en step 8 del SDD.

---

### F2: Fallback cuando `changes === undefined`

**Qué:** Decidir cómo responde el callback cuando TinyBase invoca `setPersisted` sin `changes`. El caso típico es el primer tick post-`startAutoLoad` (sin cambios pendientes, solo carga). Decisión: **skip + `console.debug` en dev para observabilidad**.

**Criterio de done:**

- [ ] Cuando `changes` es `undefined`, el callback retorna sin invocar `setDoc` ni `deleteDoc`.
- [ ] En modo dev (`import.meta.env.DEV`), se emite un `console.debug` identificando `tableName` para detectar regresiones futuras (si alguna nueva ruta de TinyBase empieza a llamar sin `changes`, lo veremos en la consola).
- [ ] Validación empírica pre-código confirma que el primer tick post-`startAutoLoad` entrega `changes === undefined` o `tableChanges === undefined` (tabla intacta). Si no se confirma, reconsiderar el fallback (probablemente snapshot híbrido solo para el primer tick).

**Archivos a crear/modificar:**

- Ninguno adicional — es una branch dentro del `setPersisted` refactorizado en F1.

**Notas de implementación:**

- El comportamiento conservador alternativo ("escribir todo si no sé qué cambió") **anula el ahorro de F12** y reintroduce los 500 setDocs en el caso dominante (load inicial). Inaceptable.
- El escape de emergencia si R2 falla: reintroducir un snapshot mínimo solo para el primer save post-load, usando `changes` nativo para los saves subsiguientes. No implementar preventivamente — solo si la validación empírica lo exige.

---

### F3: Tests unitarios del persister con Vitest

**Qué:** Suite de tests aislados que mockee `setDoc`/`deleteDoc`/`getDocs`/`onSnapshot`/`doc`/`collection` de `firebase/firestore` y verifique el comportamiento del diff. Patrón ya establecido en [src/infra/repos/baseRepo.test.ts](../../src/infra/repos/baseRepo.test.ts).

**Criterio de done:**

- [ ] **Test 1:** `startAutoLoad` con N rows mock + el siguiente tick de `setPersisted` con `changes === undefined` ⇒ `setDocMock`, `deleteDocMock` no llamados.
- [ ] **Test 2:** `store.setRow` con row nueva ⇒ `setDocMock` llamado 1× con `merge:true`.
- [ ] **Test 3:** `store.setPartialRow` con un cell modificado ⇒ `setDocMock` llamado 1× con el row entero (no parcial), `merge:true`.
- [ ] **Test 4:** `store.delRow` ⇒ `deleteDocMock` llamado 1×.
- [ ] **Test 5:** `store.setRow` x3 en una transacción manual ⇒ `setDocMock` llamado 3× (una por row, todas en el mismo `Promise.allSettled`).
- [ ] **Test 6:** 1 add + 1 delete + 1 modify simultáneos en transacción ⇒ 2× `setDocMock` + 1× `deleteDocMock`.
- [ ] **Test 7 (invariante real post-auditoría):** `setDocMock.mockImplementationOnce(reject)` para 1 de 3 ⇒ los 3 setDocs se invocan (porque `Promise.allSettled` no aborta), `onIgnoredError` callback recibido 1× con el error del que falló (o `AggregateError` si múltiples), siguiente cambio del store NO re-escribe la row fallida (TinyBase no reintenta — `changes` solo trae los cambios desde el último save; la row fallida queda eventualmente consistente cuando vuelva a tocarse).
- [ ] **Test 8:** `store.delTable(tableName)` produce `tableChanges == null` ⇒ `console.warn` invocado vía `vi.spyOn(console, 'warn')`, `deleteDocMock` y `setDocMock` no llamados.
- [ ] Todos pasan con `npm test` y aparecen en el conteo (Vitest los descubre por convención `*.test.ts`).

**Archivos a crear/modificar:**

- `src/lib/tinybase.test.ts` — nuevo. Imitar setup de `baseRepo.test.ts` (mocks de `firebase/firestore` con `vi.fn()`, mock de `@/lib/firebase` para `db`/`auth`).

**Notas de implementación:**

- El persister opera con un `Store` real de TinyBase, no mockeado: importar `createStore` de `tinybase` y construir uno con schema mínimo en cada test. Es la única forma de testear el diff end-to-end.
- Test 8 usa `vi.spyOn(console, 'warn')` — patrón estándar Vitest, frágil al wording del mensaje pero aceptable (alternativa de contador exportado descartada por agregar superficie no-funcional al módulo de producción).
- No testear el `addPersisterListener` (onSnapshot mock complejo). Su path está cubierto por F4 (validación E2E manual).

---

### F4: Validación E2E + medición de write count

**Qué:** Ejecutar 4 escenarios end-to-end con la app real y contar writes en Network tab (DevTools → Filter `firestore.googleapis.com`). Establecer baseline post-F12 verificable a futuro.

**Criterio de done:**

- [ ] **Escenario A — write amplification:** crear 50 tasks via UI (`tasksRepo.create` x50), modificar 1 (`tasksRepo.update`). Esperado: ~50 writes en la creación + **2 writes** en el update (1 repo `setDoc` + 1 persister `setDoc` disparado por `store.setRow`). Pre-F12 sería 50 + 51 = 101. Cross-check con Firebase MCP `firestore_query_collection`.
- [ ] **Escenario B — delete propagation:** `tasksRepo.remove(id)` con 1 task → 1 `deleteDoc` en Network tab + doc desaparece de Firestore (Firebase MCP `firestore_get_document` ⇒ not found).
- [ ] **Escenario C — regresión F11 cleanup:** signOut → login (mismo user) ⇒ tasks persisten. Si segundo Google account disponible: signOut → login (otro user) ⇒ tasks del user A NO visibles al user B. Si no: simulación cambiando `auth.currentUser.uid` en código + reload.
- [ ] **Escenario D — interacción con `useNoteSave`:** editar contenido de una nota (auto-save 2s) → 1 `updateDoc` desde `notesRepo.saveContent` + 0 `setDoc` adicionales del persister para esa row. Todos los timestamps del repo son `Date.now()` (verificado en auditoría), no `serverTimestamp()` → el echo del onSnapshot trae el mismo dato y `changes` no marca cambio.
- [ ] Sin loops infinitos: tras parar de tocar, los writes deben cesar en ≤500ms (latencia típica del último onSnapshot echo). Si siguen llegando indefinidamente, hay loop.

**Archivos a crear/modificar:**

- Ninguno. Es validación + documentación.

**Notas de implementación:**

- Escenario C requiere segundo Google account real para validación cross-user limpia. Si no disponible, la simulación con uid hardcoded + reload captura el cleanup path de `useStoreInit`.
- **`IGNORED_DIFF_FIELDS` defensa preventiva:** inventario de timestamps en repos confirma que TODOS usan `Date.now()` (cliente y servidor leen el mismo valor). El único `serverTimestamp()` aparece en [src/app/capture/page.tsx:53](../../src/app/capture/page.tsx#L53) en un field que NO entra a TinyBase. **No necesita activarse por ahora.** Si en el futuro alguien introduce `serverTimestamp()` en un field que va a TinyBase, el echo podría generar writes extra — en ese caso aplicar como hotfix dentro de F12-equivalente (sin feature nueva), skipeando esos fields en la comparación del diff.

---

## Orden de implementación

1. **Step 0 pre-código** → validación empírica R2 (ver sección "Riesgos residuales"). Si falla, reconsiderar F2 antes de seguir.
2. **F1 + F2** (commit atómico) → refactor `setPersisted` con `changes` nativo, `Promise.allSettled`, `onIgnoredError`, fallback skip + debug log.
3. **F3** (commit separado) → 8 tests Vitest.
4. **F4** (no commit de código) → validación E2E manual con Playwright MCP + Firebase MCP + DevTools.

---

## Estructura de archivos

```
src/lib/
├── tinybase.ts          # MODIFICA (setPersisted refactor + onIgnoredError + helper isSilentError)
└── tinybase.test.ts     # NUEVO (suite Vitest del persister, 8 tests)
```

Sin nuevos archivos en `src/hooks/` ni `src/infra/`. La feature es un patch puntual al persister; la API pública (`createFirestorePersister`) queda inalterada — los call sites en `src/hooks/useStoreInit.ts` no cambian.

---

## Definiciones técnicas

### D1: Delegar diff a la API nativa `changes` de TinyBase v8

- **Opciones consideradas:** (A) mantener `previousRows` snapshot manual en closure + `shallowEqualRow` + `cloneRows`, (B) consumir el parámetro `changes` (2º arg de `setPersisted`) que TinyBase ya provee nativo.
- **Decisión:** B.
- **Razón:** Auditoría reveló que el type `PersistedChanges<StoreOnly> = Changes` ([persisters/index.d.ts:1879-1882](../../node_modules/tinybase/%40types/persisters/index.d.ts#L1879-L1882)) ya trae el delta de la transacción computado. El snapshot manual era reimplementación de una API existente: ~40 LoC innecesarias (helpers de clone + shallow equal), closure con estado que sincronizar, y tests difíciles de escribir (`previousRows` no es observable sin hacks). Delegar elimina código, mejora observabilidad de tests (writes esperados/no esperados directamente con `setDocMock`/`deleteDocMock`) y aprovecha la infraestructura de transacciones de TinyBase.

### D2: Granularidad del `setDoc` en modify (row entera vs solo el campo cambiado)

- **Opciones consideradas:** (A) emitir `setDoc(id, fullRow, { merge: true })` siempre, (B) emitir `setDoc(id, { soloLosCamposCambiados }, { merge: true })`.
- **Decisión:** A.
- **Razón:** B requiere extraer cell-changes parciales desde `changes[0][table][row]` (donde `undefined` significa "cell borrada") y construir un payload merging. Con `merge: true` garantizado y rows ≤20 campos pequeños, escribir el row entero pesa lo mismo en bytes y es menos código. El ahorro real de F12 viene del nivel de "qué rows se escriben", no de "qué campos por row".

### D3: Usar `Promise.allSettled` para writes paralelos del mismo tick

- **Opciones consideradas:** (A) `Promise.all` con abort en primer reject, (B) `Promise.allSettled` con recolección de rejects al final.
- **Decisión:** B.
- **Razón:** Con `Promise.all`, un primer reject hace que el `await` retorne sin esperar las demás promesas (que siguen en vuelo, sin observación). Un `deleteDoc` fallido abortaría un `setDoc` OK del mismo tick, dejando el error handling inconsistente. Con `allSettled` cada write completa independientemente y reportamos rejects juntos via `AggregateError` al `onIgnoredError`. Costo: cero (TinyBase no reintenta igual — ver D4).

### D4: No retry automático ante fallo de `setPersisted`

- **Opciones consideradas:** (A) confiar en TinyBase para retry, (B) implementar retry manual con backoff, (C) aceptar eventual consistency (no retry).
- **Decisión:** C.
- **Razón:** Auditoría confirmó que TinyBase no reintenta cuando `setPersisted` rechaza — solo llama a `onIgnoredError` (6º arg opcional de `createCustomPersister`). El siguiente save trae solo las rows cambiadas desde el último save exitoso. Las rows fallidas quedan eventualmente consistentes solo cuando vuelven a tocarse. Implementar retry custom duplica lógica del SDK y arriesga loops en logout legítimo. Gotcha a documentar: "fallos transitorios del persister no se reintentan; `onIgnoredError` loguea pero no re-encola. Es 'best effort' eventual consistency."

---

## Riesgos residuales (validar empíricamente en implementación)

- **R1 (alto):** ¿`changes` se entrega siempre cuando hay cambios reales? Mitigación: `console.debug` en la branch `!changes` durante dev — si aparece junto a una mutación real esperada, hay regresión a investigar antes de mergear.
- **R2 (medio, valida pre-código):** Shape exacto de `changes` durante el primer tick post-`startAutoLoad`. Sospecha: `undefined` (solo carga, sin cambios pendientes). Si llega definido con todas las rows como "modified", el skip reintroduce el problema → escape: snapshot híbrido solo para el primer tick. Paso pre-código obligatorio: agregar log temporal, validar en dev, revertir log antes del commit de refactor.
- **R3 (medio):** `onIgnoredError` puede no estar conectado al rejection del callback custom; verificar con un test forzando reject (Test 7).
- **R4 (bajo):** Múltiples `setRow` en mismo tick coalescen en una sola invocación de `setPersisted` (Test 5 valida).

---

## Checklist de completado

- [ ] `src/lib/tinybase.ts` refactorizado: callback `setPersisted(getContent, changes?)` consume `changes` nativo, `Promise.allSettled` para writes paralelos, helper `isSilentError` local, 6º arg `onIgnoredError` conectado.
- [ ] `src/lib/tinybase.test.ts` creado con 8 tests pasando (F3 criterio de done).
- [ ] `npm run build` compila sin errores TS.
- [ ] `npm test` pasa todos los tests existentes (5 de baseRepo) + 8 nuevos.
- [ ] `grep previousRows src/lib/tinybase.ts` ⇒ 0 resultados (confirmando que no quedó código del SPEC original).
- [ ] R2 validado empíricamente: primer tick post-load entrega `changes === undefined` o tabla intacta (pre-código, revert del log antes de commit).
- [ ] Escenario A E2E validado: 50 creates + 1 update = 52 writes (no 101).
- [ ] Escenario B E2E validado: `tasksRepo.remove` borra de Firestore.
- [ ] Escenario C E2E validado: cleanup multi-user sigue funcionando post-F12.
- [ ] Escenario D E2E validado: editar nota no genera writes extra del persister.
- [ ] `Spec/ESTADO-ACTUAL.md` línea 46 (write amplification): marcado resuelto por F12 o eliminado.
- [ ] `Spec/ESTADO-ACTUAL.md` línea 47 (delTable no borra): reescrito con el comportamiento post-F12 (delRow sí propaga; delTable queda huérfano pero F11 lo evita).
- [ ] Branch `feat/persister-diff-based` mergeada `--no-ff` a `main`.
- [ ] Deploy hosting (`npm run build && npm run deploy`) — 100% client-side, no toca CFs ni Tauri ni Android.

---

## Siguiente fase

Sin candidatos pendientes del backlog F10 tras F12. El siguiente trabajo se decide al arrancar la próxima sesión desde la lista de "Candidatos próximos" en `Spec/ESTADO-ACTUAL.md` (Command Palette semántico, AI-suggested links en el editor, Floating menu, etc.) o tareas nuevas que surjan del dogfooding.
