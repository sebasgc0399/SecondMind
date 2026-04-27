# SPEC F30 — Retry queue extendido a los creates

> Estado: Por implementar
> Dependencias: F29 (factory `createFirestoreRepo` con `queue?` inyectable + `<PendingSyncIndicator />` agnóstico al número de queues + `clear()` en `SaveQueue<T>`).
> Estimado: 1-2 sesiones (4 sub-features mecánicas + 1 ajuste de race + 1 QA E2E).
> Stack relevante: factory `createFirestoreRepo` (`src/infra/repos/baseRepo.ts`), `createSaveQueue<T>` (`src/lib/saveQueue.ts`), `<PendingSyncIndicator />` + `usePendingSyncCount` (F29.5), `useNote` (`src/hooks/useNote.ts`).
> Pointer histórico: F29 SPEC (`Spec/features/SPEC-feature-29-factory-retry-queue.md`) — F30 cierra explícitamente la deuda "Creates con retry queue" listada en F29 § Out of scope.

---

## Objetivo

Cerrar el silent data loss en los **creates** del factory `createFirestoreRepo`. Pre-F30: `update` y `remove` pasan por queue (post-F29) con backoff + sign-out guard, pero `create` (`baseRepo.ts:39-51`) sigue haciendo `await setDoc` directo. Si la red falla durante el create, la row local en TinyBase queda escrita (porque `setRow` corre sync ANTES del `setDoc`) pero el doc en Firestore nunca llega. Próxima hidratación, el `onSnapshot` del persister "limpia" la row local con server stale → la entidad creada desaparece.

**Bloqueo arquitectónico de F29**: encolar `setDoc` en background rompe el contrato `Promise<string>` que asumen los callers. Hoy `const id = await createNote(); navigate('/notes/' + id);` espera que el doc EXISTA en Firestore antes del navigate, porque la página destino (`useNote(id)`) hace `getDoc` directo y redirect-on-notFound. Si el create se vuelve fire-and-forget, el `getDoc` resuelve a "doesn't exist" y la página redirige.

**Solución F30**: el factory genera UUID local sync (`crypto.randomUUID()` o `opts.id`), aplica `setRow` sync, encola `setDoc(...{merge:true})` con backoff, y retorna el id **inmediatamente**. El caller obtiene el id sync (contrato preservado). La página destino se ajusta para tolerar el caso "row en TinyBase pero doc no en Firestore aún" cross-checkeando contra el queue de creates: si hay entry pending para ese id, confiar en TinyBase como fuente de verdad y NO redirect. Cuando el queue confirma el `setDoc`, el `onSnapshot` re-hidrata con el server doc real (ya idéntico a la row local).

UI: el `<PendingSyncIndicator />` ya itera `allQueues` linealmente (F29.5) y es agnóstico al número de entries. Sumar 4 nuevos singletons al array → el indicator automáticamente cuenta y muestra "1 nota nueva sin sincronizar" (label custom para creates) sin tocar el componente.

---

## Alcance — qué creates entran y cuáles no

**SÍ entran** (4 métodos `create*` con factory backing, retornan `Promise<string | null>`, callers pueden navegar):

- `notesRepo.createNote` (`src/infra/repos/notesRepo.ts:31`)
- `notesRepo.createFromInbox` (`src/infra/repos/notesRepo.ts:148`) — caso especial: payload incluye `content` extra-schema (TipTap JSON serializado).
- `tasksRepo.createTask` (`src/infra/repos/tasksRepo.ts:29`)
- `projectsRepo.createProject` (`src/infra/repos/projectsRepo.ts:22`)
- `objectivesRepo.createObjective` (`src/infra/repos/objectivesRepo.ts:21`)

**NO entran**:

- `habitsRepo` — no tiene `create*`, solo `toggleHabit` (lazy-init via `update`).
- `inboxRepo` — solo orquesta conversores (`convertToNote/Task/Project`) que delegan a los creates anteriores. La creación local de inbox items vive en `QuickCaptureProvider.tsx:30-44` con `crypto.randomUUID()` + `inboxStore.setRow` sync; el sync a Firestore va por el persister auto-loop, no por el factory. Fuera de scope.
- Bulk migration / restore-from-backup creates — no existen hoy. Si surgen, `createRaw` por simetría con `removeRaw` (F29.G1) — out-of-scope v1.

---

## Qué se va a implementar

### F30.1 — Singletons de creates en `saveQueue.ts`

**Qué**: agregar 4 nuevos singletons al final de `src/lib/saveQueue.ts`, tipados como `SaveQueue<Row>` (Row completo, NO `Partial<Row>` — un create siempre carga el row entero).

```ts
export const saveNotesCreatesQueue = createSaveQueue<NoteRow>();
export const saveTasksCreatesQueue = createSaveQueue<TaskRow>();
export const saveProjectsCreatesQueue = createSaveQueue<ProjectRow>();
export const saveObjectivesCreatesQueue = createSaveQueue<ObjectiveRow>();
```

Extender el array `allQueues` para sumar los 4 nuevos. Crear array auxiliar `createsQueues` (los 4 nuevos) por simetría con `metaQueues`.

`NoteRow` necesita aceptar el campo extra-schema `content?: string` para `createFromInbox`. Opciones (resolver en Plan mode): (a) extender `NoteRow` con `content?: string` opcional en `repoRows.ts`; (b) tipar el queue como `SaveQueue<NoteRow & { content?: string }>` solo para `saveNotesCreatesQueue`; (c) cast en el sitio de enqueue. Default propuesto: opción (b) — limita el cambio al singleton sin contaminar `NoteRow` con un campo que TinyBase ignora.

**Criterio de done:**

- [ ] 4 singletons exportados, tipados con el Row correspondiente.
- [ ] `allQueues` incluye los 4 nuevos (longitud 11 = 1 content + 6 metas + 4 creates).
- [ ] Array `createsQueues` exportado para iteración targeted.
- [ ] `NoteRow` (o `saveNotesCreatesQueue`) acomoda `content?: string` extra-schema.
- [ ] +1 unit test en `saveQueue.test.ts`: `saveNotesCreatesQueue` enqueue con payload Row completo, executor recibe el row entero, status transitions normales.

**Archivos:**

- `src/lib/saveQueue.ts` — modificar (agregar 4 singletons + array `createsQueues` + extender `allQueues`).
- `src/types/repoRows.ts` — modificar si se elige opción (a) para `content`.
- `src/lib/__tests__/saveQueue.test.ts` (path tentativo, verificar al implementar) — agregar 1 test.

---

### F30.2 — Factory `createFirestoreRepo` con `createsQueue?` + `create` async

**Qué**: extender `RepoConfig<Row>` con un segundo queue opcional `createsQueue?: SaveQueue<Row>`. Modificar `create` (`baseRepo.ts:39-51`) para:

1. Generar `id = opts?.id ?? crypto.randomUUID()` sync (sin cambio).
2. Shallow copy `dataForFirestore = { ...data }` sync (sin cambio — el comment de líneas 44-47 sobre TinyBase mutation aplica igual).
3. `store.setRow(table, id, data)` sync (sin cambio).
4. **Si hay `createsQueue` inyectado**: encolar con key=id, executor encapsula `setDoc(doc(db, pathFor(uid, id)), payload, { merge: true })` con sign-out guard idéntico al de `update` (recheck `auth.currentUser?.uid !== capturedUid` al inicio de cada attempt → throw genérico → 4 attempts → 'error' visible en indicator). **Retornar `id` sync sin await del enqueue.**
5. **Si no hay `createsQueue`**: comportamiento actual (`await setDoc` directo). Retro-compatible.

Notar que el `RepoConfig` actual tiene un solo campo `queue` que aplica a `update`/`remove`. F30 introduce `createsQueue` separado por la **regla de upsert collision**: `saveQueue` upsertea por key (verificado en `saveQueue.ts:180-208` — el segundo enqueue con la misma id reemplaza el payload entero, no merge). Si creates y updates compartieran queue, un `update(id, {title: 'B'})` post-create reemplazaría el payload completo del create con solo `{title: 'B'}` → `setDoc(merge:true)` se ejecutaría sin los demás defaults del row → doc en Firestore queda incompleto hasta que algún flush futuro lo complete (frágil). Queue dedicado para creates evita la colisión por construcción.

**Criterio de done:**

- [ ] `RepoConfig<Row>` acepta `createsQueue?: SaveQueue<Row>` opcional.
- [ ] `create` retorna `id` sync cuando hay `createsQueue` (no await del setDoc).
- [ ] `setRow` sync corre ANTES del enqueue (paridad con F28/F29).
- [ ] Sign-out guard en el executor (recheck uid → throw genérico).
- [ ] Sin `createsQueue` inyectado: comportamiento idéntico a pre-F30 (`await setDoc`).
- [ ] +3 unit tests en `baseRepo.test.ts`:
  - Create con queue → enqueue + executor llama `setDoc(merge:true)`.
  - Create con queue + uid distinto en retry → executor throws stale-write.
  - Create sin queue → `await setDoc` directo (regresión retro-compat).

**Archivos:**

- `src/infra/repos/baseRepo.ts` — modificar (extender `RepoConfig<Row>`, modificar `create`).
- `src/infra/repos/baseRepo.test.ts` — modificar (agregar 3 tests).

---

### F30.3 — Wiring per repo (4 repos, single commit mecánico)

**Qué**: inyectar `createsQueue` en el `createFirestoreRepo` config de los 4 repos:

```ts
// notesRepo.ts:10
const repo = createFirestoreRepo<NoteRow>({
  store: notesStore,
  table: 'notes',
  pathFor: (uid, id) => `users/${uid}/notes/${id}`,
  queue: saveNotesMetaQueue,
  createsQueue: saveNotesCreatesQueue, // ← nuevo
});
```

Mismo patrón para `tasksRepo`, `projectsRepo`, `objectivesRepo`.

**Detalle especial `createFromInbox`** (`notesRepo.ts:148`): el payload pasado a `repo.create()` incluye `content: JSON.stringify(docJson)` que NO está en `NoteRow` schema. El factory hace shallow copy a `dataForFirestore` antes del `setRow` (que descarta el `content` por schema-strict de TinyBase). El executor del queue recibe `dataForFirestore` (con `content`) y lo pasa intacto a `setDoc`. Verificar con un test específico que `content` llega a Firestore via queue.

Single commit `feat(repos): wire creates queue en notes/tasks/projects/objectives` por la regla F29.G6 (cambio mecánico uniforme → bisect granular es ruido).

**Criterio de done:**

- [ ] 4 repos con `createsQueue` inyectado.
- [ ] Tests existentes verdes (incluido `notesRepo.test.ts` para `createFromInbox`).
- [ ] +1 test específico: `createFromInbox` enqueue → executor llama `setDoc` con `content` field presente.

**Archivos:**

- `src/infra/repos/notesRepo.ts` — modificar (1 línea import + 1 línea config).
- `src/infra/repos/tasksRepo.ts` — idem.
- `src/infra/repos/projectsRepo.ts` — idem.
- `src/infra/repos/objectivesRepo.ts` — idem.
- `src/infra/repos/notesRepo.test.ts` — agregar test de `createFromInbox` con queue.

---

### F30.4 — `useNote` tolera create-pending

**Qué**: la página destino `/notes/:noteId` hoy hace (resumen del Explore — `src/app/notes/[noteId]/page.tsx` y `src/hooks/useNote.ts`):

1. `useNote(noteId)` → `getDoc(doc(db, 'users', uid, 'notes', noteId))`.
2. Si `getDoc` retorna `notFound`, marca `notFound=true`.
3. Cross-check con `useRow('notes', noteId)` → `existsInStore`.
4. Si `notFound || !existsInStore` post-hidratación → redirect `/notes`.

Post-F30, durante la ventana entre `createNote()` retorna y el queue persiste el `setDoc`, el flow es: `existsInStore=true` (setRow sync ya corrió) + `notFound=true` (getDoc no encuentra el doc todavía) → **redirect erróneo**.

**Solución**: agregar a `useNote` un cross-check con `saveNotesCreatesQueue.getEntry(noteId)`. Si existe entry pending/syncing/retrying para ese id, **NO redirect** aunque `getDoc` retorne notFound. Tratar la row de TinyBase como fuente de verdad mientras el create está in-flight. Cuando el queue confirma:

- Status `synced` → entry se borra del queue tras 100ms (SYNCED_GC_MS) → el siguiente `getDoc` o el `onSnapshot` re-hidrata con el server doc real.
- Status `error` → entry queda visible en `<PendingSyncIndicator />` con badge ERROR. La página destino sigue mostrando la row local (caso usuario ya escribió contenido + se fue offline). Si el usuario hace "Descartar" desde el indicator, `clear()` borra el entry → el siguiente snapshot del persister limpia la row local. Si retry-now eventualmente sucede, sync.

**Criterio de done:**

- [ ] `useNote` lee `saveNotesCreatesQueue.getEntry(noteId)` y tolera `notFound` cuando hay entry pending.
- [ ] Caso "doc nunca existió en Firestore + sin entry en queue" sigue redirect (regresión: borrado cross-device).
- [ ] Caso "create pending + getDoc notFound" no redirect, muestra row local.
- [ ] Caso "create error + retry manual" → sync exitoso → re-hidratación.
- [ ] Sin reintroducir el ciclo Firestore↔store-pisaje (F29 ya canonizó el patrón).

**Archivos:**

- `src/hooks/useNote.ts` — modificar (agregar cross-check con queue).
- `src/app/notes/[noteId]/page.tsx` — verificar si requiere ajuste (probable que solo el hook lo cubra, el page consume `notFound` y `existsInStore`).

**Open question para Plan mode**: ¿`useNote` se suscribe al queue para reactividad (re-render cuando entry transitiona) o lee one-shot al render? Default propuesto: one-shot via `getEntry()` por simplicidad — el `onSnapshot` del persister + el re-render del store ya cubren la convergencia. Plan mode valida que no haya dead-lock visual.

---

### F30.5 — Indicator + flush hooks extendidos

**Qué**: el `<PendingSyncIndicator />` y `usePendingSyncCount` (F29.5) ya iteran `allQueues` linealmente — son agnósticos al número. Cambios mínimos:

1. **`ENTITY_LABELS`** (en `src/hooks/usePendingSyncCount.ts` o donde viva el array) extender con 4 entries en el orden exacto de `createsQueues` dentro de `allQueues`. Labels propuestos:
   - `{ singular: 'nota nueva', plural: 'notas nuevas' }`
   - `{ singular: 'tarea nueva', plural: 'tareas nuevas' }`
   - `{ singular: 'proyecto nuevo', plural: 'proyectos nuevos' }`
   - `{ singular: 'objetivo nuevo', plural: 'objetivos nuevos' }`
   - Distinguir verbalmente "nueva" (creación pendiente) vs "edición" (meta update pendiente — labels F29 ya usan "edición de nota") para que el popover sea legible.
2. **Flush hooks** (`useSaveQueueFlush.ts`, `useCloseToTray.ts`) ya iteran `allQueues` con `Promise.allSettled` (F29.6). Sin cambios — los 4 nuevos queues entran automáticamente al expandir el array.

**Criterio de done:**

- [ ] `ENTITY_LABELS` con 11 entries en orden correcto.
- [ ] Indicator amber con "1 nota nueva pendiente" cuando hay un create pending.
- [ ] Indicator destructive con "1 sin guardar" + popover "1 nota nueva (ERROR)" cuando un create alcanza status error.
- [ ] `beforeunload` dialog dispara con creates pendientes (validar que `totalPending()` cuenta los 4 nuevos queues).
- [ ] Botón "Descartar" del indicator limpia los 11 queues.

**Archivos:**

- `src/hooks/usePendingSyncCount.ts` — extender `ENTITY_LABELS`.
- (Verificar al implementar si el array vive en otro path.)

---

### F30.6 — QA E2E + cierre de feature

**Qué**: validación E2E con Playwright MCP siguiendo el patrón de F29.7 (inyección sintética de entries pendientes). Escenarios:

1. **Create pending, navegación inmediata, página destino tolera**:
   - Inyectar `saveNotesCreatesQueue.enqueue(uuid, row, () => new Promise(()=>{}))` desde dev console (modo "executor never resolves").
   - `notesStore.setRow('notes', uuid, row)` para simular el sync local.
   - `navigate('/notes/' + uuid)` programático.
   - Verificar: la página NO redirige, muestra el title/content del row local, el indicator dice "1 nota nueva pendiente".
2. **Create error + retry-now**:
   - Inyectar entry con executor que rechaza con `Error('transient')` plano.
   - Tras ~7s (1+2+4 backoff) → status `error`, indicator destructive.
   - Click "Reintentar" del popover, swap executor a `mockResolvedValue(undefined)` → status `synced` → entry GC tras 100ms → indicator desaparece.
3. **Create error + Descartar**:
   - Mismo setup que (2).
   - Click "Descartar" → `clear()` limpia el entry. Verificar: la row local en TinyBase persiste hasta que `onSnapshot` la limpia (probablemente requiere recargar para forzar persister snapshot — documentar el comportamiento).
4. **Beforeunload con create pending**:
   - Inyectar entry pending.
   - Trigger `window.dispatchEvent(new Event('beforeunload'))` → confirmar que el dialog dispara (mediante `getRecentDialogs` de Playwright).
5. **Backoff con recovery online**:
   - Executor falla 1 vez (`Error('transient')`) y luego succeed.
   - Tras 1s del backoff, status synced. Indicator nunca alcanza destructive.
6. **Sign-out mid-retry**:
   - Inyectar entry, sign-out, esperar attempt → executor recheca uid, throw genérico, attempts incrementa, eventualmente error.

**Criterio de done:**

- [ ] 6 escenarios E2E pasan con screenshots o snapshots de los estados clave.
- [ ] No reintroduce el race "redirect-on-notFound" en `/notes/:id`.
- [ ] Indicator distingue "create pending" de "update pending" en el popover.
- [ ] Cierre de SPEC: convertir a registro de implementación (step 8 SDD).
- [ ] Tachar deuda "Creates con retry queue" en `Spec/ESTADO-ACTUAL.md` candidatos próximos.
- [ ] CLAUDE.md gotchas universales: revisar si "queue para creates rompe `Promise<string>` contract" merece nota — solo si aplica a sesión sin importar dominio. Default: no, queda en este SPEC.

**Archivos:**

- `Spec/features/SPEC-feature-30-creates-retry-queue.md` — convertir a registro de implementación.
- `Spec/ESTADO-ACTUAL.md` — tachar deuda + agregar línea de F30 si surge un gotcha cross-feature nuevo.

---

## Decisiones clave

| ID  | Decisión                                                                                                       | Por qué                                                                                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Queue dedicado por entidad para creates (4 nuevos), NO compartido con `metaQueue`.                             | Upsert collision: `saveQueue` reemplaza payload entero al re-enqueue con misma key (verificado en `saveQueue.ts:180-208`). Compartir queue create+update colapsaría payloads dispares. Queue dedicado evita por construcción. |
| D2  | Payload tipado como `Row` completo, NO `Partial<Row>`.                                                         | Un create siempre carga el row entero. `Partial<Row>` deja la puerta a creates incompletos que romperían defaults. Tipado fuerte = caller errors at compile.                                                                  |
| D3  | `RepoConfig<Row>` con dos queues: `queue?` (meta) + `createsQueue?` (creates). Separados, ambos opcionales.    | Retro-compat (sin queues = comportamiento pre-F29). Tipos distintos (`Partial<Row>` vs `Row`). Inyección granular per repo.                                                                                                   |
| D4  | `setDoc(merge: true)` para creates (paridad con updates).                                                      | Si una CF (autoTagNote, generateEmbedding) escribe el doc antes que el queue de creates flushee, `merge:true` no pisa esos campos. `merge:false` sería técnicamente correcto para "primer write" pero introduce race con CFs. |
| D5  | `useNote` cross-check con `saveNotesCreatesQueue.getEntry(id)` para tolerar `getDoc(notFound)` durante create. | Sin esto, `/notes/:id` post-create redirige al usuario fuera de su nota recién creada. Cross-check con queue distingue "create pending" (no redirect) de "doc borrado cross-device" (redirect).                               |
| D6  | `createFromInbox` reusa `saveNotesCreatesQueue` con tipo `SaveQueue<NoteRow & { content?: string }>`.          | El campo `content` extra-schema viaja en el payload del queue al executor sin contaminar el `NoteRow` global (que TinyBase usa con schema-strict). Cast localizado.                                                           |
| D7  | Single commit para F30.3 (wiring 4 repos).                                                                     | Cambio mecánico uniforme (1 import + 1 línea config × 4). Aplica regla F29.G6.                                                                                                                                                |
| D8  | Labels custom para creates ("nota nueva" vs "edición de nota").                                                | El popover del indicator hoy lista "1 nota" para meta updates. Para creates necesita verbalmente distinguir — el usuario ve "1 nota nueva" y entiende "una nota recién creada que no se ha sincronizado".                     |
| G1  | Sign-out mid-retry guard en el executor de `create` (paridad con `update`/`remove` F29.G3).                    | Mismo riesgo cross-user write si el usuario se desloggea durante el backoff. Recheck `auth.currentUser?.uid !== capturedUid` al inicio de cada attempt. Sin esto, defense-in-depth queda incompleto comparado con updates.    |
| G2  | Queue de creates entra en `allQueues` → cubierto automáticamente por flush hooks `beforeunload` + `online`.    | Sin agregar a `allQueues`, los flush hooks no cubren creates → user puede cerrar la pestaña con creates pending sin warning. F29.6 ya itera el array, expandirlo es 0 LOC en hooks.                                           |
| G3  | `useNote` cross-check one-shot al render, NO suscripción al queue.                                             | Re-renders ya están cubiertos por `useRow` (TinyBase) + `getDoc` (Firestore re-fetched cuando el `onSnapshot` re-hidrata post-flush). Suscribirse al queue agrega un subscriber por instancia de `useNote` sin valor neto.    |

---

## Orden de implementación

1. **F30.1** (Singletons + tipos) — primero porque F30.2 importa los queues. Sin singletons, el factory no puede inyectar.
2. **F30.2** (Factory `create` async + sign-out guard) — segundo porque depende de F30.1 (tipos del queue). Tests unit aíslan el cambio antes de tocar repos reales.
3. **F30.3** (Wiring 4 repos) — tercero, mecánico. Tras este commit, los creates ya van por queue pero las páginas destino no toleran el race todavía → F30.3 + dev local **bloqueante** sin F30.4.
4. **F30.4** (`useNote` race-tolerance) — cuarto. Antes de mergear F30.3 a main necesitamos que `/notes/:id` post-create funcione. Idealmente F30.3 + F30.4 en una misma sesión.
5. **F30.5** (Indicator + labels) — quinto, paralelizable con F30.4 si aplica. Sin F30.5 el indicator igual cuenta los creates pero los muestra con label vacío o crash → bloqueante para QA.
6. **F30.6** (QA E2E + cierre) — último. Al cerrar, paso 8 SDD: convertir SPEC a registro + tachar deuda en ESTADO-ACTUAL.

**Branch única**: `feat/creates-retry-queue`. 5-6 commits atómicos (uno por sub-feature).

---

## Estructura de archivos

```
src/
├── lib/
│   └── saveQueue.ts                  (modificar: +4 singletons + arrays)
├── types/
│   └── repoRows.ts                   (modificar SI se elige opción a de F30.1)
├── infra/repos/
│   ├── baseRepo.ts                   (modificar: createsQueue + create async)
│   ├── baseRepo.test.ts              (modificar: +3 tests)
│   ├── notesRepo.ts                  (modificar: createsQueue inyectado)
│   ├── notesRepo.test.ts             (modificar: +1 test createFromInbox + queue)
│   ├── tasksRepo.ts                  (modificar)
│   ├── projectsRepo.ts               (modificar)
│   └── objectivesRepo.ts             (modificar)
├── hooks/
│   ├── useNote.ts                    (modificar: cross-check con queue)
│   └── usePendingSyncCount.ts        (modificar: ENTITY_LABELS +4 entries)
└── lib/
    └── __tests__/saveQueue.test.ts   (modificar: +1 test, path tentativo)
```

Ningún archivo nuevo. Toda la implementación reusa estructuras de F29.

---

## Checklist global de completado

Al cerrar F30 todas estas condiciones deben ser verdaderas:

- [ ] `npm run build` pasa sin errores TS.
- [ ] `npm test` pasa (incluye los nuevos unit tests F30.1 + F30.2 + F30.3).
- [ ] `npm run lint` pasa.
- [ ] Crear una nota offline en dev (DevTools Network throttling = Offline) → entrar a `/notes/:id` → ver el editor con la row local → indicator amber con "1 nota nueva pendiente". Reconectar online → indicator desaparece, doc en Firestore aparece (validar via Firebase MCP `firestore_get_document`).
- [ ] Forzar error en setDoc (rules deny temporal o offline persistente >7s) → indicator destructive con "1 sin guardar" → popover "1 nota nueva (ERROR)" con [Reintentar] habilitado.
- [ ] `beforeunload` dialog dispara con un create pending.
- [ ] Sign-out con creates pending → executor recheca uid → entries transitionan a error sin escribir al uid viejo.
- [ ] `Spec/ESTADO-ACTUAL.md`: deuda "Creates con retry queue" tachada de "Candidatos próximos".
- [ ] SPEC F30 convertido a registro de implementación con la sección "Lecciones" populada.
- [ ] Deploy hosting (`npm run build && npm run deploy`). Tauri/Android opcionales según user.

---

## Notas para Plan mode (step 2 SDD en otra ventana)

El SPEC deja resueltas las decisiones D1-D8 + G1-G3. Plan mode debe validar estas y resolver las **siguientes preguntas abiertas**:

1. **`NoteRow` extension para `content`**: opción (a) extender el type global, (b) tipar el singleton `saveNotesCreatesQueue` con intersection, (c) cast en sitio. Default propuesto: (b). Plan mode confirma con un Explore sobre `repoRows.ts` y los consumers de `NoteRow` para detectar contaminación.
2. **`useNote` reactivity al queue**: G3 propone one-shot `getEntry()` al render. Plan mode valida con un dry-run del flow create + error + retry: ¿hay algún caso donde el render no se actualiza tras el sync? Si lo hay, suscribirse al queue.
3. **`saveQueue.test.ts` path real**: el SPEC asume `src/lib/__tests__/saveQueue.test.ts`. Plan mode verifica con un Explore.
4. **`ENTITY_LABELS` location exacta**: el SPEC asume `usePendingSyncCount.ts`. Plan mode verifica.
5. **Bulk create `createRaw`**: out-of-scope v1, pero Plan mode evalúa si algún flow (ej. import desde JSON, restore-from-backup planeado para F31+) lo requiere ya en F30. Default: no.
6. **`createFromInbox` test específico**: validar que el `content` extra-schema llega a Firestore via queue. Plan mode propone el test exacto.
7. **`useNote` page redirect: timing**: hoy redirect post-hidratación. Con cross-check al queue, ¿el guard se evalúa al mismo momento? Plan mode hace dry-run del orden useEffect + queue read.
8. **Riesgos de race con `onSnapshot` durante el flush**: ¿el persister puede disparar `onSnapshot` mientras el queue está en mitad de un flush y pisar la row local con server stale? F29 lo cerró para updates; verificar que aplica al create (cuando el doc no existe en server, ¿el `onSnapshot` reporta `notFound` y borra la row local?). Plan mode valida con Firebase MCP.

---

## Out of scope (no entran en F30)

- **`createRaw` por simetría con `removeRaw`**: sin caso de uso bulk hoy. Si surge (import, restore), F31+ lo agrega trivialmente.
- **Ajuste de `/projects/:id` y `/objectives/:id`** para tolerar create-pending: hoy esas páginas leen solo de TinyBase (`useTable`), no hay `getDoc` directo → no race. Si en el futuro alguna página destino agrega `getDoc`, replicar el patrón F30.4.
- **Inbox creates por queue**: `QuickCaptureProvider.tsx` ya hace setRow sync con UUID local; el sync a Firestore va por persister auto-loop, no por factory. Migrarlo a queue formal es separadísimo (cambia el provider, no el repo).
- **De-dupe per-noteId del indicator** (deuda F29.G5): si un mismo noteId tiene `create` + `updateMeta` simultáneos, el popover muestra "1 nota nueva + 1 edición de nota" cuando técnicamente es 1 nota con 2 writes. Aceptado para v1 igual que en F29.
- **Cambiar el contrato `Promise<string | null>` a `Promise<string>` (sin null)**: hoy `createNote` retorna null en error pre-enqueue (validación de defaults, etc.). Post-F30 los callers que asumían "null = error" siguen funcionando — el queue maneja errores async via indicator, no via return value. Cambiar el tipo a non-nullable es un cleanup futuro.
