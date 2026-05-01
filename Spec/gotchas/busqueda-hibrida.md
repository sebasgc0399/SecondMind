# Búsqueda Híbrida

> Canon de gotchas del dominio. Índice ligero en `../ESTADO-ACTUAL.md` § "Gotchas por dominio (índice)".
> Cada gotcha vive como `## <título>`. El slug del título es el anchor estable referenciado desde el índice.

## Primera CF callable del proyecto usa `onCall` v2

`import { onCall, HttpsError } from 'firebase-functions/v2/https'`. Signature: `(request) => { request.auth?.uid; request.data }` — NO v1 (`context.auth`). Cliente via `getFunctions(app, 'us-central1') + httpsCallable`. Callable ref se crea una vez a nivel de módulo.

## Cache de embeddings module-level compartido

Entre `useSimilarNotes` y `useHybridSearch`. `getEmbeddingsCache(uid)` deduplica fetches concurrentes via `fetchPromise`; reusa si uid no cambió. `invalidateEmbeddingsCache()` se llama en `signOut` (antes de `firebaseSignOut`) para no filtrar entre cuentas.

## Threshold empírico con `text-embedding-3-small` + notas cortas en español: 0.30

Cosine satura en 0.15–0.45 para documentos cortos. `SimilarNotesPanel` usa 0.5 (compara notas completas); `useHybridSearch` usa 0.3 (queries más cortas). Recalibrar si el corpus cambia.

## Pipeline semántico en orden estricto, per-note dentro del loop

Excluir `isArchived` + excluir IDs ya en keyword results → sort score desc → slice(0, 5). Si se slicea antes de excluir, con 5 keyword matches `semanticResults` queda vacío aunque haya hits válidos.

## Race handling con snapshot del query, no `AbortController`

Firebase callable no expone abort. Patrón: `const frozenQuery = trimmed` al iniciar, `if (frozenQuery !== query.trim()) return` al volver del CF.

## Command Palette: Orama rebuild con debounce 100ms

Para agrupar los 3 store listeners iniciales.

## Orama sync: full rebuild en cada `addTableListener` es el patrón

<50ms para ~100 notas. Evita edge cases de sync incremental. Aceptable hasta ~1k filas.

## Full rebuild de índices < 50ms

Para ~100 entidades. Patrón `addTableListener` + rebuild completo, sin sync incremental.
