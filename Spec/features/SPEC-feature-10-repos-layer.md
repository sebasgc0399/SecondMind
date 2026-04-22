# SPEC — SecondMind · Feature 10: Capa de Repositorios (`src/infra/repos/`)

> Alcance: Encapsular el patrón optimistic `setPartialRow → setDoc` repetido en 6 hooks en una capa de repos bajo `src/infra/repos/`, fixeando de paso el race condition en `createX` (setDoc antes de setRow).
> Dependencias: Feature 9 cerrada (Capacitor Auto-Update). Ninguna otra.
> Estimado: 2-4 días de dev solo. Con criterio de parada en F2 si no convence.
> Stack relevante: TinyBase v8, Firestore, TypeScript strict. Sin libs nuevas.

---

## Objetivo

Reemplazar la duplicación del "optimistic pattern" (sync TinyBase antes de Firestore async) en 6 hooks por un único factory parametrizable. Ningún cambio observable para el usuario final; el valor está en eliminar ~200 líneas de glue code duplicadas, fixear el race condition latente en todas las creaciones, y centralizar el único lugar que coordina TinyBase + Firestore. Sienta la base para testear lógica de dominio sin montar React, sin rehacer la arquitectura completa.

**No objetivos explícitos** (descartados tras análisis):

- No crear capa `core/` con entidades separadas — el ratio pura/glue en los hooks es ~20/80 y la lógica pura ya vive en `src/lib/`.
- No renombrar `src/` a `src/ui/` — 304 imports en 94 archivos por ganancia cosmética.
- No agregar alias nuevos (`@core/`, `@infra/`, `@shared/`) — el alias existente `@/` cubre lo que agregamos.
- No extraer `usecases/` — los 4 flujos multi-entidad (convertTo\* de inbox, saveNote) se mantienen en sus hooks; el repo absorbe solo la persistencia.
- No usar interfaces (`ITaskRepository`) ni DI container — 1 dev, 1 implementación.

---

## Features

### F1: Factory base `createFirestoreRepo`

**Qué:** Factory genérico que produce un repo parametrizado con store TinyBase, tabla y path Firestore. Expone `create(data, options?)`, `update(id, partial)`, `remove(id)`. Garantiza el orden `setRow/setPartialRow (sync) → await setDoc/updateDoc (async)` en TODAS las operaciones.

**Criterio de done:**

- [ ] `src/infra/repos/baseRepo.ts` exporta `createFirestoreRepo<Row>({ store, table, pathFor })`. Sin `serverFields`, sin `getUid` inyectable — ver definiciones técnicas D5.
- [ ] `create(data, { id? })` ejecuta `store.setRow(table, id, data)` ANTES de `await setDoc(pathFor(uid, id), data, { merge: true })`. `id` es opcional — si no se pasa, se genera con `crypto.randomUUID()` (patrón canónico del proyecto, verificado en useTasks/useProjects/useObjectives/useInbox). `merge: true` por consistencia con el persister auto-sync y defensa ante edge cases de ID colisión.
- [ ] `update(id, partial)` ejecuta `store.setPartialRow(table, id, partial)` ANTES de `await setDoc(pathFor(uid, id), { ...partial, updatedAt: Date.now() }, { merge: true })`. TinyBase y Firestore reciben `Date.now()` (number); no se usa `serverTimestamp()` por ahora — replicamos el patrón actual del hook.
- [ ] `remove(id)` ejecuta `store.delRow(table, id)` ANTES de `await deleteDoc(pathFor(uid, id))`. **Excepción:** inbox items NO se borran físicamente (status-based delete en repo específico, F5).
- [ ] Si Firestore falla tras el write local, se loggea el error (no rollback automático — mantener simplicidad). Decisión documentada en D1.
- [ ] `pathFor(uid, id)` es function que retorna `string` — el factory hace `doc(db, path)` internamente. Permite inyectar `users/{uid}/tasks/{id}` sin hardcodear.
- [ ] El factory lee `auth.currentUser?.uid` directo del módulo `@/lib/firebase` en cada método. Throw con mensaje claro si `uid` es null al momento de la operación. Sin getter inyectable (ver D5).
- [ ] Zero imports de React, editor, o UI. Solo `tinybase`, `firebase/firestore`, `@/lib/firebase`.
- [ ] `package.json` agrega `vitest@^4.1.0` + `@vitest/ui` a `devDependencies` y script `"test": "vitest"`. `vite.config.ts` agrega bloque `test: { environment: 'node', globals: true }` + `/// <reference types="vitest" />`. **`environment: 'node'`** (no `jsdom`) — el factory es función pura sin componentes React; jsdom agrega overhead de startup sin beneficio. Si F3-F6 llegara a necesitar tests de componentes, se agrega `// @vitest-environment jsdom` por archivo. Vitest 4.1+ es compatible con Vite 8 sin `--legacy-peer-deps`.
- [ ] **5 tests unitarios** en `src/infra/repos/baseRepo.test.ts` con Vitest, mockeando `@/lib/firebase` (`auth`, `db`) con `vi.mock` y stubs de `firebase/firestore` (`setDoc`, `deleteDoc`, `doc`). Store TinyBase instanciado real:
  1. **`create` respeta orden sync → async.** `setDoc` stub retorna promesa pendiente; assert que `store.getRow(table, id)` ya tiene el dato mientras `setDoc` sigue pending.
  2. **`update` respeta orden sync → async.** Mismo patrón con `setPartialRow`.
  3. **`create` con `id` provisto lo usa; sin id genera uno.** Sin id: regex UUID v4. Con id: id provisto es el usado.
  4. **`remove` llama `delRow` sync antes de `deleteDoc` async.** Mismo patrón.
  5. **`auth.currentUser` null → throw con mensaje claro.** Mock `auth.currentUser` como `null`; `create`/`update`/`remove` rechazan con `Error` cuyo mensaje menciona "uid" o "auth".

**Archivos a crear/modificar:**

- `src/infra/repos/baseRepo.ts` — factory genérico, ~80-120 líneas
- `src/infra/repos/baseRepo.test.ts` — 5 tests unitarios, ~80-100 líneas
- `package.json` — agregar `vitest` + `@vitest/ui` a devDeps (hoy NO está instalado) + script `"test": "vitest"`
- `vite.config.ts` — agregar bloque `test: { environment: 'node', globals: true }` (hoy NO existe)

**Notas de implementación:**

- Respetar el gotcha de CLAUDE.md: "Optimistic updates: `setPartialRow` (TinyBase) sync ANTES de `setDoc` async". El factory es el único lugar que ejecuta ese orden explícito — si falla ahí, falla universalmente y es fácil de diagnosticar.
- **Convivencia con el persister auto-sync (comportamiento pre-existente, NO cambia):** el persister TinyBase en [src/lib/tinybase.ts](../src/lib/tinybase.ts) está montado con `startAutoSave` activo (ver [src/hooks/useStoreInit.ts:46](../src/hooks/useStoreInit.ts#L46)), lo que hace que cada `setRow`/`setPartialRow` dispare automáticamente un `setDoc` redundante a Firestore (escribe todos los rows de la tabla con `merge: true`). El `setDoc` explícito del factory convive con eso intencionalmente por dos razones: **(a) awaitability** — el caller puede hacer `await repo.update(...)` y saber cuándo el write a Firestore terminó, cosa que el persister fire-and-forget no ofrece; **(b) orden determinístico** — el factory garantiza `sync → async`, y el persister actúa como safety-net redundante. Los hooks actuales ya hacen este doble-write (ej. useTasks.ts:86+87 y 114+115); el factory hereda el patrón establecido. Cualquier refactor del persister para eliminar la redundancia es decisión ortogonal a este SPEC.
- **Write amplification del persister (pre-existente, NO introducido ni resuelto por el factory):** el callback `setPersisted` en [tinybase.ts:50-59](../src/lib/tinybase.ts#L50-L59) itera TODAS las rows de la tabla vía `getContent()` y hace un `setDoc` paralelo por cada row en cada save. Con 500 tareas y 1 `completeTask`, son 501 writes a Firestore (1 explícito del factory + 500 del persister). Este comportamiento es pre-existente y afecta todos los writes del proyecto, no solo los nuevos del factory. Factible mitigar con un persister diff-based, pero queda fuera del scope de F10 (ver Feature 12 candidata). Documentado acá para que futuro-yo no atribuya el problema al factory tras la migración.
- **Cross-user data leak potencial (pre-existente, NO introducido ni resuelto por el factory):** los stores TinyBase en [src/stores/](../src/stores/) son singleton (creados en module load). `startAutoLoad` en `useStoreInit` sobrescribe la tabla al login de un nuevo user, pero NO llama `store.delTable(table)` antes, dejando una ventana corta entre logout/login donde el store retiene data del user anterior. Si el factory ejecuta un write en esa ventana, escribe rows del user viejo al path del user nuevo. Ventana real en prod es <100ms y requiere click del usuario en ese instante exacto — muy raro pero posible. El factory no introduce el riesgo (los hooks actuales tienen el mismo) ni lo mitiga. Ver Feature 11 candidata — esta tiene prioridad pronta aunque queda fuera del scope de F10.
- `auth.currentUser?.uid` se lee en runtime dentro del método, no en config del repo. Tolerar logout/login mid-sesión (mismo patrón que `updateNoteType`). Lectura directa del módulo `@/lib/firebase`, sin getter inyectable — ver D5.
- Timestamps: `Date.now()` (number) en ambos lados (TinyBase y Firestore). `serverTimestamp()` y `Timestamp` quedan fuera de este SPEC — el hook actual no los usa y agregarlos sería scope creep. Si aparece necesidad real en F3-F6, se evalúa entonces.

---

### F2: Piloto — `tasksRepo` + migración de `useTasks`

**Qué:** Primer repo concreto que consume F1. Migrar `useTasks.ts` para que delegue todas las escrituras al repo. Es el piloto porque `tasks` es la entidad más simple (13 campos, sin content largo, sin multi-entidad). **Criterio de PARADA:** si F2 genera más ceremonia que beneficio (LoC no baja, el hook se vuelve menos legible, o aparecen ≥2 bugs derivados), parar acá — el análisis estuvo equivocado y no se sigue con F3-F6.

**Criterio de done:**

- [ ] `src/infra/repos/tasksRepo.ts` exporta `tasksRepo` construido con `createFirestoreRepo`, path `users/{uid}/tasks/{id}` (via `pathFor`), store `tasksStore`.
- [ ] `tasksRepo` expone los **3 métodos** que `useTasks` usa hoy (contrato actual verificado): `createTask(name: string, options?: CreateTaskOptions): Promise<string | null>`, `updateTask(id: string, updates: Partial<Task>): Promise<void>`, `completeTask(id: string): Promise<void>`. **NO expone `remove`** — el hook actual no tiene `deleteTask`, preservamos superficie pública. `setPriority` queda cubierto por `updateTask` (no hay método dedicado hoy).
- [ ] **`createTask` retorna `Promise<string | null>`** (no `Promise<string>`). Esto preserva la semántica actual del hook: try/catch interno que retorna `null` en error o si `!user`/`!trimmed`. `useInbox.ts:183` depende de este guard (`if (!taskId) return;`); romperlo corta el flujo de `convertToTask`. `CreateTaskOptions = { priority?: Priority; areaId?: string; projectId?: string }` (shape actual).
- [ ] `useTasks.ts` reemplaza los 4 calls de persistencia directos (líneas 86/87/114/115: `setDoc` en create, `setRow`, `setDoc` en update, `setPartialRow`) por calls a `tasksRepo.*`. Firma pública del hook **idéntica**: `{ tasks, isInitializing, createTask, updateTask, completeTask }`.
- [ ] Hook queda ≤80 LoC (hoy 139). Target realista considerando que se conservan reads reactivos (`useTable`, `useCell`, `useRow`, `useMemo` con `parseIds` para `noteIds`).
- [ ] El bug de orden invertido en `createTask` (hoy `setDoc` en línea 86 ANTES de `setRow` en línea 87) queda fixeado automáticamente por el factory.
- [ ] Regression check manual E2E: crear tarea, editar título, toggle complete/uncomplete, clicks rápidos x3 (validar fix de race). Todo funciona idéntico a antes.
- [ ] `grep -n "setDoc\|updateDoc\|addDoc\|deleteDoc" src/hooks/useTasks.ts` → **0 líneas** (toda persistencia delegada).
- [ ] `npm run build && npm run lint && npm test` pasan sin warnings nuevos.
- [ ] **Comparativa LoC con los 3 números separados** (no solo el neto): `useTasks.ts: 139 → N (−X hooks); baseRepo.ts: +Y; tasksRepo.ts: +Z; neto: +/−W`.

**Archivos a crear/modificar:**

- `src/infra/repos/tasksRepo.ts` — repo específico, ~40-60 líneas
- `src/hooks/useTasks.ts` — refactor para delegar al repo, target ≤80 LoC

**Notas de implementación:**

- **Defaults de `createTask` verificados contra código actual** (useTasks.ts:76-89): `status: 'in-progress'` (NO `'pending'`), `priority: options?.priority ?? 'medium'`, `dueDate: Date.now()`, `projectId/areaId: options?.* ?? ''`, `objectiveId: ''`, `noteIds: '[]'` (string serializado, no array JS), `description: ''`, `isArchived: false`, `createdAt/updatedAt: Date.now()`, `completedAt: 0`. Replicar exactamente en `tasksRepo.createTask` — cualquier divergencia es breaking change silencioso.
- `completeTask` es el único método con lógica no trivial: lee el row actual, calcula next status, delega a `updateTask`. Helper `computeNextTaskStatus(current): { status, completedAt }` queda **inline en `tasksRepo.ts`** como función no exportada (5 líneas no justifican archivo propio). Toggle real verificado: `in-progress → completed (completedAt: Date.now())` y `completed → in-progress (completedAt: 0)`. Sin side effects adicionales (no toca projectId/objectiveId, no analytics).
- **Serialización de `noteIds`: contrato explícito en `tasksRepo.updateTask`.** El método espera `noteIds?: string[]` (array JS) y lo normaliza con `stringifyIds` antes de pasar al factory. `stringifyIds` NO es idempotente (`JSON.stringify` aplicado sobre un string serializado produce nested escaping). Documentar en JSDoc del método: "Accepts `noteIds` as `string[]`; NEVER pass pre-serialized strings". El factory permanece genérico. El hook sigue usando `parseIds` en el `useMemo` del read (línea ~49 de useTasks.ts).
- NO migrar componentes que consumen `useTasks` — solo el hook. Los 5 consumers verificados ([TasksTodayCard.tsx](../src/components/dashboard/TasksTodayCard.tsx), [TasksPage.tsx](../src/app/tasks/page.tsx), [useInbox.ts](../src/hooks/useInbox.ts), [ProjectDetailPage.tsx](../src/app/projects/[projectId]/page.tsx)) siguen funcionando sin cambios.
- Mantener `useTable('tasks')` / `useRow` / `useCell` / `useAuth()` en el hook: el repo solo maneja writes. Reads siguen siendo reactivos via TinyBase hooks como hoy.

---

### F3: Migrar `projectsRepo` + `objectivesRepo`

**Qué:** Replicar el patrón de F2 sobre dos entidades casi idénticas estructuralmente. Valida que el factory escala a múltiples entidades con la misma shape.

**Criterio de done:**

- [ ] `src/infra/repos/projectsRepo.ts` y `src/infra/repos/objectivesRepo.ts` construidos con `createFirestoreRepo`.
- [ ] `useProjects.ts` y `useObjectives.ts` refactorizados análogamente a `useTasks`. Bug de orden invertido en `createProject` (useProjects.ts:84) y `createObjective` (useObjectives.ts:80) queda fixeado.
- [ ] Validación E2E manual: crear proyecto con objetivo asociado, editar progreso, vincular/desvincular, borrar.
- [ ] Constraint 1:N `project.objectiveId` preservado (el lado singular autoritativo del gotcha de ESTADO-ACTUAL sigue intacto).
- [ ] `npm run build && npm run lint` pasan.

**Archivos a crear/modificar:**

- `src/infra/repos/projectsRepo.ts`
- `src/infra/repos/objectivesRepo.ts`
- `src/hooks/useProjects.ts`
- `src/hooks/useObjectives.ts`

**Notas de implementación:**

- Si surge un campo que no cuadra con el factory genérico (ej. normalización de `objectiveId`), NO agregarlo al factory — mantenerlo como método extra en el repo específico. El factory solo absorbe lo que es realmente repetido.

---

### F4: `habitsRepo` con ID determinístico

**Qué:** Repo para hábitos que maneja el patrón "ID determinístico `YYYY-MM-DD`" ya establecido (ESTADO-ACTUAL). Valida que el factory tolera IDs con forma fija pasados desde el caller, no auto-generados.

**Criterio de done:**

- [ ] `src/infra/repos/habitsRepo.ts` expone `toggleHabit(dateKey, habitName)` y `setProgress(dateKey, progress)`.
- [ ] `toggleHabit` respeta el patrón "doc creado implícitamente al primer toggle" — si el row/doc no existe, lo crea con defaults; si existe, flippea el bit. Lógica pura `computeNextHabitState(row, habitName)` testeable aislada.
- [ ] `useHabits.ts` refactorizado. Los helpers de fecha (`formatDateKey`, `addDays`, `getWeekStart`) NO se tocan en este SPEC — ya viven en `src/lib/dateUtils.ts` según ESTADO-ACTUAL y no es el foco.
- [ ] Validación E2E manual: toggle hábito de hoy, toggle de ayer (idempotente), week grid refleja cambios.
- [ ] El gotcha de "hábitos con ID YYYY-MM-DD, docs creados implícitamente al primer toggle" sigue vigente. Documentar en el repo con comentario de 1 línea.

**Archivos a crear/modificar:**

- `src/infra/repos/habitsRepo.ts`
- `src/hooks/useHabits.ts`

**Notas de implementación:**

- `rowToEntry` y `synthesizeEmptyEntry` de useHabits.ts son lógica de presentación (armado del entry para el UI) — NO ir al repo. Mantener en el hook o en `src/lib/habits.ts` como función pura si conviene extraerlas (opcional, no bloquea F4).

---

### F5: `inboxRepo` con conversiones multi-entidad

**Qué:** Repo para inbox que absorbe los 3 flujos `convertToNote` / `convertToTask` / `convertToProject`. Es la feature más compleja porque cada conversión toca 2 entidades: crea en otro store + marca el inbox item como `'processed'`. El repo orquesta la secuencia correcta; el hook solo invoca.

**Criterio de done:**

- [ ] `src/infra/repos/inboxRepo.ts` expone: `createItem`, `dismiss(id)` (setea `status: 'dismissed'`, NO borra físicamente), `convertToNote(id, overrides?)`, `convertToTask(id, overrides?)`, `convertToProject(id, overrides?)`.
- [ ] Cada `convertTo*` depende de `notesRepo` / `tasksRepo` / `projectsRepo` (inyectados o importados directo — decisión en Plan mode). Orden estricto: crear entidad destino → marcar inbox item como `processed` → retornar el nuevo ID.
- [ ] `useInbox.ts` queda ≤100 LoC (hoy 245). Los 3 convertTo\* en el hook son pass-through al repo.
- [ ] Bug de orden invertido en las 4 operaciones de write directo de useInbox (líneas 151, 185, 217, 229 según análisis) queda fixeado.
- [ ] Gotcha "items de inbox nunca se borran físicamente" sigue intacto. El repo lo garantiza (no expone `remove`, solo `dismiss`).
- [ ] Validación E2E manual: capture → procesar inbox → convertir a nota/tarea/proyecto (cada uno) → verificar que el item queda en `processed`, la entidad destino existe, y el contenido se preservó.

**Archivos a crear/modificar:**

- `src/infra/repos/inboxRepo.ts`
- `src/hooks/useInbox.ts`

**Notas de implementación:**

- El builder de `docJson` (useInbox.ts:110-119 según análisis) NO va al repo — es lógica de transformación TipTap, no persistencia. Candidato para `src/lib/tiptap-builders.ts` pero fuera de scope de este SPEC.
- `convertToNote` debe preservar el seteo de `aiProcessed: !!(overrides?.tags?.length > 0)` — gotcha documentado en ESTADO-ACTUAL ("sin esto, autoTagNote sobrescribiría tags aceptados").

---

### F6: `notesRepo` con content aparte

**Qué:** Último repo y el más particular: `content` (TipTap JSON) va directo a Firestore y NO a TinyBase (gotcha consolidado del proyecto). Requiere que el repo tenga un método específico `saveContent` que escribe solo a Firestore, separado de `update` genérico que mantiene el split.

**Criterio de done:**

- [ ] `src/infra/repos/notesRepo.ts` expone: `createNote`, `updateMeta(id, partial)` (todos los campos EXCEPTO `content`), `saveContent(id, { content, contentPlain, updatedAt, ... })` (Firestore only), `archive(id)`, `unarchive(id)`.
- [ ] `updateMeta` usa el factory genérico. `saveContent` es método custom del `notesRepo` que bypassa el factory (solo Firestore write).
- [ ] `useNoteSave.ts` refactorizado para usar `notesRepo.saveContent` + `notesRepo.updateMeta` en un solo disparo. El `updateDoc` atómico por save se preserva — es 1 llamada Firestore, no 2.
- [ ] Hook `useNoteSave` queda ≤100 LoC (hoy 170).
- [ ] Validación E2E manual: editar nota, verificar autosave debounce 2s, recargar, content preservado. Verificar que archive/unarchive siguen funcionando. Verificar distillLevel badge reactivo.
- [ ] Gotcha "Content largo de notas (TipTap JSON) va directo a Firestore, NO en TinyBase" se refuerza vía el repo. Comentario en `notesRepo.ts` y update en `src/lib/tinybase.ts` si aplica.

**Archivos a crear/modificar:**

- `src/infra/repos/notesRepo.ts`
- `src/hooks/useNoteSave.ts`
- `src/hooks/useNote.ts` — solo si el read-side necesita tocarse (probablemente no, es reactivo puro)
- `src/app/notes/page.tsx` — migrar el `setDoc` directo de `page.tsx:51` (creación de nota nueva) para usar `notesRepo.createNote`

**Notas de implementación:**

- `extractLinks` y `computeDistillLevel` NO van al repo — son transformaciones puras ya en `src/lib/`. `useNoteSave` sigue invocándolas en memoria y pasa los resultados al `saveContent`.
- `syncLinks` (que escribe a colección `links/`) queda fuera del repo en este SPEC. Podría ir a un `linksRepo` futuro, pero no es crítico: hoy es un utility que hace append-only, no tiene el pattern optimistic. Fuera de scope.

---

## Orden de implementación

1. **F1** → todo depende de este factory. Sin F1, el resto no existe.
2. **F2** (piloto Tasks) → valida el factory contra una entidad real. **Punto de decisión GO/NO-GO**: si F2 no convence, abortar F3-F6 y revertir F1+F2.
3. **F3** (Projects + Objectives) → entidades estructuralmente idénticas a Tasks. Si F2 salió limpio, F3 es mecánico.
4. **F4** (Habits) → prueba el factory con ID determinístico. Divergencia controlada del patrón base.
5. **F5** (Inbox) → multi-entidad. Requiere F2 + F3 + F6 listos (convertTo\* invoca los otros repos). Reordenar: F6 antes que F5.
6. **F6** (Notes) → caso más complejo (content split TinyBase/Firestore). Se hace antes de F5 porque F5 depende de él.

**Orden final:** F1 → F2 (GO/NO-GO) → F3 → F4 → F6 → F5.

---

## Estructura de archivos

```
src/
└── infra/                      # NUEVO — único cambio estructural
    └── repos/
        ├── baseRepo.ts         # F1: factory genérico
        ├── baseRepo.test.ts    # F1: tests unitarios del factory
        ├── tasksRepo.ts        # F2
        ├── projectsRepo.ts     # F3
        ├── objectivesRepo.ts   # F3
        ├── habitsRepo.ts       # F4
        ├── notesRepo.ts        # F6
        └── inboxRepo.ts        # F5
```

Archivos modificados (no creados):

```
src/hooks/
├── useTasks.ts          # F2 refactor
├── useProjects.ts       # F3 refactor
├── useObjectives.ts     # F3 refactor
├── useHabits.ts         # F4 refactor
├── useNoteSave.ts       # F6 refactor
└── useInbox.ts          # F5 refactor

src/app/notes/page.tsx   # F6 — migrar createNote
```

No se tocan: `src/stores/`, `src/lib/tinybase.ts`, `src/components/`, `src/functions/`.

---

## Definiciones técnicas

### D1: Sin rollback automático en el factory

- **Opciones consideradas:**
  - (A) Factory implementa try/catch con `store.delRow` si Firestore falla.
  - (B) Factory solo loggea el error; el caller decide si reintentar.
- **Decisión:** B.
- **Razón:** El persister custom de `src/lib/tinybase.ts` ya tiene logic de sync bidireccional vía `onSnapshot` — si Firestore rechaza el write pero el listener detecta la divergencia, la UI converge eventualmente. Rollback manual duplica responsabilidad. Un fallo Firestore es suficientemente raro (auth expired, offline) como para que el error loggeado sea accionable sin ceremonia. Si aparece un caso real donde el rollback importa, se agrega en el repo específico, no en el factory.

### D2: Sin interfaces (`ITaskRepository`)

- **Opciones consideradas:**
  - (A) Definir `interface TaskRepository` y que `tasksRepo` la implemente.
  - (B) Export directo del objeto con type inferido.
- **Decisión:** B.
- **Razón:** 1 dev, 1 implementación, zero testing con mock repos. El structural typing de TypeScript cubre el contrato. Agregar interface es ruido en este scope.

### D3: Sin alias nuevos (`@infra/`)

- **Opciones consideradas:**
  - (A) Agregar `@infra/*: ./src/infra/*` en tsconfig + vite.config.
  - (B) Usar el alias existente `@/infra/repos/*`.
- **Decisión:** B.
- **Razón:** Alias nuevos son ruido cuando el existente cubre. `@/` ya apunta a `src/`. Cero cambios en configs. Si el día de mañana `src/` se renombra a `src/ui/`, ahí conviene redefinir `@/` y agregar alias específicos — es una decisión separada.

### D4: Tests unitarios solo del factory base, no de cada repo

- **Opciones consideradas:**
  - (A) Test suite completa por cada repo (tasksRepo.test.ts, projectsRepo.test.ts, …).
  - (B) Solo `baseRepo.test.ts` + validación E2E manual de cada hook migrado.
- **Decisión:** B (con opción de agregar (A) selectivamente si un repo tiene lógica no trivial como `habitsRepo.computeNextHabitState`).
- **Razón:** Cada repo específico es ~40 líneas de pass-through al factory. Testearlos aisladamente duplica los tests del factory. La validación E2E manual cubre la integración real.

### D5: Auth access en el método, hardcoded (sin getter inyectable)

- **Opciones consideradas:**
  - (A) Inyectar `uid` en `createFirestoreRepo({ uid, … })` al setup.
  - (B) Leer `auth.currentUser?.uid` directo del módulo `@/lib/firebase` dentro de cada método.
  - (C) Recibir `getUid?: () => string | null` como getter inyectable en la config del factory.
- **Decisión:** B.
- **Razón:** (A) requiere recrear el repo al login/logout — frágil. (C) agrega un parámetro de configuración sin caller real: D4 ya decidió que no hay tests por repo, y los tests del factory mockean `@/lib/firebase` directamente con `vi.mock`, no inyectan getters. Complejidad sin consumidor = YAGNI puro. (B) es el patrón ya establecido en `updateNoteType` (gotcha documentado), tolera logout/login mid-sesión, y el test #5 del factory cubre explícitamente el caso `auth.currentUser = null → throw`. Si el día de mañana aparece un caller legítimo (ej. admin tooling con impersonation), se refactorea a (C) entonces, no antes.

---

## Checklist de completado

Al terminar F6, TODAS estas condiciones deben ser verdaderas:

- [ ] `npm run build` pasa sin warnings.
- [ ] `npm run lint` pasa sin warnings nuevos.
- [ ] Los 6 repos (`baseRepo`, `tasksRepo`, `projectsRepo`, `objectivesRepo`, `habitsRepo`, `notesRepo`, `inboxRepo`) existen en `src/infra/repos/`.
- [ ] Los 6 hooks (`useTasks`, `useProjects`, `useObjectives`, `useHabits`, `useNoteSave`, `useInbox`) NO contienen llamadas directas a `setDoc`, `updateDoc`, `addDoc`, `deleteDoc` — toda la persistencia Firestore pasa por repos. Grep verificable: `grep -r "setDoc\|updateDoc\|addDoc\|deleteDoc" src/hooks/` devuelve zero líneas.
- [ ] `src/app/notes/page.tsx` y cualquier otro consumer de writes directos también migrado.
- [ ] Tests unitarios de `baseRepo.test.ts` verdes (5 tests específicos definidos en F1: orden sync/async de create/update/remove, id provisto vs auto-generado, `auth.currentUser` null → throw). `npm test` pasa.
- [ ] Validación E2E manual de las 6 entidades: crear, editar, borrar/archivar, listar. Todo funciona idéntico o mejor que antes (el fix de race condition en creates es el único cambio observable: reduce un flicker que podía ocurrir en clicks rápidos).
- [ ] LoC total de los 6 hooks reducida en ≥200 líneas agregado vs baseline.
- [ ] Documentar en ESTADO-ACTUAL.md (SDD paso 8) el patrón de repos y cualquier gotcha nuevo. Actualizar el gotcha "Optimistic updates" de CLAUDE.md apuntando a que el factory es el único implementador.
- [ ] Deploy web: `npm run build && npm run deploy` (sin deploy de CFs — no se tocan).
- [ ] Deploy desktop Tauri: **OPCIONAL** — cambio es 100% client-side, `src-tauri/` no se toca. Bump de versión solo si se decide releasear con la refactor.
- [ ] Deploy Android Capacitor: **OPCIONAL** — mismo criterio.

---

## Siguiente fase

Con la capa de repos consolidada, las fases siguientes habilitadas son:

- **⚠️ Feature 11 candidata (prioridad pronta) — "Store isolation + gating correcto":** fixes a los 2 hallazgos pre-existentes descubiertos en la auditoría de F10: (a) `store.delTable(tableName)` en cada user switch en [src/hooks/useStoreInit.ts](../src/hooks/useStoreInit.ts) antes de `startAutoLoad` para eliminar la ventana de cross-user data leak; (b) `isInitializing` sincronizado con el estado real del persister (hoy es un timer de 200ms arbitrario, no refleja cuando `startAutoLoad` terminó realmente); (c) evaluar retry + backoff para auth errors en el persister. Ninguno toca la capa de repos — son fixes al lifecycle de stores. Merecen feature dedicada con su propio SPEC y E2E para verificar los escenarios (user switch rápido, network lento, token expiry mid-sesión).
- **Feature 12 candidata — "Persister diff-based":** reemplazar el callback `setPersisted` actual (que itera todas las rows de la tabla y hace un `setDoc` por cada una) por una versión que use el parámetro `changes` del callback para escribir solo las rows modificadas. Beneficio en costos de Firestore proporcional al tamaño del dataset — significativo una vez que un user tenga >200 items por tabla. Baja prioridad mientras el proyecto esté en early-adopter stage (pocos datos por user), alta cuando haya dogfooding real.
- **Extracción selectiva de lógica pura a `src/lib/domain/`** (sin crear `core/` como capa) — solo para utilidades que demuestren valor de reuso o testabilidad. Bajo ROI según análisis, pero viable incrementalmente.
- **Compartir `schemas.ts` con el cliente** — mover `src/functions/src/lib/schemas.ts` a `src/shared/schemas.ts` si el cliente necesita los mismos tipos (ej. para mostrar qué campos AI va a producir). Cambio chico y reversible.

**Explícitamente NO siguiente:** Clean Architecture completa (`core/`, `usecases/`, ESLint guards). El análisis mostró ROI bajo para ese nivel de ceremonia en un proyecto de 1 dev con ~20% lógica pura. Si en el futuro el proyecto crece (>1 dev, dominio más complejo, necesidad de ports/adapters reales para testing), se reevalúa.
