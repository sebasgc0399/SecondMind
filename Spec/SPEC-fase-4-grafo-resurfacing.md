# SPEC — SecondMind · Fase 4: Grafo + Resurfacing (Completada)

> Registro de lo implementado en Fase 4.
> Completada: Abril 2026

---

## Objetivo

Al terminar esta fase, el usuario puede explorar visualmente su knowledge graph (nodos = notas, edges = links), descubrir notas semanticamente similares mientras edita, y recibir cada dia un digest de notas que necesitan revision basado en spaced repetition. El conocimiento deja de ser una lista plana — se convierte en una red explorable que resurfacea lo olvidado.

---

## Features implementadas

### F1: Cloud Function `generateEmbedding`

Cloud Function v2 que genera un vector embedding de cada nota usando OpenAI `text-embedding-3-small` (1536 dimensiones) y lo guarda en `users/{userId}/embeddings/{noteId}`. Trigger `onDocumentWritten` en notas, mismo patron que `autoTagNote`. Guard por `contentPlain` vacio y `contentHash` SHA-256 para evitar regeneraciones innecesarias. Secret `OPENAI_API_KEY` via `defineSecret`. Deploy exitoso con 3 CFs activas.

### F2: Knowledge Graph (Reagraph)

Pantalla `/notes/graph` con grafo force-directed WebGL usando Reagraph. Nodos coloreados por `paraType` (project=azul, area=verde, resource=amber, archive=gris), tamano proporcional a `linkCount` (min 5px, max 25px). Hover highlighting de vecinos via `useSelection` hook de Reagraph. Click muestra panel flotante con titulo, badges paraType/noteType, linkCount, y boton "Abrir nota". Double-click navega directo al editor. Empty state con <3 notas. Boton fullscreen toggle. Item "Grafo" en sidebar + boton "Ver como grafo" en lista de notas.

### F3: Filtros del Grafo

Panel colapsable sobre el grafo con 3 filtros combinados AND: select "Area" (paraType), select "Tipo" (noteType), input numerico "Links min" (linkCount >= N). Badge "activos" en el boton cuando hay filtros aplicados. Boton "Resetear" visible solo con filtros activos. Empty state diferenciado: "Ningun nodo coincide con los filtros" con boton de reseteo inline cuando los filtros excluyen todo, vs "El grafo cobra vida..." cuando no hay datos reales. Edges se filtran automaticamente por el Set de nodos visibles.

### F4: Notas Similares (Sidebar)

Panel debajo de Backlinks en el editor que muestra las 5 notas mas semanticamente similares. Embeddings cargados one-shot desde Firestore (no TinyBase — vectores de 1536 dims demasiado grandes para store in-memory). Cache en `useRef` que persiste mientras la app esta abierta. Cosine similarity implementada sin deps (`dot(a,b) / (norm(a) * norm(b))`). Threshold 0.5. Titulos leidos de `notesStore.getCell`. Tres estados: loading (skeleton), sin embedding ("Guarda la nota para ver sugerencias"), sin similares ("Sin notas similares aun"), resultados con score porcentual clickeable.

### F5: FSRS Resurfacing

Integracion de `ts-fsrs` (~15KB, client-side) para spaced repetition de notas. 3 campos flat en notesStore: `fsrsState` (Card serializado como JSON string), `fsrsDue` (timestamp), `fsrsLastReview` (timestamp). 2 ratings simplificados: "La recuerdo bien" (Rating.Good) / "Necesito repasarla" (Rating.Again). Opt-in via boton "Activar revision periodica" que hace `createEmptyCard()` + primer `scheduleReview(Good)`. ReviewBanner con 4 estados: sin FSRS (boton activar), due (banner amber con 2 botones), no-due (texto discreto "Proxima revision: en N dias"), post-review (confirmacion verde). Persistencia via `setPartialRow` local-first.

### F6: Daily Digest (Dashboard)

Card "Daily Digest" en el dashboard (primer item del grid). Hasta 3 notas con `fsrsDue <= endOfToday` ordenadas por urgencia (mas atrasadas primero) + hasta 2 notas hub (`linkCount >= 3`) con orden determinístico via hash diario (`hashString(noteId + dayKey)`). Client-side puro, sin CF — datos ya en TinyBase. Empty state: "Crea y revisa notas para activar tu Daily Digest". Items clickeables con icono diferenciado (CalendarClock para review, Network para hub) y detalle ("Revisar hoy" / "Hub: N conexiones").

---

## Archivos — por feature

**F1 — generateEmbedding:**

- `src/functions/src/embeddings/generateEmbedding.ts` — NUEVO (CF principal)
- `src/functions/src/index.ts` — MODIFICADO (+1 export)
- `src/functions/package.json` — MODIFICADO (+openai SDK)

**F2 — Knowledge Graph:**

- `src/app/notes/graph/page.tsx` — NUEVO (pagina del grafo)
- `src/components/graph/KnowledgeGraph.tsx` — NUEVO (canvas Reagraph + interacciones)
- `src/components/graph/GraphNodePanel.tsx` — NUEVO (panel flotante al click)
- `src/hooks/useGraph.ts` — NUEVO (transforma TinyBase → Reagraph format)
- `src/app/router.tsx` — MODIFICADO (+ruta notes/graph antes de notes/:noteId)
- `src/components/layout/Sidebar.tsx` — MODIFICADO (+item "Grafo" con icono Network)
- `src/app/notes/page.tsx` — MODIFICADO (+boton "Ver como grafo")

**F3 — Filtros del Grafo:**

- `src/components/graph/GraphFilters.tsx` — NUEVO (panel colapsable con 3 filtros)
- `src/hooks/useGraph.ts` — MODIFICADO (+interface GraphFilters, +param, +filtrado AND)
- `src/app/notes/graph/page.tsx` — MODIFICADO (+estado filtros, +empty state diferenciado)

**F4 — Notas Similares:**

- `src/lib/embeddings.ts` — NUEVO (cosineSimilarity + fetchEmbedding + fetchAllEmbeddings)
- `src/hooks/useSimilarNotes.ts` — NUEVO (hook con cache useRef, top 5, threshold 0.5)
- `src/components/editor/SimilarNotesPanel.tsx` — NUEVO (panel con skeleton, empty states, lista)
- `src/app/notes/[noteId]/page.tsx` — MODIFICADO (+SimilarNotesPanel en aside)

**F5 — FSRS Resurfacing:**

- `src/lib/fsrs.ts` — NUEVO (wrapper ts-fsrs: scheduleReview, serialize/deserializeCard)
- `src/hooks/useResurfacing.ts` — NUEVO (isDue, reviewNote, activateReview)
- `src/components/editor/ReviewBanner.tsx` — NUEVO (4 estados: activar, due, proxima, confirmacion)
- `src/stores/notesStore.ts` — MODIFICADO (+3 campos: fsrsState, fsrsDue, fsrsLastReview)
- `src/types/note.ts` — MODIFICADO (+campos FSRS opcionales)
- `src/app/notes/[noteId]/page.tsx` — MODIFICADO (+ReviewBanner)

**F6 — Daily Digest:**

- `src/hooks/useDailyDigest.ts` — NUEVO (client-side, hash diario para hubs)
- `src/components/dashboard/DailyDigest.tsx` — NUEVO (card del dashboard)
- `src/app/page.tsx` — MODIFICADO (+DailyDigest al inicio del grid)

---

## Verificacion E2E

- F1: Nota guardada → embedding generado en Firestore con 1536 dims, model `text-embedding-3-small`, contentHash SHA-256. Misma nota sin cambios → no regenera (guard por hash). Nota vacia → no genera.
- F2: Grafo con 5 notas + 5 links renderiza correctamente (colores, tamanos, labels, edges). Empty state con 0 notas. Ruta `/notes/:noteId` no captura "graph". Double-click navega al editor.
- F3: Filtro paraType "resource" → 3/5 nodos. Resetear → 5/5. Filtro "archive" → 0 nodos con "Ningun nodo coincide..." + boton resetear. Badge "activos" visible.
- F4: Panel "Notas similares (1)" con "Neural Networks 58%". Cooking excluida (<0.5). Empty states validados.
- F5: Boton "Activar revision periodica" → banner due con 2 botones → "La recuerdo bien" → "Revisado. Proxima revision: en 2 dias". Persistido tras reload.
- F6: Empty state sin datos. 2 review "Revisar hoy" + 2 hub "Hub: N conexiones". "Random Note" excluida.

---

## Checklist de completado

- [x] La app compila sin errores (`tsc --noEmit` + `npm run build`)
- [x] `npm run deploy:functions` despliega las 3 CFs (processInboxItem, autoTagNote, generateEmbedding)
- [x] Al guardar una nota con contenido, se genera un embedding automaticamente en Firestore
- [x] `/notes/graph` muestra el grafo interactivo con nodos y edges
- [x] Los filtros del grafo filtran nodos por area, tipo, y link count
- [x] Al abrir una nota en el editor, se muestran notas similares basadas en embeddings
- [x] El usuario puede "revisar" una nota y ver su proxima fecha de revision
- [x] El dashboard muestra el Daily Digest con notas para revisar hoy + hubs
- [x] El grafo funciona con 0 notas (empty state) y 5 notas sin errores de rendering
- [x] Reagraph compatible con React 19 + Vite (smoke test previo a implementacion)

---

## Observaciones post-implementacion

1. **Reagraph + React 19 compatible sin issues.** Smoke test previo al desarrollo confirmo build limpio. Agrega ~1.3MB al bundle (Three.js/WebGL). Code-splitting pendiente para fase futura.

2. **Ruta `notes/graph` debe ir ANTES de `notes/:noteId` en router.tsx.** Si va despues, React Router captura "graph" como noteId y muestra "nota no encontrada". Orden critico en flat routes.

3. **Empty state con filtros activos: no hacer early return.** Descubierto en F3. Si filtros reducen resultados a 0, el empty state debe seguir mostrando los controles de filtro y ofrecer reseteo. Aplica a cualquier vista con filtros + empty state.

4. **`Math.random()` no es seedable en JavaScript.** Para orden determinístico diario de hubs en F6, se usa hash numerico de `noteId + dateString` para ordenar: `[...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)`. Mismos hubs durante el dia, cambian al siguiente.

5. **Embeddings NO van en TinyBase.** Vectores de 1536 floats (~6KB cada uno) son demasiado grandes para el store in-memory. Carga on-demand desde Firestore con cache en `useRef`. Para <500 notas (~1.2MB total), fetch all es viable.

6. **FSRS opt-in requiere boton explicito.** Sin "Activar revision periodica", la feature es invisible porque notas nuevas no tienen `fsrsDue` y el banner nunca aparece. Tercer estado del ReviewBanner resuelve el discovery.

7. **Daily Digest client-side, no CF scheduled.** Para single-user, los datos ya estan en TinyBase. Client-side siempre fresh (no stale entre cron y apertura). Migrar a CF si escala a multi-user.

---

## Decisiones tecnicas

- **D1: Reagraph sobre Sigma.js** — API declarativa suficiente para <500 nodos. Migracion a Sigma.js si performance lo requiere.
- **D2: Daily Digest client-side** — Evita CF scheduled + coleccion extra. Fresh on load.
- **D3: Embeddings en Firestore directo** — One-shot fetch + useRef cache. No TinyBase.
- **D4: 2 ratings FSRS (Again/Good)** — Reduce friccion. ts-fsrs funciona con subconjunto.

---

## Siguiente fase

Fase 5: Multi-plataforma — PWA optimizada (service worker, offline), Tauri wrapper para desktop (global hotkey, system tray), Capacitor wrapper para mobile (Share Intent Android), y Chrome extension web clipper.
