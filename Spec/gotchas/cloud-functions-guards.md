# Cloud Functions — Guards y edge cases

> Canon de gotchas del dominio. Índice ligero en `../ESTADO-ACTUAL.md` § "Gotchas por dominio (índice)".
> Cada gotcha vive como `## <título>`. El slug del título es el anchor estable referenciado desde el índice.
> Origen: sub-sección "Guards y edge cases" del corpus monolítico (D-Plan-1 split de Cloud Functions en 2 archivos).

## `aiProcessed` guard en `autoTagNote`

`if (after.aiProcessed) return` — evita re-procesamiento. Early return sin log (frecuente).

## `onDocumentWritten` en vez de `onDocumentCreated` para notas

Notas desde `/notes` se crean con `contentPlain: ''` y el texto llega en el auto-save (2s después). `onDocumentWritten` detecta el primer write con contenido.

## `convertToNote` setea `aiProcessed: true` cuando hay tags del inbox

Sin esto, `autoTagNote` sobrescribiría tags aceptados. Condición: `aiProcessed: !!(overrides?.tags?.length > 0)`. **Trade-off escalado en F21**: estas notas nacen con `aiSummary: ''` y `autoTagNote` no las re-procesa, así que **nunca tendrán `aiSummary` visible** en `NoteCard` (donde el render del summary se introdujo en F21). Costo de aceptar tags AI manualmente; si en el futuro se quiere generar `aiSummary` aún con tags pre-aceptados, separar el flag en `aiTagsProcessed` + `aiSummaryProcessed`.

## Secret management

`defineSecret('ANTHROPIC_API_KEY')` / `defineSecret('OPENAI_API_KEY')` + `secrets: [...]` en el trigger. `.value()` dentro del handler, no top-level.

## `contentHash` guard en `generateEmbedding`

Compara SHA-256 del `contentPlain` actual con el hash almacenado. A diferencia de `autoTagNote`, embeddings deben regenerarse cuando el contenido cambia.

## Runtime Node.js 22 en functions

Migrado de Node 20 a 22 (`firebase.json.runtime: nodejs22`). `package.json.engines.node: 22` y `@types/node: ^22` coinciden.

## `firebase-functions` v7 obligatorio

v6 fallaba con timeout en el discovery protocol de la CLI.

## `.gitignore` de functions: `/lib/` con anchor

Sin anchor, matchea `src/lib/` (sources) además de `lib/` (compiled).

## `autoTagNote` y `generateEmbedding` se disparan en CADA write a una nota (post-F18)

Incluyendo toggles de flags planos (`isFavorite`, `deletedAt`). Aceptable hoy porque `aiProcessed` y el `contentHash` SHA-256 actúan como guards de reprocesamiento real (la CF arranca pero retorna early sin llamar al modelo). Si en el futuro se agregan más flags toggleables o el body de la nota cambia con frecuencia, considerar guard explícito de "no reprocesar si solo cambió metadata flat" comparando hashes pre/post o flagging la transacción.

## `aiSummary` queda stale tras edición de la nota (post-F21)

`autoTagNote` solo corre si `aiProcessed === false` (early return en [src/functions/src/notes/autoTagNote.ts](../../src/functions/src/notes/autoTagNote.ts)). Una vez que la CF generó tags + summary y marcó `aiProcessed: true`, ediciones posteriores del contenido NO disparan re-síntesis del summary. En F21 `aiSummary` se volvió user-facing como segunda línea de `NoteCard`; el desfase entre snippet (live) y summary (frozen al primer procesamiento) ya es visible al usuario. Trade-off aceptado por costo de tokens y ruido visual si se regenera en cada keystroke. Si se vuelve molesto en uso real, la mitigación canónica es: comparar `contentHash` SHA-256 actual vs hash al momento del summary y regenerar solo si difiere significativamente. Mismo patrón que `generateEmbedding` ya usa para decidir si re-embedear.

## CFs `onDocumentWritten` son no-op-safe ante delete si chequean `if (!event.data?.after?.data()) return` al inicio (post-F19)

Cuando se borra una nota, `autoTagNote` y `generateEmbedding` se disparan junto con `onNoteDeleted` (F3) en la misma transacción Firestore — los primeros salen sin hacer nada porque `after` es `undefined`. Cualquier futura CF `onDocumentWritten` sobre una colección con deletes debe incluir este guard como primera línea del handler. Sin él, la CF intenta leer campos de un doc inexistente y falla con throw.

## `retry: false` es decisión consciente en CFs trigger-based con LLM calls

`processInboxItem`, `autoTagNote`, `generateEmbedding`. Activar retry duplicaría invocaciones en transient failures (timeout Anthropic/OpenAI, throttling eventarc) sin idempotency wrapper → double-cost de tokens + posibles duplicados de tags/embeddings. Recovery path manual: editar cualquier campo de la nota re-dispara `onDocumentWritten`. Validado Apr 2026 con `functions_get_logs` MCP: 0 fallos severity≥WARNING en 90 días — el riesgo de "nota sin tags por crash transitorio" es sub-percentil y la consecuencia es soft (tags faltantes, no data loss). Si se necesita retry automático en el futuro, agregar idempotency key (hash del contenido + run-id) + dedup en handler antes de flippear.

## Cleanup en cascada de deletes via CF `onDocumentDeleted` + WriteBatch chunked (post-F19)

Para limpiar datos relacionados al borrar el principal (embeddings, links bidireccionales, sub-collections), trigger `onDocumentDeleted({ document: 'users/{userId}/X/{id}', region: 'us-central1', timeoutSeconds: 60, retry: false })` (`firebase-functions/v2/firestore`). Las queries OR no se pueden combinar nativas en Firestore — ejecutar `Promise.all([querySource, queryTarget])` y mergear IDs en `Set` para idempotencia. Borrar con `WriteBatch` chunked de 500 (límite Firestore por batch). Logging estructurado `{ userId, entityId, deleted: count }`. Patrón vivo en [src/functions/src/notes/onNoteDeleted.ts](../../src/functions/src/notes/onNoteDeleted.ts); replicable para `tasks`/`projects`/`objectives` cuando aparezca demanda de hard delete.

## CFs scheduled con `onSchedule` v2 (post-F19, primer uso)

Import: `firebase-functions/v2/scheduler`. Schedule cron tradicional `'0 3 * * *'` con `timeZone: 'UTC'` explícito (más portable que sintaxis App Engine `'every day 03:00'`). Memory `256MiB` default, timeout `540s` máx, `retryCount: 0` (idempotente: el próximo run reintenta lo que falló). Habilita la API `cloudscheduler.googleapis.com` automáticamente al desplegar. Verificación post-deploy: `firebase functions:list` muestra trigger `scheduled` (sino el cron no se registró). Vivo en [src/functions/src/notes/autoPurgeTrash.ts](../../src/functions/src/notes/autoPurgeTrash.ts).

## Firestore `firestore.rules` catch-all `match /users/{userId}/{document=**}`

Cubre cualquier sub-colección nueva sin cambios en rules (post-F19, confirmado al agregar `users/{uid}/settings/preferences`). El catch-all funciona también para queries `collectionGroup` desde el client SDK — Firestore enforce la rule por doc-path; un cliente autenticado como uidA solo puede leer sus propias notas en una collection group query. Cualquier PR futuro que toque `firestore.rules` debe re-correr test cross-user (auth como uidA + intentar leer `users/uidB/...` → permission-denied) antes de mergear. Vivo en [firestore.rules](../../firestore.rules).

## Firestore RECHAZA single-field indexes en `firestore.indexes.json` (post-F19)

Con `"this index is not necessary, configure using single field index controls"`. Los single-field indexes están auto-habilitados en COLLECTION + COLLECTION_GROUP scope por default. Solo se declaran composite indexes (multi-field) en JSON. La query `collectionGroup('notes').where('deletedAt', '>', 0)` funciona con el implícito sin declaración. Si se necesita un single-field exemption (ej. desactivar índice para campos grandes), usar `fieldOverrides` con `indexes: []`. La entry `"indexes": "firestore.indexes.json"` en `firebase.json` sigue siendo necesaria para que `firebase deploy --only firestore:indexes` encuentre el archivo (sino falla silencioso, no es opcional).

## Bulk delete masivo: chunkear de 50; sleep 200ms entre chunks SOLO en CFs scheduled (post-F19)

Cuando una operación dispara N deletes paralelos que cascadean a CFs (ej. F3 `onNoteDeleted` con embedding + link queries por cada nota), N>100 puede saturar quotas de Firestore o disparar cold starts masivos. Dos patrones según contexto: (a) **cliente browser** ([src/infra/repos/notesRepo.ts](../../src/infra/repos/notesRepo.ts) `purgeAll`) chunkea de 50 con `Promise.allSettled` SIN sleep — el round-trip al servidor ya espacia los writes lo suficiente; (b) **CF scheduled** ([src/functions/src/notes/autoPurgeTrash.ts](../../src/functions/src/notes/autoPurgeTrash.ts)) sí mete `await sleep(200ms)` entre chunks — sin viaje cliente-servidor, los chunks se ejecutan back-to-back y saturan quotas si no se espacian explícitamente. Aplicable a cualquier futuro bulk-delete (vaciar inbox, purgar tareas viejas).
