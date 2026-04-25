# SPEC — F19: Papelera de notas con auto-purga configurable

> Alcance: papelera completa para notas — vista dedicada con restore, hard delete individual y masivo, auto-purga programada por preferencia del usuario, y cierre de las 2 brechas de lectura que F18 dejó abiertas.
> Dependencias: F18 cerrada (`deletedAt: number | null` en producción, `notesRepo.softDelete/restore` ya implementados).
> Estimado: 1 sesión de trabajo (8 sub-features chicas, ninguna riesgosa).
> Stack relevante: Firestore (nueva colección `users/{uid}/settings/`), Cloud Functions v2 (nueva CF `onDocumentDeleted` + nueva CF `onSchedule`), shadcn `confirm-dialog` (reusada de F18 con copy reforzado para hard delete).

---

## Objetivo

Cuando el usuario "elimina" una nota desde la lista, hoy queda en estado oculto sin forma de recuperarla ni de purgarla definitivamente desde la UI; embeddings y links quedan huérfanos en Firestore para siempre. Al terminar F19, la nota viaja a una papelera visible (segmento "Papelera" dentro de `/notes`) donde puede restaurarse o borrarse para siempre, con limpieza automática a X días configurables (Nunca / 7 / 15 / 30) y cleanup completo de embeddings + links bidireccionales. Además, una nota eliminada deja de aparecer en el grafo y deja de ser accesible vía URL directa `/notes/{id}`.

---

## Features

### F1: Schema de preferencias + selector de auto-purga en Settings

**Qué:** crea la primera colección de preferencias del usuario en Firestore (no existía hasta ahora — solo localStorage para theme). Doc único `users/{uid}/settings/preferences` con campo `trashAutoPurgeDays: 0 | 7 | 15 | 30` (default `30`, sentinel `0` = "Nunca"). Hook `usePreferences()` que carga reactivo via `onSnapshot` y expone setter atómico. UI en `/settings` como `<TrashAutoPurgeSelector>` siguiendo el patrón visual de `ThemeSelector` (4 cards horizontales con label + descripción corta).

**Criterio de done:**

- [ ] Doc `users/{uid}/settings/preferences` se crea on-demand al primer set; no falla si no existe (default `30` aplicado client-side).
- [ ] Cambiar la opción en `/settings` persiste en Firestore en <500ms y refleja en el badge de la papelera al instante (otra pestaña incluida).
- [ ] El Selector tiene 4 cards: `Nunca` / `7 días` / `15 días` / `30 días`, con la activa marcada con anillo `ring-2 ring-primary/30` (mismo patrón que ThemeSelector).
- [ ] Security rules: solo el dueño lee/escribe `users/{uid}/settings/{docId}`.

**Archivos a crear/modificar:**

- `src/types/preferences.ts` — interface `UserPreferences { trashAutoPurgeDays: 0 | 7 | 15 | 30 }`.
- `src/lib/preferences.ts` — `loadPreferences(uid)`, `setPreferences(uid, partial)` (helpers minimal con `getDoc`/`setDoc merge:true`).
- `src/hooks/usePreferences.ts` — hook reactivo con `onSnapshot`, default `{ trashAutoPurgeDays: 30 }` mientras carga.
- `src/components/settings/TrashAutoPurgeSelector.tsx` — UI 4-cards.
- `src/app/settings/page.tsx` — agregar nueva `<section aria-labelledby="trash-heading">` debajo de Apariencia.
- `firestore.rules` — agregar match `users/{userId}/settings/{docId}` con `request.auth.uid == userId`.

**Notas de implementación:**

- NO crear todavía `src/stores/preferencesStore.ts` ni meterlo en `useStoreInit`. Es un solo doc con un solo campo — un store TinyBase es over-engineering. Hook directo con `onSnapshot` es suficiente. Si en el futuro se acumulan más prefs, ahí se migra a store.
- El default `30` (el más conservador) es runtime-only: NO escribir el doc al login si no existe. Solo se escribe la primera vez que el usuario cambia la opción.

---

### F2: Hard delete y purge masivo en notesRepo

**Qué:** agregar `notesRepo.hardDelete(id)` (deleteDoc Firestore + delRow TinyBase) y `notesRepo.purgeAll(ids: string[])` (batch deleteDoc para vaciar papelera de una). El cleanup de embeddings y links NO va acá — lo hace la CF F3 disparada por el `onDocumentDeleted`. Tests Vitest cubren orden sync→async, batch correcto, auth guard.

**Criterio de done:**

- [ ] `await notesRepo.hardDelete(id)` borra el doc de Firestore y la row de TinyBase. La CF F3 se dispara automáticamente y limpia embeddings/links (verificable en deploy).
- [ ] `await notesRepo.purgeAll(ids)` ejecuta los deletes en paralelo (`Promise.allSettled`) para que un fallo no aborte el resto. Logguea rejects.
- [ ] Tests Vitest:
  - `hardDelete` llama `deleteDoc` + `delRow` en orden correcto.
  - `purgeAll` con array vacío es no-op (no llama Firestore).
  - `purgeAll` con 3 ids llama 3 `deleteDoc` y `delRow` x3.
  - Sin `auth.currentUser`, ambos throwean (consistente con `saveContent`).

**Archivos a crear/modificar:**

- `src/infra/repos/notesRepo.ts` — agregar `hardDelete`, `purgeAll`, exportarlos en el objeto `notesRepo`.
- `src/infra/repos/notesRepo.test.ts` — agregar suites para los 2 métodos nuevos.

**Notas de implementación:**

- `deleteDoc` directo (sin pasar por el factory `createFirestoreRepo`) porque el factory hoy no expone delete. Sigue el patrón documentado en ESTADO-ACTUAL "Limitación TinyBase v8 post-F12: changes NO incluye row IDs eliminados" — los repos hacen `deleteDoc` directo justamente porque el persister diff-based no propaga deletes.
- `delRow` después de `deleteDoc` (no antes): el `onSnapshot` del persister va a recibir el delete remoto, pero el `delRow` local da feedback inmediato a la UI. Mismo principio que `softDelete` actual (sync TinyBase + async Firestore), invertido el orden porque acá el "estado final" es ausente.

---

### F3: CF onDocumentDeleted — cleanup de embeddings y links

**Qué:** nueva Cloud Function `onNoteDeleted` que escucha `users/{userId}/notes/{noteId}` con trigger `onDocumentDeleted`. Borra:

1. Doc `users/{userId}/embeddings/{noteId}` (si existe).
2. Todos los docs de `users/{userId}/links/` donde `sourceId == noteId` OR `targetId == noteId` (dos queries paralelas + batch delete).

Logging estructurado con `{ userId, noteId, embeddingDeleted, linksDeleted }`.

**Criterio de done:**

- [ ] Al borrar manualmente un doc de `users/{uid}/notes/X` desde Firebase Console, en <5s se borra `users/{uid}/embeddings/X` y los links donde X es source o target.
- [ ] Si no existe embedding ni links, la CF termina sin error (idempotente).
- [ ] Si la query de links devuelve >500 resultados, batch en chunks de 500 (límite Firestore).
- [ ] Logueado en Functions Logs con counts.

**Archivos a crear/modificar:**

- `src/functions/src/notes/onNoteDeleted.ts` — nueva CF.
- `src/functions/src/index.ts` — agregar `export { onNoteDeleted } from './notes/onNoteDeleted';`.

**Notas de implementación:**

- Trigger: `onDocumentDeleted({ document: 'users/{userId}/notes/{noteId}', region: 'us-central1', retry: false, timeoutSeconds: 60 })`.
- Las dos queries de links no se pueden combinar con `OR` en una sola query Firestore sin compound index — usar dos `Promise.all([querySource, queryTarget])` y mergear los doc IDs con `Set` antes del batch delete (evita borrar el mismo doc dos veces si existiera, aunque por el guard `targetId !== sourceId` de `syncLinks` no debería ocurrir).
- NO requiere secrets (no llama Anthropic/OpenAI), no necesita `defineSecret`.

---

### F4: CF onSchedule — auto-purga diaria por preferencia

**Qué:** nueva CF `autoPurgeTrash` con trigger `onSchedule('every day 03:00')` que:

1. Itera `db.collectionGroup('notes').where('deletedAt', '>', 0)` para encontrar todas las notas en papelera de todos los users.
2. Por cada nota, deriva el `userId` del path (`users/{uid}/notes/{noteId}`), lee `users/{uid}/settings/preferences.trashAutoPurgeDays` (cache por uid dentro del run).
3. Si `trashAutoPurgeDays === 0` → skip esa nota (Nunca).
4. Si `now - deletedAt >= trashAutoPurgeDays * 24h` → `deleteDoc` (lo que dispara F3 cleanup en cascada automáticamente).
5. Logging con `{ totalScanned, totalPurged, perUser: { uid: count } }`.

**Criterio de done:**

- [ ] La CF se despliega y aparece en GCP Cloud Scheduler (`firebase functions:list`).
- [ ] Test manual: setear una nota con `deletedAt = Date.now() - 31 * 24 * 60 * 60 * 1000` y `preferences.trashAutoPurgeDays = 30`, invocar la CF manualmente con `gcloud scheduler jobs run firebase-schedule-autoPurgeTrash-us-central1`. La nota desaparece, embeddings y links también (cascada F3).
- [ ] Si una nota cumple el plazo y la preference dice `0` (Nunca), NO se borra.
- [ ] Si una nota tiene `deletedAt = Date.now() - 60 días` y la preference cambia HOY a `30`, el siguiente run la purga (lógica retroactiva — clave para el caso del usuario).
- [ ] **Verificación de seguridad cross-user**: con dos cuentas distintas (`uidA` y `uidB`), desde el client SDK autenticado como `uidA`, intentar `getDocs(query(collectionGroup(db, 'notes'), where('deletedAt', '>', 0)))` debe devolver SOLO las notas de `uidA` (o fallar con permission-denied si toca cualquier doc de `uidB`). Verificable con Playwright + Firebase MCP.

**Archivos a crear/modificar:**

- `src/functions/src/notes/autoPurgeTrash.ts` — nueva CF.
- `src/functions/src/index.ts` — agregar `export { autoPurgeTrash } from './notes/autoPurgeTrash';`.

**Notas de implementación:**

- Import: `import { onSchedule } from 'firebase-functions/v2/scheduler'`. Primer uso del scheduler en el proyecto — habilitar API `cloudscheduler.googleapis.com` en GCP si no está (Firebase la habilita auto al desplegar la CF).
- Schedule: `'every day 03:00'` (formato App Engine cron, ver Firebase docs). Timezone default UTC; OK porque la operación no es time-sensitive para el usuario.
- Cache de preferences por `uid` dentro del run (Map): evita leer N veces el mismo doc cuando un user tiene muchas notas en papelera.
- Iteración por `collectionGroup('notes')` requiere index single-field en `deletedAt` con scope **collection group** (Firestore lo crea auto al primer query, o pre-declarar en `firestore.indexes.json`). Pre-declarar para deploy reproducible.
- **Riesgo de seguridad del index collection group**: pre-declarar el index habilita `collectionGroup('notes')` queries también desde el client SDK (no solo desde admin SDK). Las security rules existentes `match /users/{userId}/notes/{noteId} { allow read: if request.auth.uid == userId }` SÍ aplican por doc-path en collection group queries — Firestore evalúa la rule por cada doc tocado y rechaza la query completa si toca algún doc no permitido. **Por lo tanto un cliente autenticado como `uidA` que ejecute `collectionGroup('notes')` solo verá sus propias notas; un client unauthenticated falla con permission-denied.** No requiere rules nuevas, pero el comportamiento debe verificarse explícitamente (ver criterio de done) y NO añadir `allow read: if true` a `notes/{noteId}` "para optimizar" — quebraría el aislamiento.
- Limit de runtime de scheduled functions: 540s default; alcanza para miles de notas. Si llegamos a millones (irrelevante esta fase), batchear con paginación.

---

### F5: Segmento de 3 en `/notes` (Todas / Favoritas / Papelera)

**Qué:** refactor del toggle binario "Solo favoritas" a un segmented control de 3 estados mutuamente excluyentes. Cuando se selecciona "Papelera":

- La lista filtra por `deletedAt > 0` desde TinyBase directo (NO usa `useHybridSearch` que excluye eliminadas — usa nuevo hook F8).
- Header muestra contador "N notas en papelera" + "Se eliminan automáticamente en X días" (X derivado de preferences) o "Las notas no se eliminan automáticamente" si `trashAutoPurgeDays === 0`. Link a `/settings#trash` (anchor scroll).
- Botón secundario "Vaciar papelera" alineado a la derecha del segmento, con `ConfirmDialog destructive` que dice exactamente cuántas notas va a borrar.
- El input de search se oculta cuando estás en "Papelera" (no hay search semantic en eliminadas — out of scope).
- Si el filtro está en "Favoritas" o "Papelera" y el usuario empieza a tipear en search (que solo aparece en "Todas"), no aplica — el search está oculto.
- Empty state en "Papelera" sin notas: "Tu papelera está vacía." con `Trash2` icon.

**Criterio de done:**

- [ ] Segmented control de 3 botones reemplaza el chip binario actual. Estado compartido `filter: 'all' | 'favorites' | 'trash'` (el `useState` actual de `favoritesOnly` se reemplaza).
- [ ] En "Papelera", `NoteCard` renderiza acciones distintas (delegado a F6).
- [ ] El contador y el aviso de auto-purga se actualizan en vivo cuando cambia preferences en otra pestaña.
- [ ] "Vaciar papelera" con N=0 está disabled.
- [ ] El link a `/settings#trash` lleva a settings y scrollea a la sección.
- [ ] Empty state diferenciado en `trash` vs `favorites` vs `all` (extiende patrón de F18).

**Archivos a crear/modificar:**

- `src/app/notes/page.tsx` — refactor: `useState<'all' | 'favorites' | 'trash'>`, segmented control, header dinámico, "Vaciar papelera", oculta search en `trash`.
- `src/components/settings/TrashAutoPurgeSelector.tsx` — el wrapper `<section>` necesita `id="trash"` para que el anchor `/settings#trash` funcione (scroll-margin-top con `scroll-mt-20`).

**Notas de implementación:**

- El segmented control vive en el mismo lugar visual que el chip actual (a la derecha del search). Patrón shadcn `Tabs` o tres `<button>` agrupados con `border-r` entre ellos. Por consistencia con resto del proyecto y simplicidad, **tres `<button>` agrupados** sin importar shadcn `Tabs` (que requiere `Tabs.Root/List/Trigger/Content` para algo que es solo filtro de estado, no contenido tabbed).
- El handler "Vaciar papelera" llama `notesRepo.purgeAll(trashedIds)`.
- Anchor scroll: `<section id="trash" className="scroll-mt-20">` en settings (compensa altura del MobileHeader sticky).

---

### F6: NoteCard con prop `mode` (acciones distintas en modo trash)

**Qué:** agregar prop `mode?: 'normal' | 'trash'` (default `'normal'`) al `NoteCard`. En **modo normal** la card queda IDÉNTICA a F18 — estrella + botón `Trash2` que abre `ConfirmDialog` y llama `softDelete`. En **modo trash** el cluster muta a 2 botones inline siempre visibles (sin hover-reveal): "Restaurar" (icono `Undo2`) y "Eliminar para siempre" (icono `Trash2` destructive). El botón de favoritas se oculta en modo trash (no tiene sentido marcar favorita una nota eliminada).

**Decisión clave:** el hard delete NO se ofrece desde modo normal. Esa entrada al destructivo solo existe dentro de la papelera, donde el contexto del usuario ya es "estoy revisando notas eliminadas para limpiar". Bypassear la papelera con un click accidental en un dropdown anularía el propósito del feature. Esto también evita introducir Base UI Menu en esta fase — F6 es una extensión limpia del NoteCard de F18, no un refactor.

**Criterio de done:**

- [ ] En modo normal: la card es visualmente idéntica a la de F18 (estrella amber filled cuando favorita + botón `Trash2` hover-revealed con breakpoint `md:`). Comportamiento de delete = `softDelete` con `ConfirmDialog` actual.
- [ ] En modo trash: 2 botones inline visibles siempre (sin hover-reveal, también en desktop — el contexto justifica visibilidad permanente). Estrella oculta.
- [ ] "Restaurar" llama `notesRepo.restore(id)` sin confirmación (acción no-destructiva, recuperable). La nota desaparece de la vista trash al instante (filtro `deletedAt > 0` deja de matchear).
- [ ] "Eliminar para siempre" abre `ConfirmDialog destructive` con copy reforzado: título "¿Eliminar esta nota para siempre?", description "Esta acción no se puede deshacer. La nota, sus embeddings y los links que la mencionan se eliminan para siempre.", confirmLabel "Eliminar para siempre". Llama `notesRepo.hardDelete(id)`.
- [ ] E2E: en mobile (375px), los 2 botones de modo trash son tappeables (≥44×44 con padding del wrapper).

**Archivos a crear/modificar:**

- `src/components/editor/NoteCard.tsx` — agregar prop `mode`, branchear el cluster JSX según `mode === 'trash'`, segundo `ConfirmDialog` para el hard delete con copy reforzado.
- `src/app/notes/page.tsx` — pasar `mode="trash"` al `<NoteCard>` cuando `filter === 'trash'`.

**Notas de implementación:**

- 2 estados `useState` distintos para los 2 dialogs (`isSoftDeleteOpen`, `isHardDeleteOpen`) o uno solo con discriminator — preferir 2 estados separados, más legible y los dialogs nunca coexisten.
- Restaurar sin confirm: el flujo natural es "ups, eliminé esto sin querer, lo restauro". Pedir confirm para una acción que el usuario ya viene a buscar a la papelera es fricción innecesaria.
- Confirmación reforzada de hard delete: NO pedir escribir el título (fricción excesiva — muchas notas tienen títulos vacíos o casi idénticos). El segundo dialog + el copy explícito alcanza. Si en uso real aparecen deletes accidentales, F20 puede agregar typing-to-confirm.
- "Vaciar papelera" en F5 reusa el mismo copy reforzado y el mismo `notesRepo.purgeAll`.

---

### F7: Cierre de las 2 brechas de lectura (grafo + acceso directo)

**Qué:** filtrar notas eliminadas en los 2 lugares que F18 dejó abiertos:

1. `useGraph.ts` — agregar guard `if (row.deletedAt > 0) continue;` en el loop de notas.
2. `useNote.ts` — post-`getDoc`, si `data.deletedAt > 0` setear `notFound: true` (la página `/notes/{id}` ya redirige a `/notes` cuando `notFound`).

**Criterio de done:**

- [ ] En el grafo, una nota recién eliminada deja de aparecer como nodo (test: eliminar nota → ir a `/notes/graph` → confirmar nodo ausente).
- [ ] Acceder a `/notes/{id}` de una nota eliminada redirige a `/notes` (mismo flujo que nota inexistente).
- [ ] Restaurar la nota desde la papelera la devuelve al grafo y al editor directo.

**Archivos a crear/modificar:**

- `src/hooks/useGraph.ts` — 1 línea de guard en el loop.
- `src/hooks/useNote.ts` — bloque condicional pre-`setState` post-getDoc.

**Notas de implementación:**

- En `useNote`, NO loggear como error si `deletedAt > 0` — es un caso esperado (nota en papelera). El `notFound: true` ya maneja la UX.
- Verificar que no haya OTROS lugares que lean del store de notas sin filtrar — grep `useTable\('notes'\)|notesStore\.getRow\('notes'/` para confirmar inventario completo. Cualquier nuevo caller de F19 en adelante debe filtrar `deletedAt > 0`.

---

### F8: Hook `useTrashNotes`

**Qué:** hook de lectura reactiva que devuelve la lista de notas con `deletedAt > 0`, ordenadas por `deletedAt desc` (más recientemente eliminadas primero), y calcula días restantes hasta la auto-purga para cada una basado en `usePreferences()`.

**Criterio de done:**

- [ ] `useTrashNotes()` retorna `{ notes: TrashNote[], isLoading: boolean }` donde `TrashNote` extiende `NoteOramaDoc` con `daysUntilPurge: number | null` (null si `trashAutoPurgeDays === 0`).
- [ ] Reactivo: cuando una nota se mueve a papelera, aparece en la lista al instante.
- [ ] Cuando se restaura, desaparece al instante.
- [ ] Cuando preferences cambia, los `daysUntilPurge` se recalculan.
- [ ] El total se expone también: `{ count: number }` para el header.

**Archivos a crear/modificar:**

- `src/hooks/useTrashNotes.ts` — nuevo hook.
- `src/types/note.ts` — agregar `TrashNote` interface.

**Notas de implementación:**

- Lectura desde `useTable('notes')` directo, NO desde Orama (Orama excluye eliminadas en el rebuild de F18). Mapear las rows con `deletedAt > 0` a la shape `TrashNote`.
- `daysUntilPurge = max(0, floor(trashAutoPurgeDays - (now - deletedAt) / 86400000))`. Si negativo (ya pasó el plazo pero el cron diario aún no corrió), mostrar "Pendiente de purga".
- Sort estable con `[...filtered].sort((a, b) => b.deletedAt - a.deletedAt)`.

---

## Orden de implementación

1. **F1 (preferences + Settings UI)** → base que F4, F5, F8 consumen. Sin esto, no hay lectura de `trashAutoPurgeDays`.
2. **F2 (repo: hardDelete + purgeAll)** + **F8 (hook useTrashNotes)** → paralelos, ambos prerrequisito para F5/F6. F8 no necesita F2.
3. **F7 (cerrar brechas grafo + editor)** → independiente de todo lo demás. Se puede hacer en cualquier momento; conviene primero porque es 2 líneas y elimina riesgo de regresión.
4. **F3 (CF onDocumentDeleted)** → depende de F2 (los hard deletes la disparan). Se puede deployar antes que la UI exista — es defensivo.
5. **F4 (CF scheduled)** → depende de F1 (lee preferences) + F3 (los deletes que dispara cascadean al cleanup). Sin F1, no puede leer la pref; sin F3, los embeddings/links quedan huérfanos.
6. **F6 (NoteCard prop `mode` con acciones de trash)** → depende de F2 (hardDelete) y coordina con F5 que setea la prop. Modo normal queda visualmente idéntico a F18; el cambio es aditivo.
7. **F5 (segmento Todas/Favoritas/Papelera)** → último: integra F2, F6, F8, y `usePreferences` de F1.

---

## Estructura de archivos

```text
src/
├── types/
│   └── preferences.ts                     # NEW: UserPreferences interface
├── lib/
│   └── preferences.ts                     # NEW: load/set helpers
├── hooks/
│   ├── usePreferences.ts                  # NEW: reactivo onSnapshot
│   ├── useTrashNotes.ts                   # NEW: lista trash + daysUntilPurge
│   ├── useGraph.ts                        # MOD: filtrar deletedAt > 0
│   └── useNote.ts                         # MOD: notFound si deletedAt > 0
├── components/
│   ├── settings/
│   │   └── TrashAutoPurgeSelector.tsx     # NEW: 4 cards Selector
│   └── editor/
│       └── NoteCard.tsx                   # MOD: prop mode + 2 botones inline en trash
├── infra/repos/
│   ├── notesRepo.ts                       # MOD: + hardDelete, + purgeAll
│   └── notesRepo.test.ts                  # MOD: + suites
├── app/
│   ├── notes/
│   │   └── page.tsx                       # MOD: segmento 3-estados, vaciar
│   └── settings/
│       └── page.tsx                       # MOD: + section trash
├── functions/src/
│   └── notes/
│       ├── onNoteDeleted.ts               # NEW: CF cleanup embeddings+links
│       └── autoPurgeTrash.ts              # NEW: CF scheduled diaria
└── functions/src/index.ts                 # MOD: + 2 exports CFs

firestore.rules                            # MOD: + match settings/{docId}
firestore.indexes.json                     # MOD: + index deletedAt collection group
```

---

## Definiciones técnicas

### Preferences storage: doc único vs collection

- **Opciones consideradas:** A) doc único `users/{uid}/settings/preferences` con campos planos. B) collection `users/{uid}/settings/` con multi-doc (por ej. uno por dominio). C) tabla TinyBase `userSettings` con un solo row.
- **Decisión:** A.
- **Razón:** una sola pref por ahora (`trashAutoPurgeDays`); una collection con un único doc por categoría es over-engineering. Una tabla TinyBase agregaría infra de persister/cleanup en `useStoreInit` para 1 campo. Si el día de mañana se acumulan más prefs (notif preferences, default note type, etc.), el doc único escala bien hasta ~20 campos antes de justificar split.

### Schedule de la CF de auto-purga

- **Opciones consideradas:** A) cada 1h. B) cada 6h. C) cada 24h a las 3 AM UTC.
- **Decisión:** C.
- **Razón:** la auto-purga no es time-sensitive para el usuario (la diferencia entre 30 días y 30 días + 12 h es irrelevante). 1× al día minimiza costo de invocaciones. 3 AM UTC = 12 AM ART (offpeak). Si más adelante hace falta más granularidad, bumpear a 6h es trivial.

### Hard delete: solo desde la papelera, no desde modo normal

- **Opciones consideradas:** A) ofrecer "Eliminar para siempre" en modo normal junto a "Mover a papelera" (vía dropdown). B) hard delete solo accesible desde modo trash; modo normal sigue ofreciendo solo soft delete (idéntico a F18).
- **Decisión:** B.
- **Razón:** la papelera existe precisamente para ser el safety net del soft delete. Ofrecer hard delete desde modo normal anula ese propósito y multiplica el riesgo de pérdida accidental — un click en el item equivocado de un dropdown borra la nota + embeddings + links sin pasar por la red de seguridad. El flujo correcto es soft delete → revisar en papelera → restaurar o purgar definitivo desde el contexto explícito de "estoy limpiando lo eliminado". Bonus: F6 deja de necesitar Base UI Menu en esta fase — modo normal queda visualmente idéntico a F18, el cambio es puramente aditivo (prop `mode` con branch en JSX), reduciendo riesgo de regresión visual.

### Cleanup de wikilinks dentro del contenido de OTRAS notas

- **Opciones consideradas:** A) F3 también busca el contenido TipTap de otras notas y reemplaza wikilinks rotos por texto plano. B) dejar wikilinks rotos como están (apuntan a noteId inexistente).
- **Decisión:** B.
- **Razón:** comportamiento esperado de cualquier wiki-style system (Obsidian, Roam, Logseq). Reescribir contenido de notas ajenas sin acción explícita del usuario es invasivo y potencialmente destructivo (modificación silenciosa de notas). El user que abre una nota con wikilink roto verá un link sin destino y podrá limpiarlo manualmente. F19 limpia la **representación estructurada** del link (collection `links/`) que es lo que alimenta backlinks/grafo, no el markdown del cuerpo.

---

## Checklist de completado

Al cerrar F19, TODAS estas condiciones deben ser verdaderas:

- [ ] `npm run build` y `npm run lint` pasan sin warnings nuevos.
- [ ] `npm test` pasa (incluyendo suites nuevas de `notesRepo`).
- [ ] `npm run deploy:functions` despliega `onNoteDeleted` + `autoPurgeTrash` sin errors.
- [ ] `npm run deploy:rules` despliega la nueva rule de `settings/`.
- [ ] CF scheduled aparece en `firebase functions:list` con cron `every day 03:00`.
- [ ] E2E con Playwright (golden path):
  - Login → crear 3 notas → eliminar 2 → ir a "Papelera" → ver 2 notas con badge de días restantes.
  - Restaurar 1 → vuelve a "Todas" → grafo la muestra de nuevo.
  - "Eliminar definitivamente" 1 → confirm dialog reforzado → desaparece → embeddings/links borrados (verificable con Firebase MCP).
  - "Vaciar papelera" → confirm → todas las notas en papelera se borran.
  - Ir a `/settings`, cambiar auto-purga a 7 días → header de Papelera refleja "se eliminan en N días" con N nuevo.
  - Acceder a `/notes/{id}` de nota eliminada → redirige a `/notes`.
- [ ] E2E mobile 375px: en modo trash los 2 botones inline (Restaurar / Eliminar para siempre) son tappeables (≥44×44); segmented control no desborda; copy del header de papelera no rompe layout.
- [ ] Test manual de F4 (auto-purga): setear 1 nota con `deletedAt = now - 31 días` y `trashAutoPurgeDays = 30`, invocar la CF manualmente con `gcloud scheduler jobs run firebase-schedule-autoPurgeTrash-us-central1`. Verificar que la nota + embedding + links desaparecen.
- [ ] No hay `console.log`/`console.error` huérfanos en el código nuevo.
- [ ] CLAUDE.md no necesita update (gotchas universales no se agregaron). ESTADO-ACTUAL.md se actualiza al cerrar feature siguiendo step 8 SDD.

---

## Siguiente fase

F19 deja en producción la primera infra de "preferencias del usuario" (`users/{uid}/settings/preferences`) que abre F20 (preferencias adicionales: default note type al crear, notif preferences, export/backup), y la primera CF scheduled del proyecto que abre F21 (jobs periódicos: re-embedding mensual de notas viejas, weekly digest, FSRS due notifications). El patrón de hard delete + cleanup CF onDelete es replicable para `tasks`, `projects`, `objectives` cuando aparezca demanda.
