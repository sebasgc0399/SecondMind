# TinyBase + Firestore sync

> Canon de gotchas del dominio. Índice ligero en `../ESTADO-ACTUAL.md` § "Gotchas por dominio (índice)".
> Cada gotcha vive como `## <título>`. El slug del título es el anchor estable referenciado desde el índice.

## Persister con `merge: true` es precondición global

Sin merge, borra campos fuera del schema TinyBase (como `content` de notas, campos `ai*` de CFs). Aplica a todo persister nuevo.

## Capa de repos en `src/infra/repos/` centraliza el patrón optimistic (desde F10)

Todo write a Firestore debe pasar por un repo (`tasksRepo`, `projectsRepo`, etc.) en lugar de llamar `setDoc`/`setPartialRow` inline desde un hook. El factory garantiza orden `setRow (sync) → await setDoc (async)` y auto-genera UUID v4 si no se provee `id`. Ver [baseRepo.ts](../../src/infra/repos/baseRepo.ts) para la firma y [baseRepo.test.ts](../../src/infra/repos/baseRepo.test.ts) para patrones de mocking con `vi.mock`.

## TinyBase v8 muta el objeto pasado a `setRow` y `setPartialRow`

Removiendo campos no declarados en el schema (post-F26). `baseRepo.create` y `.update` hacen shallow copy ANTES de pasarlo al store para que el setDoc posterior reciba el objeto original con todos los campos. Sin la copia, campos extra (ej. `content` TipTap JSON en `notesRepo.createFromInbox`) nunca llegan a Firestore. Bug latente desde F10, destapado por F26 batch — el flow single-item lo enmascaraba porque tras `navigate('/notes/{id}')` el `useNoteSave` autosave eventualmente persistía `content` por su propio path; el batch no navega y no había compensación. El fix se extendió a `update` post-QA del subsistema Inbox+Notas — hoy ningún caller pasa campos no-en-schema a `update`, pero la migración del slashMenu al factory (último bypass directo, ahora cerrado: usa `notesRepo.updateMeta`) y futuros campos CF-write-only lo necesitan sano. Aplicable a cualquier futuro repo que pase un objeto con campos no-en-schema al factory `createFirestoreRepo`. Patrón vivo en [baseRepo.ts](../../src/infra/repos/baseRepo.ts) (`{ ...data }` en create, `{ ...partial }` en update).

## Creación de recursos con navegación inmediata: `await repo.create(...)` → `navigate()`

El factory retorna la promesa tras completar setDoc, entonces `useNote.getDoc` en la página destino encuentra el doc presente en Firestore. Patrón aplicado en `app/notes/page.tsx` y `convertToNote` de inboxRepo.

## Content largo (TipTap JSON) sigue yendo solo a Firestore, NO a TinyBase

`notesRepo.saveContent(id, payload)` es el único método que persiste `content`: hace `setPartialRow` a TinyBase con todos los campos derivados (title, contentPlain, updatedAt, distillLevel, linkCount, outgoingLinkIds) EXCEPTO content, y después `updateDoc` explícito a Firestore con content incluido. Un solo write atómico. `notesRepo.createFromInbox` es la variante que construye un docJson TipTap desde rawContent y lo persiste junto con metadata.

## Write amplification resuelto por F12 (persister diff-based)

El callback `setPersisted` en [src/lib/tinybase.ts](../../src/lib/tinybase.ts) ahora consume el param `changes` nativo de TinyBase v8 — emite `setDoc(merge:true)` solo para las rows tocadas en la transacción, no para toda la tabla. Reduce write amplification de O(N) a O(cambios). `Promise.allSettled` evita que un setDoc fallido aborte los paralelos del mismo tick; rejects se reportan vía `onIgnoredError` (6º arg de `createCustomPersister`) sin retry automático — rows fallidas quedan eventualmente consistentes solo cuando vuelven a tocarse. Sin `changes` (típico primer tick post-`startAutoLoad`): skip + `console.debug` en dev.

## Cross-user data leak resuelto por F11

`useStoreInit` llama `store.delTable(tableName)` para las 7 tablas pre-`startAutoLoad` y en cleanup post-`destroy()`. Cualquier nueva tabla agregada al `configs` array de [src/hooks/useStoreInit.ts](../../src/hooks/useStoreInit.ts) hereda automáticamente el cleanup. Orden crítico en cleanup: `destroy()` (apaga onSnapshot + autoSave) antes de `delTable()`; invertido = race con snapshot in-flight repoblando la tabla vacía.

## Limitación TinyBase v8 (post-F12): `changes` NO incluye row IDs eliminados

`delRow` standalone produce `changes = [{}, {}, 1]` (vacío); `delTable` igual. El persister F12 NO puede propagar deletes a Firestore — ignora silenciosamente cualquier mutación de tipo delete. Inocuo en producción: todos los deletes pasan por repos (F10) que hacen `deleteDoc` directo. Si alguien llama `store.delRow` sin pasar por un repo, el doc queda huérfano en Firestore — patrón a evitar (era cierto pre-F12 también, según el gotcha original de F11). Beneficio colateral: si el orden `destroy() → delTable()` del cleanup F11 se invierte por accidente, F12 NO borra Firestore (pre-F12 sí lo haría).

## Items de inbox nunca se borran físicamente

Se marcan `status: 'processed'` o `'dismissed'`. Filter pending los oculta, preserva historial.

## Embeddings NO van en TinyBase

Vectores de 1536 floats (~6KB c/u) demasiado grandes para store in-memory. Carga on-demand desde Firestore con cache module-level en [`src/lib/embeddings.ts`](../../src/lib/embeddings.ts).

## Gate de hidratación: `useStoreHydration()` (signal real, post-F11)

Hooks/componentes que muestran skeleton hasta que las 7 tablas TinyBase terminan `startAutoLoad` consumen `useStoreHydration()` — devuelve `{ isHydrating: boolean }` sincronizado con `Promise.all` del [Provider en layout.tsx](../../src/app/layout.tsx). Default sin Provider: `{ isHydrating: true }` (skeleton-safe en `/login`, `/capture`, tests). Para gates de redirect por "row no existe" en detail pages: `!isHydrating && !row`, no timer arbitrario. Patrón vivo en [src/app/projects/[projectId]/page.tsx](../../src/app/projects/%5BprojectId%5D/page.tsx). Reemplazó los 8 timers `INIT_GRACE_MS = 200` y el grace de 1500ms del workaround viejo.

## TinyBase Cell types no soportan `null` (post-F18)

Para campos opcionales tipo timestamp (soft delete, "no seteado"), el patrón es: dominio TS expone `field: number | null`, capa persistencia (Row) usa `0` como sentinel + check explícito (`row.deletedAt > 0`). Aplicable a cualquier futuro soft-delete o flag tri-estado. Patrón vivo en [src/types/note.ts](../../src/types/note.ts) y [src/infra/repos/notesRepo.ts](../../src/infra/repos/notesRepo.ts) (`deletedAt`).

## Doc único reactivo (no-collection): `onSnapshot` directo con cache module-level + dedupe (post-F19)

Los 7 stores TinyBase cubren collections; para preferencias/configs de usuario que viven en un único doc (`users/{uid}/settings/preferences`), centralizar la suscripción en `src/lib/X.ts` con `subscribeX(uid, cb): unsubscribe` (cache `Map<uid, { listeners: Set<cb>, unsubscribe }>` — mismo patrón que [src/lib/embeddings.ts](../../src/lib/embeddings.ts)). El hook React (`useX`) es solo wrapper sobre `subscribeX` con anti-stale `userIdRef` (pattern de useStoreInit). NO crear store TinyBase para 1-3 campos — over-engineering. Cuando se acumulen >3 campos, considerar migrar a tabla via persister para unificar con cleanup F11/F12. Vivo en [src/lib/preferences.ts](../../src/lib/preferences.ts) + [src/hooks/usePreferences.ts](../../src/hooks/usePreferences.ts). **Callback firma `(value, isLoaded: boolean)` (post-F22).** Sin el flag explícito, consumers que disparan side-effects basados en flags (auto-popover, banners one-time) actúan contra `DEFAULT_*` antes del primer `onSnapshot` real → race con el valor real cuando llega ~100-300ms después. El hook expone `isLoaded` además del valor; effects con dep `[isLoaded, value.flag]` esperan al snapshot real.

## `setDoc({merge: true})` con dot-notation NO crea path nested (post-F22)

Es trampa silenciosa: el SDK acepta `setDoc(ref, { 'a.b.c': true }, { merge: true })` sin error, pero guarda la key literal con puntos en el nombre top-level (`"a.b.c": true`), NO una estructura nested `{ a: { b: { c: true } } }`. Solo `updateDoc(ref, { 'a.b.c': true })` interpreta dot-notation como path. Para flags one-time donde dos writes pueden disparar paralelos sobre el mismo path-map (race de closure stale), patrón canónico: `updateDoc` con dot-notation + fallback a `setDoc` con objeto nested cuando el doc no existe (FirebaseError code `'not-found'`). Race nulo en el fallback porque no hay objeto previo que pisar. Vivo en [src/lib/preferences.ts](../../src/lib/preferences.ts) (`markDistillBannerSeen`).

## Backwards-compat de jobs scheduled con datos pre-feature: hardcodear `FIRST_DEPLOY_TS` (post-F19)

Si un cron CF opera sobre datos retroactivos (ej. soft-deleted antes del deploy), el primer run puede borrar masivamente sin grace period. Mitigación: `const FEATURE_FIRST_DEPLOY_TS = Date.UTC(...)` en la CF + lógica `effectiveTimestamp = max(actualTimestamp, FEATURE_FIRST_DEPLOY_TS)`. Datos pre-feature obtienen grace period equivalente al config desde el deploy. NO modificar el timestamp después del deploy (rompe consistencia). Patrón aplicable a cualquier futuro scheduled job que opere sobre filas existentes con timestamps reales (ej. re-embedding mensual con notas viejas, weekly digest, FSRS due notifications). Vivo en [src/functions/src/notes/autoPurgeTrash.ts](../../src/functions/src/notes/autoPurgeTrash.ts) (`F19_FIRST_DEPLOY_TS`).

## `arrayUnion` requires `updateDoc`, NO `setDoc(merge:true)` (post-F23)

Para campos que mutan atómicamente desde múltiples writers (cross-device, dos clicks rápidos), el patrón es `updateDoc(ref, { campo: arrayUnion(value) })` directo. `setDoc(merge:true)` del factory `baseRepo` NO interpreta el sentinel correctamente — guarda el objeto serializado del FieldValue como literal, corrompiendo el campo. Bypass intencional al patrón factory: helper como `notesRepo.dismissSuggestion` arma el `updateDoc` manualmente y se documenta como excepción al sync→async optimistic. Aplicable a cualquier futuro array Firestore-only que reciba writes concurrentes (favoritos cross-device, tags compartidos, etc.). Patrón vivo en [src/infra/repos/notesRepo.ts](../../src/infra/repos/notesRepo.ts) (`acceptSuggestion`/`dismissSuggestion`).

## Factory entero retry-protected via queue inyectado per-entidad (post-F29)

El factory `createFirestoreRepo` acepta `queue?: SaveQueue<Partial<Row>>` opcional; con queue presente, `update`/`remove` delegan al queue (mismo patrón de backoff `[1s, 2s, 4s]` × 4 attempts + fast-fail FirebaseError + upsert version-tagging + race cancel-vs-await + LRU 50 que F28 introdujo). Sin queue → comportamiento legacy (retro-compat). Los 7 singletons (`saveContentQueue` + 6 meta queues por entidad) en [src/lib/saveQueue.ts](../../src/lib/saveQueue.ts) cubren notes meta / tasks / projects / objectives / habits / inbox. Bypasses con `arrayUnion` (`acceptSuggestion`, `dismissSuggestion`) reusan `saveNotesMetaQueue` con composite keys (`${noteId}:accept-${suggestionId}`) para no chocar con `updateMeta` paralelo. Sign-out mid-retry guard en el executor: recheca `auth.currentUser?.uid !== capturedUid` al inicio de cada attempt → throw genérico → 4 attempts → 'error' visible en indicator. Cuando un repo necesita bulk delete sin queue (LRU cap conflict), usar `removeRaw(id)` que bypassa siempre. Reusar idéntico para futuros queues: detección de error permanente con `instanceof FirebaseError` + set `{permission-denied, failed-precondition, invalid-argument, unauthenticated}` (fast-fail), upsert sin reset de attempts (mantener progreso del backoff durante typing), version-tagging para in-flight upserts, race cancel-vs-await con flag `cancelled` mutado en la entry, LRU cap defensivo, API canónica `subscribe(cb)` + `getSnapshot()` separados para `useSyncExternalStore`. **Creates fuera de scope** (`createNote/Task/Project/Objective/createFromInbox`): rompe contrato `Promise<string>` del navigate-on-create — siguen con `try/catch + return null` legacy.

## `SaveQueue<T>.clear()` separado de `dispose()` para test isolation (post-F29)

Module-level singletons (los 7 queues) viven entre tests del mismo file. Sin reset, una suite que enqueue contamina la próxima. `dispose()` no sirve porque silencia futuros enqueues — la próxima suite no puede usar el queue. `clear()` resetea contenido (`clearTimeout` de timers + `entries.clear()` + `notify()`) sin tocar `disposed`. Doble uso: `beforeEach` tests entre suites + acción "Descartar" del `<PendingSyncIndicator />`. Aplicable a cualquier singleton stateful expuesto al test runner.

## `useSyncExternalStore` agregado: subscribe app-lifetime + `getSnapshot` cached-by-version (post-F29)

Cuando un hook agrega múltiples sources (los 7 queues en `usePendingSyncCount`), `subscribe(cb)` debe fan-out a todos con multi-unsub, y `getSnapshot()` debe ser cacheable: si nada cambió desde el último call, devolver la misma referencia (Object.is requirement de React). Patrón: `bumpVersion` suscrito a los sources al module load incrementa un counter cada notify; `getSnapshot()` re-computa solo si `cachedVersion !== globalVersion`. Match exacto al patrón de `useOnlineStatus` pero extendido a N sources. Patrón vivo en [src/hooks/usePendingSyncCount.ts](../../src/hooks/usePendingSyncCount.ts). Aplicable a futuros agregadores de stores.

## Discard de cambios locales no persistidos: key bump del componente padre + re-fetch del hook one-shot (post-F28)

Para flows tipo "rollback/discard" donde el usuario quiere descartar cambios pendientes y volver al estado server, el patrón canónico es: state monotonic en el padre (`discardCount: number`), key compuesta `key={`${entityId}-${discardCount}`}` en el child que monta el editor, `version` opcional como dep extra del hook one-shot que hace `getDoc` (en F28: `useNote(noteId, version)`). Bump del counter al click "Descartar" → cambio de key → unmount + mount del child → hook re-fetcha desde Firestore con `getDoc()` fresco → editor recibe `initialContent` server-side actualizado. Más limpio que rollback manual con `editor.commands.setContent` (que requiere mantener snapshot pre-edit + tocar API de TipTap). Aplicable a cualquier flow de "abandonar cambios locales" (formularios, drafts, edits con preview).

## Campos CF-write-only con persister F12 quedan FUERA del schema TinyBase (post-F23)

Si una Cloud Function escribe directo a Firestore Y ese campo está en el schema TinyBase con `default` sentinel (`''`/`0`/`false`), durante la ventana entre primera hidratación cliente y primer onSnapshot real el persister puede emitir `setDoc(merge:true)` con el row entero (incluyendo el sentinel) y sobrescribir el valor que la CF acaba de escribir. Mitigación canónica: NO incluir esos campos en el schema TinyBase; el hook UI los lee via `onSnapshot` directo dentro de `useEffect` con cleanup automático en remount `key={X}`. Aplicable a cualquier futuro campo poblado server-side (sugerencias AI, embeddings flags, AI history, audit logs, etc.). Patrón vivo en [src/hooks/useNoteSuggestions.ts](../../src/hooks/useNoteSuggestions.ts) (`suggestedNoteType`, `noteTypeConfidence`, `dismissedSuggestions` solo en Firestore).

## Per-entity hook sobre aggregator: cache `(entityType, id)` preservando ref + `matchesId` para composite keys (post-F42.1)

Cuando se necesita una vista per-item (`useFooForEntity(type, id)`) sobre el mismo set de sources que un aggregator existente (`useFooCount`), el patrón canónico extiende el de F29: `globalVersion` + `bumpVersion` module-level subscritos a TODAS las queues relevantes (Set dedup), `subscribe(cb)` fan-out a todas (no solo a las del entity — composite keys pueden vivir en cualquier queue), `getSnapshot(type, id)` cacheado en `Map<key, { version, status }>` con **preservación de ref cuando los valores no cambiaron** (sino React hace re-render espurio en cada notify ajeno: queue de tasks bumpea version → snapshot per-note recomputa → `Object.is` falla por nuevo objeto → re-render). Helper `matchesId(queueKey, id)` cubre composite keys (`${noteId}:accept-${suggestionId}` en `saveNotesMetaQueue`, F30 D-bypass) con `key === id || key.startsWith('${id}:')`. La cache se mantiene per-hook-module — no compartida con el aggregator porque las shapes de salida son distintas. Sentinel `SYNCED_STATUS = { isPending: false, hasError: false }` const module-level para que items sin pendientes devuelvan SIEMPRE la misma ref (Object.is gratis sin cache hit). Trade-off aceptado: cada queue tiene 2× listeners (uno bumpVersion del aggregator, uno del per-entity hook) — overhead trivial frente a la simpleza del módulo independiente. Aplicable a futuros agregadores que necesiten vista per-item (ej. backlinks por nota, pending tasks por proyecto). Patrón vivo en [src/hooks/usePendingSyncForEntity.ts](../../src/hooks/usePendingSyncForEntity.ts).

## Schema versioning local de cache (post-F36.F8 — v0.2.4+)

Bumpear `TINYBASE_SCHEMA_VERSION` en [src/lib/tinybase.ts](../../src/lib/tinybase.ts) cuando cambia el shape de una Row en cualquier `src/stores/*.ts` (agregar/eliminar/renombrar cell, cambiar el `default`). Bumpear `PREFERENCES_SCHEMA_VERSION` en [src/lib/preferences.ts](../../src/lib/preferences.ts) cuando cambia el type `UserPreferences` en [src/types/preferences.ts](../../src/types/preferences.ts). Versionado independiente entre capas (F36 D3) — un bump en una NO fuerza purga de la otra. **Trade-off purge-on-mismatch (F36 D2):** TinyBase rehidrata desde Firestore (zero data loss; Firestore es source of truth); preferences vuelve a defaults hasta el primer write post-bump (UX visible — DistillIntro/banners reaparecen, sidebarHidden vuelve a default). **F8 NO migra datos:** TinyBase v8 al setRow silently quita valores no-en-schema → para changes de tipo de cell (no solo agregar nuevos), escribir job de migración (Cloud Function o script client-side) ANTES del bump del schema version. **Treatment asimétrico de "ausente" (D-F8.1):** TinyBase localStorage `null`/missing → mismatch (purge); preferences `_schemaVersion` ausente → compat con V1 (cohorte legacy pre-F8 sobrevive sin reset). Justificación del asimetría: TinyBase resyncea sin pérdida; preferences es la fuente de verdad — purgar = pérdida real. Migration call-site: [src/main.tsx](../../src/main.tsx) ANTES de `createRoot()` (D-F8.2) — garantiza correr antes de cualquier `startAutoLoad`. `_schemaVersion` en preferences se inyecta en cada `setPreferences`/`markDistillBannerSeen` como marker del cliente que persistió, no del shape persistido (D-F8.4 — race multi-window aceptada). Detalle completo en [SPEC F36 sección F8](../features/SPEC-feature-36-cache-stale-update-flow.md).
