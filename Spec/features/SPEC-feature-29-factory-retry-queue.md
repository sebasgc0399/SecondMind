# SPEC F29 — Retry queue extendido al factory `createFirestoreRepo`

> Estado: **Borrador — pendiente revisión + Plan mode**.
> Branch propuesta: `feat/factory-retry-queue` (a crear post-aprobación del SPEC).
> Predecesor: SPEC F28 dejó la primitiva `createSaveQueue<T>` reusable en [`src/lib/saveQueue.ts`](../../src/lib/saveQueue.ts) y un singleton dedicado para `saveContent`. Este SPEC lleva el patrón al resto del repo layer.

## Objetivo

Cerrar el silent data loss en TODOS los writes del factory `createFirestoreRepo` (`update`/`remove`) y los bypasses documentados (`notesRepo.acceptSuggestion`, `notesRepo.dismissSuggestion`). Pre-F29: si `await setDoc`/`updateDoc` falla en cualquier wrapper que NO sea `saveContent`, el `try/catch` silente loggea y retorna; la row ya está mutada en TinyBase (sync), entonces el UI muestra el estado nuevo, pero Firestore quedó stale → al recargar, `onSnapshot` pisa el optimistic. Casos hot:

- **Toggle favorito** — visible "favorito" en mobile sin red, falla, reload revierte.
- **Soft-delete** — nota desaparece de la lista, falla, reload la trae de vuelta.
- **Toggle hábito** — user marca el día, falla, nada queda al recargar.
- **`updateTask({ noteIds })`** — la asociación nota↔tarea se pierde silenciosamente.
- **`markProcessed` inbox** — item queda visible como pending tras procesarlo a una nota.
- **`acceptSuggestion`** — `arrayUnion` falla, la suggestion sigue apareciendo.

Solución: extender `createFirestoreRepo` con un `queue?: SaveQueue<Row>` inyectable per-entidad. Sus métodos `update`/`remove` delegan al queue cuando existe — misma semántica que el `saveContentQueue` del F28 (backoff `[1s, 2s, 4s]` × 4 attempts, fast-fail en errores permanentes Firebase, upsert sin reset de attempts, race cancel-vs-await, LRU 50). `create` queda **fuera del scope** (rompe el contrato `Promise<string>` del navigate-on-create). Los bypasses con `arrayUnion` reciben su propio executor envuelto en el queue de notes.

UI minimal: indicador global en el topbar/sidebar `N cambios pendientes` cuando `queues.size > 0`, color destructive cuando hay entries en `'error'` con `Reintentar todo` / `Descartar todo`. Sin lib de toasts; banner per-entidad queda como deuda explícita.

---

## Inventario de wrappers a migrar

| Wrapper                                            | Repo                      | Tipo    | F29 cubre? | Notas                                                                                                  |
| -------------------------------------------------- | ------------------------- | ------- | ---------- | ------------------------------------------------------------------------------------------------------ |
| `saveContent`                                      | notes                     | bypass  | YA F28     | Sin cambio — ya tiene `saveContentQueue` propio.                                                       |
| `createNote`                                       | notes                     | create  | NO         | Retorna ID; navigate inmediato post-await depende del primer setDoc. Out of scope.                     |
| `createFromInbox`                                  | notes                     | create  | NO         | Mismo motivo.                                                                                          |
| `updateMeta`                                       | notes                     | update  | **SÍ**     | `repo.update` → factory delega al queue.                                                               |
| `toggleFavorite`                                   | notes                     | update  | **SÍ**     | `repo.update`.                                                                                         |
| `softDelete` / `restore`                           | notes                     | update  | **SÍ**     | `repo.update`.                                                                                         |
| `hardDelete`                                       | notes                     | delete  | **SÍ**     | `repo.remove`. Trade-off actual ("doc reaparece via onSnapshot si falla red") se cierra con retry.     |
| `purgeAll`                                         | notes                     | bulk    | NO         | Bulk de 50 con `Promise.allSettled` per chunk; encolar 50 retries paralelos no escala.                 |
| `acceptSuggestion`                                 | notes                     | bypass  | **SÍ**     | `updateDoc` directo + `arrayUnion`. Wrapping manual con queue de notes (key compuesta).                |
| `dismissSuggestion`                                | notes                     | bypass  | **SÍ**     | Mismo patrón.                                                                                          |
| `createTask` / `createProject` / `createObjective` | tasks/projects/objectives | create  | NO         | Out of scope (mismo motivo que createNote).                                                            |
| `updateTask`                                       | tasks                     | update  | **SÍ**     | `repo.update` con `stringifyIds` previo.                                                               |
| `completeTask`                                     | tasks                     | wrapper | transitivo | Llama internamente a `updateTask` — gana retry sin tocar el wrapper.                                   |
| `updateProject`                                    | projects                  | update  | **SÍ**     | `repo.update`.                                                                                         |
| `updateObjective`                                  | objectives                | update  | **SÍ**     | `repo.update`.                                                                                         |
| `toggleHabit`                                      | habits                    | update  | **SÍ**     | `repo.update` (setPartialRow auto-create al primer toggle del día).                                    |
| `markProcessed`                                    | inbox                     | update  | **SÍ**     | `repo.update`.                                                                                         |
| `dismiss`                                          | inbox                     | update  | **SÍ**     | `repo.update`.                                                                                         |
| `convertToNote/Task/Project`                       | inbox                     | orch    | transitivo | Delega a notesRepo/tasksRepo/projectsRepo + `markProcessed`. Cada step gana retry por su propio queue. |

---

## Decisiones a confirmar antes de Plan mode

> Cada decisión arranca con la **recomendación** y el **trade-off** principal. Sebastián cierra `[CONFIRMADO]` o `[REVISAR]` antes de pasar a Plan mode.

**D1 — Topología: una queue por entidad.**

- Recomendación: singletons separados (`saveTasksQueue`, `saveProjectsQueue`, `saveObjectivesQueue`, `saveHabitsQueue`, `saveInboxQueue`, `saveNotesMetaQueue`). El `saveContentQueue` existente queda intocado.
- Trade-off: 6 queues + `saveContentQueue` = 7 singletons. Alternativa única queue compartida con keys `${entity}:${id}` evita duplicación pero pierde tipado por `Partial<Row>` (union types complejos). Una-por-entidad da paridad con F28 y simplifica los flush hooks.
- Estado: `[CONFIRMADO]`

**D2 — Wiring: queue inyectado al factory `createFirestoreRepo`.**

- Recomendación: `createFirestoreRepo<Row>({ store, table, pathFor, queue?: SaveQueue<Row> })`. `update`/`remove` delegan al queue cuando existe. El factory hace la shallow copy + `setRow/delRow` sync ANTES de encolar (para que el `setPartialRow` ya esté aplicado a TinyBase). El executor encolado solo encapsula el `setDoc`/`deleteDoc`. Sin queue → comportamiento actual (retro-compatible).
- Trade-off: el factory pasa de 60 a ~100 LOC; concentra la complejidad del retry en un solo lugar vs. wrappear cada llamada en cada repo (que duplicaría boilerplate).
- Estado: `[CONFIRMADO]`

**D3 — Creates fuera de scope F29.**

- Recomendación: dejar `createNote`, `createTask`, `createProject`, `createObjective`, `createFromInbox` con el comportamiento actual (`try/catch + return null`). Razón: `await repo.create()` retorna el ID inmediato y los callers navegan (`navigate('/notes/{id}')`) — encolar create cambia el contrato y rompe los gotchas de "navegación inmediata post-create" documentados en ESTADO-ACTUAL.
- Trade-off: el silent loss en createX queda abierto. Mitigación: el caller ya recibe `null` y puede mostrar error al usuario (UI manual). Queda como deuda explícita en out-of-scope.
- Estado: `[CONFIRMADO]`

**D4 — Bypasses (`acceptSuggestion`/`dismissSuggestion`): reusar `saveNotesMetaQueue`.**

- Recomendación: el wrapper construye un executor que arma el `updateDoc` con `arrayUnion` y lo encola con key compuesta `${noteId}:accept-${suggestionId}` / `${noteId}:dismiss-${suggestionId}`. Distinta key → no choca con un `updateMeta` paralelo del mismo `noteId`.
- Trade-off: keys compuestas en el queue vs. queue dedicado para suggestions. Reusar es más simple — el queue solo necesita una entry id distinta.
- Estado: `[CONFIRMADO]`

**D5 — UI: indicador global sutil + sin lib de toasts.**

- Recomendación: componente `<PendingSyncIndicator />` montado en el sidebar/topbar (decidir mount point en Plan mode). Suscrito a los 7 queues via `useSyncExternalStore` agregado. Estados: oculto si total = 0, "N cambios pendientes" amber si hay retrying/syncing, "N sin guardar" destructive si `>= 1` en error con popover [Reintentar todo / Descartar todo / Ver detalle].
- Trade-off: minimal UI vs. banners ricos por entidad (toast lib, action sheets, modal de detalle). Empezar simple — la deuda visible se documenta para SPEC futuro si surgen falsos positivos o frustración de usuario.
- Estado: `[CONFIRMADO]`

**D6 — Bulk operations (`purgeAll`) sin queue.**

- Recomendación: dejar `Promise.allSettled` per chunk como hoy. Retry per-item con queue agrega 50 entries en bursts → ruido en el indicador.
- Trade-off: si falla un chunk, el user reintenta el botón. Aceptable porque `purgeAll` es low-frequency intencional (vaciar papelera).
- Estado: `[CONFIRMADO]`

**D7 — Singletons inline en `saveQueue.ts` o re-exports per-repo.**

- Recomendación: agregar los 6 singletons al final de `src/lib/saveQueue.ts` (paridad con `saveContentQueue` línea 329). Cada repo importa su singleton.
- Trade-off: el archivo crece a ~360 LOC con 7 exports + tipos. Aceptable por simetría — cualquier futuro `useSaveQueueFlush` itera el array `[saveContentQueue, ...metaQueues]`.
- Estado: `[CONFIRMADO]`

**D8 — Extender `useSaveQueueFlush` a los 6 queues nuevos.**

- Recomendación: el hook actual flushea solo `saveContentQueue` en `beforeunload` + `online` + `useCloseToTray`. Extender a `Promise.allSettled([saveContentQueue.flushAll(), ...metaQueues.flushAll()])`. Timeout 2s del Tauri close-to-tray sigue cubriendo los 7 globalmente.
- Trade-off: el dialog `beforeunload` ahora dispara incluso por un toggle de hábito pendiente. Aceptable — el user prefiere "querés cerrar?" sobre data loss silencioso. Las queues vacías no triggean el dialog (cubierto por el `if (snapshot.size === 0) return` actual).
- Estado: `[CONFIRMADO]`

---

## Sub-features

### F29.1 — Singletons de queue por entidad

**Qué:** agregar 6 singletons al final de `src/lib/saveQueue.ts`, tipados por `Partial<Row>` de cada entidad. Definir un array iterable `metaQueues` con los 6 + helper `flushAllMetaQueues()` para futuros consumidores.

**Criterio de done:**

- 6 nuevos exports en `src/lib/saveQueue.ts`: `saveNotesMetaQueue`, `saveTasksQueue`, `saveProjectsQueue`, `saveObjectivesQueue`, `saveHabitsQueue`, `saveInboxQueue`.
- Tipos `Partial<NoteRow>`, `Partial<TaskRow>`, etc. — los `Row` tipos viven en cada `*Repo.ts`; si crear un ciclo de imports, mover los tipos a `src/types/repoRows.ts`.
- Array `metaQueues` exportado con los 6 instancias para iteración.
- Tests vitest existentes (14 escenarios de F28.1) siguen verdes.

**Archivos a tocar:**

- [src/lib/saveQueue.ts](../../src/lib/saveQueue.ts) — agregar exports al final.
- (Posible) [src/types/repoRows.ts](../../src/types/repoRows.ts) — nuevo, si hay ciclo de imports.

**Commit:** `feat(savequeue): singletons de retry queue por entidad (notes meta, tasks, projects, objectives, habits, inbox)`

---

### F29.2 — Factory `createFirestoreRepo` con `queue?` opcional

**Qué:** extender `RepoConfig` con `queue?: SaveQueue<Row>`. Los métodos `update` y `remove` del factory delegan al queue cuando existe. La invariante sync→async→retry queda centralizada.

**Pseudo-API objetivo:**

```ts
export interface RepoConfig<Row extends RepoRow> {
  store: Store;
  table: string;
  pathFor: (uid: string, id: string) => string;
  queue?: SaveQueue<Partial<Row>>;
}

// update con queue:
async update(id, partial) {
  const uid = requireUid();
  const partialForFirestore = { ...partial };
  store.setPartialRow(table, id, partial as RepoRow);  // sync first
  if (cfg.queue) {
    cfg.queue.enqueue(id, partialForFirestore, async (p) =>
      setDoc(doc(db, pathFor(uid, id)), p, { merge: true })
    );
    return;
  }
  await setDoc(doc(db, pathFor(uid, id)), partialForFirestore, { merge: true });
}
```

**Criterio de done:**

- `RepoConfig<Row>` parametrizado (era `RepoConfig` plain).
- `update`/`remove` con branch `if (cfg.queue)` que encola; sin queue mantiene comportamiento actual.
- Tests `baseRepo.test.ts` extendidos: 4 escenarios nuevos (update con queue → enqueue, update sin queue → setDoc directo, remove con queue → enqueue de delete, race upsert durante syncing → re-ejecuta payload nuevo).
- Build + lint verdes.
- Compatibilidad: repos sin queue (caso transitorio durante migración) deben seguir funcionando.

**Archivos a tocar:**

- [src/infra/repos/baseRepo.ts](../../src/infra/repos/baseRepo.ts).
- [src/infra/repos/baseRepo.test.ts](../../src/infra/repos/baseRepo.test.ts).

**Commit:** `feat(repos): factory createFirestoreRepo con retry queue opcional inyectable`

---

### F29.3 — Wiring del queue en cada repo

**Qué:** cada repo declara su queue al construir el factory. Wrappers existentes no cambian (siguen usando `repo.update`/`repo.remove`).

**Criterio de done por repo:**

| Repo                                                         | Cambio                                                                                                                                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [notesRepo.ts](../../src/infra/repos/notesRepo.ts)           | `createFirestoreRepo<NoteRow>({ ..., queue: saveNotesMetaQueue })`. Wrappers `updateMeta`/`toggleFavorite`/`softDelete`/`restore`/`hardDelete` heredan retry sin tocar su body. |
| [tasksRepo.ts](../../src/infra/repos/tasksRepo.ts)           | Análogo. `updateTask`/`completeTask` ganan retry transitivo.                                                                                                                    |
| [projectsRepo.ts](../../src/infra/repos/projectsRepo.ts)     | Análogo. `updateProject` gana retry.                                                                                                                                            |
| [objectivesRepo.ts](../../src/infra/repos/objectivesRepo.ts) | Análogo. `updateObjective` gana retry.                                                                                                                                          |
| [habitsRepo.ts](../../src/infra/repos/habitsRepo.ts)         | Análogo. `toggleHabit` gana retry. Caso edge: setPartialRow auto-create del día — el queue debe idempotency-respetar el `partial.createdAt` del primer toggle.                  |
| [inboxRepo.ts](../../src/infra/repos/inboxRepo.ts)           | Análogo. `markProcessed`/`dismiss` ganan retry. Las orchestrations (`convertToNote/Task/Project`) heredan via los child repos.                                                  |

**Criterio de done global:**

- 6 repos modificados (1 línea cada uno + import).
- Tests existentes (`notesRepo.test.ts`, `inboxRepo.test.ts`) verdes — los tests no deberían cambiar comportamiento porque el queue ejecuta el primer attempt de inmediato (igual al setDoc directo).
- Build + lint verdes.

**Archivos a tocar:**

- 6 archivos de repo + sus tests.

**Commit:** `feat(repos): wire retry queue en notes/tasks/projects/objectives/habits/inbox`

---

### F29.4 — Bypasses notes (`acceptSuggestion` + `dismissSuggestion`) wrapped

**Qué:** los dos wrappers que usan `updateDoc` con `arrayUnion` (no pasan por el factory) se rewrapean explícitamente con `saveNotesMetaQueue.enqueue` con keys compuestas para no chocar con `updateMeta` paralelo.

**Pseudo-implementación:**

```ts
async function acceptSuggestion(noteId, suggestionId, payload) {
  const uid = requireUid();
  notesStore.setPartialRow('notes', noteId, { noteType: payload.noteType });

  const queueKey = `${noteId}:accept-${suggestionId}`;
  const docPayload = {
    noteType: payload.noteType,
    dismissedSuggestions: arrayUnion(suggestionId),
    updatedAt: Date.now(),
  };

  saveNotesMetaQueue.enqueue(queueKey, docPayload, async (p) =>
    updateDoc(doc(db, `users/${uid}/notes/${noteId}`), p),
  );
}
```

**Criterio de done:**

- Ambos wrappers usan `enqueue` en lugar de `await updateDoc` directo.
- Keys compuestas evitan colisión con `updateMeta` del mismo `noteId`.
- Test E2E (Playwright MCP en F29.7): banner suggestion sigue funcionando offline → online recovery via flushAll.
- Build verde.

**Archivos a tocar:**

- [src/infra/repos/notesRepo.ts](../../src/infra/repos/notesRepo.ts) — body de `acceptSuggestion` y `dismissSuggestion`.

**Commit:** `feat(notes): wrap acceptSuggestion/dismissSuggestion en saveNotesMetaQueue`

---

### F29.5 — `<PendingSyncIndicator />` global

**Qué:** componente nuevo montado en el shell (sidebar desktop + topbar mobile, decidir en Plan mode). Suscribe a los 7 queues vía `useSyncExternalStore` agregado. Render condicional según totales.

**Estados visuales propuestos:**

| Total queues | Estado de entries                 | Render                                                                   |
| ------------ | --------------------------------- | ------------------------------------------------------------------------ |
| 0            | -                                 | oculto                                                                   |
| ≥1           | todas en pending/syncing/retrying | "N cambios pendientes" amber                                             |
| ≥1           | ≥1 en error                       | "N sin guardar" destructive + popover [Reintentar todo / Descartar todo] |

**Criterio de done:**

- Componente `src/components/layout/PendingSyncIndicator.tsx`.
- Hook helper `src/hooks/usePendingSyncCount.ts` que agrega los 7 queues.
- Integrado en el shell (Sidebar + MobileHeader).
- Acción [Reintentar todo] llama `retryNow` en cada entry de cada queue en error.
- Acción [Descartar todo] llama `cancel` en cada entry de cada queue (todos los estados).
- Visualmente verificado en QA E2E (F29.7) en 375/768/1280.

**Archivos a tocar:**

- Nuevo: [src/components/layout/PendingSyncIndicator.tsx](../../src/components/layout/PendingSyncIndicator.tsx).
- Nuevo: [src/hooks/usePendingSyncCount.ts](../../src/hooks/usePendingSyncCount.ts).
- Modificado: [src/components/layout/Sidebar.tsx](../../src/components/layout/Sidebar.tsx) y [src/components/layout/MobileHeader.tsx](../../src/components/layout/MobileHeader.tsx).

**Commit:** `feat(layout): indicador global de syncs pendientes con retry/discard global`

---

### F29.6 — `useSaveQueueFlush` extendido a los 7 queues

**Qué:** el hook actual flushea solo `saveContentQueue` en `beforeunload` + `online`. Extender a `Promise.allSettled` sobre los 7. El timeout 2s del Tauri close-to-tray cubre el agregado.

**Criterio de done:**

- `useSaveQueueFlush.ts` itera `[saveContentQueue, ...metaQueues]`.
- `useCloseToTray.ts` no cambia su shape — el `flushAll` pasado adentro ahora flushea los 7.
- E2E manual: editar nota + togglear hábito offline → reconectar → flush dispara setDoc para ambos.

**Archivos a tocar:**

- [src/hooks/useSaveQueueFlush.ts](../../src/hooks/useSaveQueueFlush.ts).
- [src/hooks/useCloseToTray.ts](../../src/hooks/useCloseToTray.ts) (revisar si necesita cambio o ya recibe el helper agregado).

**Commit:** `feat(savequeue): flush hooks extendidos a los 6 queues nuevos`

---

### F29.7 — QA E2E con Playwright MCP + cierre

**Qué:** validación visual + funcional de los queues nuevos en producción local. Sin Playwright Test Runner (alineado con F28.5).

**Escenarios mínimos:**

1. **Toggle favorito offline** (DevTools → Network: Offline) → indicador muestra "1 cambio pendiente" amber. Online → flush automático → setDoc verde en Network.
2. **Soft-delete offline** → row desaparece de la lista, indicador "1 pendiente". Online → flush. Reload: row sigue eliminada (no reaparece).
3. **Toggle hábito offline** → ✓ visible en grid, indicador "1 pendiente". Permanent error simulado (`saveHabitsQueue.enqueue` con executor que rechaza con FirebaseError `permission-denied`) → indicador destructive, popover con acciones.
4. **`updateTask({ noteIds })` offline** → asociación visible, online → flush, recarga: asociación persiste.
5. **`acceptSuggestion` offline** → suggestion desaparece local, indicador pendiente, online → `arrayUnion` se aplica server-side.
6. **`markProcessed` inbox offline** → item sale de la lista pending, online → flush, reload: status `processed`.
7. **3 queues simultáneos en pending** → indicador "3 pendientes". Online → flush → 3 setDocs paralelos en Network.
8. **`Descartar todo`** → cancela todas las entries de todos los queues; UI revela el estado pre-write (TinyBase no se rollbackea — deuda visible en out-of-scope).
9. **`Reintentar todo`** con 1 en error → re-encola con attempts: 0.

**Criterio de done:**

- Los 9 escenarios validados via MCP con screenshots.
- Lint + typecheck + tests verdes.
- Deploy hosting (sin CFs).
- Tauri build opcional (cambio 100% client-side).
- Capacitor sync opcional.

---

## Orden de implementación

1. **F29.1** — singletons de queue (mecánico, base de todo lo demás).
2. **F29.2** — factory extendido con `queue?` (core architectural change).
3. **F29.3** — wiring por repo (1 línea cada uno; 6 commits o 1 según preferencia, ver checklist).
4. **F29.4** — bypasses de notes (acceptSuggestion + dismissSuggestion).
5. **F29.5** — `<PendingSyncIndicator />` UI.
6. **F29.6** — flush hooks extendidos.
7. **F29.7** — QA E2E + deploy + cierre del SPEC a registro de implementación.

> Granularidad de commits para F29.3: a confirmar en Plan mode. Default: 1 commit por repo (6 commits) para bisect-friendly trail; alternativa: 1 commit "wire 6 repos" si los cambios son verdaderamente triviales (1 línea cada uno).

---

## Checklist de cierre (SDD step 7-8)

- [ ] D1–D8 confirmadas o ajustadas (Sebastián).
- [ ] Plan mode con Explore agents + Plan agent (paso 2 SDD).
- [ ] Branch `feat/factory-retry-queue` creada.
- [ ] F29.1–F29.7 implementadas con commits atómicos en español.
- [ ] `npm run lint` → 0 errors / 0 warnings (no agregar disables nuevos sin justificación).
- [ ] `npm run build` → typecheck verde.
- [ ] `npm test` → vitest verde (saveQueue + baseRepo + repos individuales).
- [ ] QA E2E Playwright MCP con los 9 escenarios.
- [ ] `npm run build && npm run deploy` (hosting).
- [ ] Tauri/Capacitor build/sync opcionales según D1–D8 finales.
- [ ] Merge `--no-ff` a main + push origin.
- [ ] Convertir SPEC a registro de implementación (skill `archive-spec`).
- [ ] Escalar a ESTADO-ACTUAL: gotcha "saveContent tiene retry queue dedicado, el resto NO" → reemplazar por "todo el factory retry-protected via queue inyectado per-entidad". Pointer a este SPEC.
- [ ] Evaluar si el patrón "factory + queue inyectado" sube a CLAUDE.md como gotcha universal (default: NO escalar todavía — es específico al repo layer).

---

## Out of scope (deuda explícita, escalar a ESTADO-ACTUAL al cerrar)

- **Creates con retry queue.** `createNote/Task/Project/Objective/createFromInbox` quedan con silent loss. Razón: rompe contrato `Promise<string>` del navigate-on-create. SPEC futuro si surge demanda — opciones: encolar create + fast-resolve con UUID local, o mostrar toast de error al caller.
- **Persistencia del queue en IndexedDB / Firebase offline persistence.** Mismo argumento que F28: no bloqueante, esperar señales de logs en producción.
- **Telemetría / observabilidad.** Cuántos retries, distribución de error codes, qué entidades fallan más. Útil para dimensionar IndexedDB persistence.
- **Banner per-entidad rico** (toast lib, action sheets, modal de detalle de pendientes). El indicador global de F29.5 cubre la primera versión; si el feedback de uso muestra que es insuficiente, SPEC futuro lo extiende.
- **Subscription granular per-id en `usePendingSyncCount`.** El `useSyncExternalStore` agregado notifica a todas las suscripciones cuando muta cualquier queue. No crítico para v1 (típicamente 0-1 entry pendiente). Refactor a notify selectivo si aparece como bottleneck.
- **`setPartialRow` stale en TinyBase tras `Descartar todo`.** El `cancel` del queue mata el setDoc pendiente, pero el `setPartialRow` sync-previo NO se rollbackea — el indicador cierra y la row local muestra el último valor optimistic. Mismo gotcha que F28 expuso para `saveContent`. Solución completa requiere snapshot pre-write + restore — deuda compartida con F28.
- **Bulk operations (`purgeAll`) sin queue.** Si bulk delete falla un chunk, retry manual. Si el feedback de usuario muestra confusión, extender.
