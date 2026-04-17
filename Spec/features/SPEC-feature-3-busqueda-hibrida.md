# SPEC — SecondMind · Feature 3: Búsqueda Híbrida (Registro de implementación)

> Estado: **Completada** — Abril 2026
> Alcance: Búsqueda semántica adicional en `/notes` via CF callable `embedQuery` + cosine similarity client-side sobre los embeddings ya existentes. Keyword search (Orama) sigue instant; los resultados semánticos aparecen debounced ~500ms después, en sección separada con badge visual.
> Stack implementado: Firebase Functions v2 (`onCall`), OpenAI `text-embedding-3-small`, `httpsCallable` cliente, cache module-level de embeddings, React hook con debounce + race-handling.
> Para gotchas operativos consolidados → `Spec/ESTADO-ACTUAL.md` sección "Búsqueda Híbrida (Feature 3)".

---

## Objetivo

El usuario busca en `/notes` y encuentra notas por significado, no solo por palabras exactas. La query "inteligencia artificial" surfacea notas sobre "Claude Mythos" o "Claude Code Security" aunque la frase exacta no aparezca en el texto. Keyword sigue instant para el caso dominante; semántico es aditivo (no rankea mixto, no bloquea).

---

## Prerequisitos descubiertos

- **Primera Cloud Function callable del proyecto.** Las 3 CFs previas (`processInboxItem`, `autoTagNote`, `generateEmbedding`) son event-driven (`onDocumentCreated` / `onDocumentWritten`). No había `onCall` ni infra cliente (`getFunctions` / `httpsCallable`) en uso. Esta feature tuvo que extender `src/lib/firebase.ts` con `getFunctions(app, 'us-central1')` para poder invocar la CF.
- **Sintaxis callable en Firebase Functions v2.** En v2 (estamos en `firebase-functions ^7.2.5`) el signature es `(request) => { request.auth?.uid; request.data }` con errores vía `HttpsError`. El SPEC original usaba sintaxis v1 (`context.auth`) — corregido antes de codear.
- **Threshold `text-embedding-3-small` con textos cortos en español es más bajo que `ada-002`.** Descubierto durante E2E: con threshold 0.45 (SPEC original), el top match genuino para "inteligencia artificial" tenía score 0.43 — el semántico no mostraba nada útil. Bajado empíricamente a 0.30 para capturar los matches claros y descartar el ruido (ver F5 / commit `7142a3c`).
- **Mismatch documentado:** `firebase.json.runtime: nodejs20` vs `src/functions/package.json.engines.node: 22`. `firebase.json` manda en deploy — runtime efectivo es Node 20. Si alguien alinea `firebase.json` a 22 sin coordinar, cambia el runtime de deploy sin otras señales.
- **El `cacheRef` de `useSimilarNotes` NO era persistente entre montajes.** Cada navegación entre notas re-fetcheaba todos los embeddings. El refactor a module-level (F2) es una mejora real de performance además del pre-requisito de F3.

---

## Features implementadas

### F1: Cloud Function `embedQuery` (commit `1dd11cb`)

- `src/functions/src/search/embedQuery.ts`:
  - `onCall` v2 (`firebase-functions/v2/https`).
  - Input: `{ text: string }` — validado no vacío, ≤ 500 chars.
  - Output: `{ vector: number[] }` de 1536 dims.
  - Modelo: `text-embedding-3-small` (mismo que `generateEmbedding` para que los vectores sean comparables).
  - Secret `OPENAI_API_KEY` reutilizada.
  - Auth requerido (`request.auth.uid`, sino `HttpsError('unauthenticated')`).
  - Errores internos vía `HttpsError('internal', 'Failed to generate embedding')` + `logger.error` para telemetría.
  - `timeoutSeconds: 10`, región `us-central1`.
- `src/functions/src/index.ts`: `+ export { embedQuery } from './search/embedQuery'`.
- Deploy: 4 CFs activas en `us-central1`.

### F2: Cache module-level de embeddings (commit `eae98fe`)

- `src/lib/embeddings.ts`:
  - `getEmbeddingsCache(uid)` — carga lazy on-demand, deduplica fetches concurrentes via `fetchPromise`, reusa si el `uid` no cambió.
  - `invalidateEmbeddingsCache()` — reset. Llamada en logout.
  - `updateEmbeddingInCache(noteId, vector)` — actualiza un vector específico (usado por `useSimilarNotes` cuando obtiene el embedding de la nota actual).
- `src/hooks/useSimilarNotes.ts` — refactor para consumir el cache compartido. Borra el `cacheRef` local que solo vivía por montaje del panel.
- `src/hooks/useAuth.ts` — `invalidateEmbeddingsCache()` antes de `firebaseSignOut` en `signOut` (defensivo). Sin esto, si el user loguea con otra cuenta en la misma sesión, vería embeddings de la cuenta anterior.

### F3: Hook `useHybridSearch` (commit `cbcc2de`)

- `src/lib/firebase.ts`: `+ export const functions = getFunctions(app, 'us-central1')`. Primer uso de Firebase Functions en el cliente.
- `src/lib/embeddings.ts`: `+ embedQueryText(text)` via `httpsCallable<{ text }, { vector }>(functions, 'embedQuery')`. La referencia al callable se crea a nivel de módulo (una sola vez).
- `src/hooks/useHybridSearch.ts`:
  - Compone `useNoteSearch()` (keyword) sin refactorizarlo — reutiliza la lógica sync + filter de archivadas tal cual.
  - Debounce vanilla (`useRef<number>` + `setTimeout`) de 500ms, cleanup en effect return.
  - Guards: `!user || trimmed.length < 3` → `shouldSearch = false`, resultados derivados retornan `[]` / `false`.
  - Pipeline estricto en orden: `filter isArchived → exclude keyword IDs → sort score desc → slice(0, 5)`. Si se slicea antes de excluir, con 5 keyword quedaba `semanticResults` vacío.
  - Race handling por snapshot del query (`frozenQuery !== query.trim()` descarta resultados obsoletos). Sin `AbortController` — Firebase callable no lo soporta.
  - Degradación graceful: `try/catch` → `semanticResults: []` + no error visible al usuario.
  - `setIsLoadingSemantic(true)` se dispara DENTRO del `setTimeout` callback (no síncrono en el effect body). Respeta `react-hooks/set-state-in-effect` y además el skeleton aparece cuando arranca la llamada real, no durante el debounce.

### F4: UI de sección semántica en `/notes` (commit `0d98b12`)

- `src/components/editor/NoteCard.tsx` — prop opcional `semanticScore?: number`. Si está presente, renderiza un badge violet con ícono `Sparkles` + porcentaje (`bg-violet-500/10 text-violet-500 rounded-md px-1.5 py-0.5 text-xs`). Consumers existentes (Command Palette, dashboard) no cambian.
- `src/app/notes/page.tsx`:
  - Reemplaza `useNoteSearch` por `useHybridSearch` (misma shape keyword, agrega semantic).
  - Sección `SemanticSection` aparece cuando hay query activa (`query.trim() !== ''`).
  - Estados: skeleton mientras `isLoadingSemantic`, resultados con `NoteCard semanticScore={score}`, o sección oculta si hay 0 resultados y no está cargando.
  - Caso "sin keyword pero con semánticos": la sección sube como resultado principal con leyenda "No hay coincidencias exactas, pero estas notas son temáticamente similares."
  - Caso "sin keyword y sin semánticos": mensaje "Sin resultados." en dashed border (misma estética que empty state previo).
  - Keyword results preservan su comportamiento previo (sin heading, lista vertical `gap-3`). La sección semántica aparece con heading "Semánticamente similares" arriba.

### F5: Calibración empírica del threshold (commit `7142a3c`)

- `src/hooks/useHybridSearch.ts` — `SEMANTIC_THRESHOLD`: `0.45` → `0.30`.
- Descubierto en E2E: con `text-embedding-3-small` + notas cortas en español, cosine similarity satura en rangos 0.15-0.45. Top match genuino "Claude Mythos IA" para query "inteligencia artificial" tenía score 0.427 — por debajo del 0.45 del SPEC.
- Con 0.30 los 3 matches legítimos de IA pasan (0.43, 0.33, 0.27) y el ruido de metodologías dispares (0.23) y templates (0.25) queda descartado.
- Si futuras notas con otro estilo de escritura muestran ruido, subir a 0.35 es un 1-line change.

---

## Verificación E2E (Playwright MCP)

Viewport desktop (1280×800) y mobile (375×812). Cuenta real UID `gYPP7NIo5JanxIbPqMe6nC3SQfE3`, 11 embeddings en el corpus.

- Query "inteligencia artificial" (sin keyword match): sección "Notas temáticamente similares" con leyenda explicativa + 2 resultados ("Claude Mythos IA" 43%, "Claude Code Security" 33%).
- Query "claude" (3 keyword matches): lista keyword completa sin sección semántica visible porque todos los potenciales hits están excluidos por el filter de IDs.
- Query "ab" (2 chars): no dispara CF (verificado en Network tab — sin nuevas requests a `embedQuery`).
- Query vacía: lista por `updatedAt`, sin sección semántica, comportamiento idéntico al previo.
- Mobile 375px: badge violet + Sparkles visible, texto truncado correctamente, leyenda no hace overflow.
- Regresión `SimilarNotesPanel` al abrir nota "Claude Mythos IA": muestra 2 similares (57%, 54%) con el cache compartido, sin regresión.
- Build: `npm run build` pasa sin errores TS (5.02s, bundle 2.72MB).
- Lint: `npx eslint` sobre archivos tocados limpio.
- Deploy: `npm run deploy:functions` exitoso, 4 CFs activas (`processInboxItem`, `autoTagNote`, `generateEmbedding`, `embedQuery`).

---

## Decisiones clave

1. **Callable onCall v2 en vez de HTTP `onRequest`** — auth automática via Firebase Auth token, serialización JSON, errores via `HttpsError` mapeados al cliente. Menos código manual que `onRequest` + CORS + manual token validation.
2. **Cache module-level compartido entre hooks** — deduplica fetches de `users/{uid}/embeddings` cuando `SimilarNotesPanel` y `useHybridSearch` se activan en la misma sesión. Se invalida en logout.
3. **Secciones separadas (no RRF/fusion ranking)** — del SPEC. Evita "resultado shuffling" cuando llegan los semánticos 500ms después de los keyword.
4. **Threshold 0.30 empírico** (F5). Calibrado con el corpus real, no con un número del SPEC.
5. **Debounce vanilla 500ms** — sin librería, 15 líneas, setTimeout + useRef. Se siente responsivo sin hammerear la CF.
6. **Pipeline estricto**: `filter isArchived → exclude keyword IDs → sort → slice`. Si se invierte slice y exclude, semantic queda vacío cuando keyword devuelve 5+ resultados.
7. **Race handling por snapshot del query** — `frozenQuery !== query.trim()` descarta resultados obsoletos al volver del CF. Sin `AbortController` porque Firebase callable no lo expone.
8. **`setIsLoadingSemantic(true)` dentro del `setTimeout` callback, no síncrono en effect** — respeta `react-hooks/set-state-in-effect` y además alinea UX: el skeleton aparece cuando arranca la llamada real, no durante el debounce.
9. **Degradación graceful** — `try/catch` + `semanticResults: []` en error. Sin toast, el usuario ve keyword results y no percibe diferencia si la CF falla.
10. **`semanticScore` como prop opcional en NoteCard** — no rompe consumers existentes (Command Palette, Dashboard, etc.).

---

## Archivos tocados (resumen)

### Nuevos

- `src/functions/src/search/embedQuery.ts`
- `src/hooks/useHybridSearch.ts`

### Modificados

- `src/functions/src/index.ts` — +export embedQuery
- `src/lib/firebase.ts` — +export functions
- `src/lib/embeddings.ts` — cache module-level + `embedQueryText`
- `src/hooks/useSimilarNotes.ts` — usar cache compartido
- `src/hooks/useAuth.ts` — invalidar cache en signOut
- `src/components/editor/NoteCard.tsx` — prop `semanticScore`
- `src/app/notes/page.tsx` — `useHybridSearch` + `SemanticSection`

---

## Commits

1. `1dd11cb` feat(functions): agregar CF embedQuery callable
2. `eae98fe` refactor(embeddings): extraer cache a modulo compartido
3. `cbcc2de` feat(search): hook useHybridSearch con debounce y race-handling
4. `0d98b12` feat(notes): seccion de resultados semanticos en la lista
5. `7142a3c` fix(search): bajar threshold semantico de 0.45 a 0.30
6. (este) docs(search): registrar Feature 3 busqueda hibrida

---

## Siguiente iteración

Búsqueda híbrida deja el conocimiento descubrible por significado en `/notes`. Candidatos próximos:

- **Command Palette con tab "semántico"** — hoy Ctrl+K es keyword-only (decisión consciente del SPEC por velocidad). Si el uso real muestra que el hybrid es útil también ahí, agregar toggle con el mismo hook.
- **AI-suggested links en el editor** — usar embeddings existentes para sugerir wikilinks mientras el usuario escribe. Inline, debounced.
- **Progressive summarization visual** — highlights L1/L2/L3 en el editor (Tiago Forte).
- **Tuning del threshold por usuario** — si diferentes usuarios tienen estilos de escritura muy distintos, un slider en settings "más permisivo / más estricto" es barato.
- **Distribución** — code signing Windows (MSI), Play Store publish.
