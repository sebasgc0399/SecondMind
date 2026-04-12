# SPEC — SecondMind · Fase 4: Grafo + Resurfacing

> Alcance: Visualizar el knowledge graph, generar embeddings para encontrar notas similares, y resurfacear notas olvidadas con spaced repetition
> Dependencias: Fase 3.1 (AI Pipeline completa, Cloud Functions operativas)
> Estimado: 3-4 semanas solo dev
> Stack relevante: Reagraph, OpenAI SDK (text-embedding-3-small), ts-fsrs, Cloud Functions v2

---

## Objetivo

Al terminar esta fase, el usuario puede explorar visualmente su knowledge graph (nodos = notas, edges = links), descubrir notas semánticamente similares mientras edita, y recibir cada día un digest de notas que necesitan revisión basado en spaced repetition. El conocimiento deja de ser una lista plana — se convierte en una red explorable que resurfacea lo olvidado.

---

## Features

### F1: Cloud Function `generateEmbedding`

**Qué:** Cloud Function v2 que genera un vector embedding de cada nota usando OpenAI `text-embedding-3-small` y lo guarda en la colección `embeddings/{noteId}`. Se dispara con `onDocumentWritten` en `notes/{noteId}`, reutilizando el patrón de `autoTagNote`.

**Criterio de done:**

- [ ] Al guardar una nota con contenido, se genera un embedding en `embeddings/{noteId}` con vector (1536 dims), model, contentHash, y createdAt
- [ ] Si el `contentHash` del embedding existente coincide con el contenido actual, la CF hace early return (no regenera)
- [ ] Si la nota tiene `contentPlain` vacío, la CF hace early return
- [ ] El secret `OPENAI_API_KEY` está configurado en Firebase Functions via `defineSecret`
- [ ] `npm run deploy:functions` despliega sin errores

**Archivos a crear/modificar:**

- `src/functions/src/embeddings/generateEmbedding.ts` — CF principal
- `src/functions/src/index.ts` — re-export de la nueva CF
- `src/functions/package.json` — agregar `openai` SDK

**Notas de implementación:**

- Trigger: `onDocumentWritten('users/{userId}/notes/{noteId}')`. Guard: `if (!contentPlain?.trim()) return` + comparar `contentHash` con hash existente en `embeddings/{noteId}`
- Hash: `crypto.createHash('sha256').update(contentPlain).digest('hex')` — trivial, no necesita librería
- OpenAI SDK: `new OpenAI({ apiKey })` → `openai.embeddings.create({ model: 'text-embedding-3-small', input: contentPlain })`
- Escribir a `embeddings/{noteId}`: `{ id, vector, model: 'text-embedding-3-small', contentHash, createdAt }`
- Costo estimado: ~$0.002 para 500 notas de ~200 tokens. Negligible
- `retry: false`, `timeoutSeconds: 60`, `region: 'us-central1'` — mismo pattern que `autoTagNote`
- El vector es un `number[]` de 1536 dimensiones. Firestore soporta arrays de números sin problema

---

### F2: Knowledge Graph (Reagraph)

**Qué:** Pantalla `/notes/graph` que renderiza el knowledge graph completo usando Reagraph (WebGL). Nodos = notas, edges = links bidireccionales. Force-directed layout con interacciones de hover, click, zoom, y pan.

**Criterio de done:**

- [ ] La ruta `/notes/graph` renderiza un grafo interactivo con todos los nodos y edges
- [ ] Cada nodo muestra el título truncado (max 25 chars) como label
- [ ] El tamaño del nodo es proporcional a `linkCount` (min 5px, max 25px)
- [ ] El color del nodo varía por `paraType` (project=azul, area=verde, resource=amarillo, archive=gris)
- [ ] Hover sobre un nodo highlight el nodo + vecinos directos, dim el resto
- [ ] Click en un nodo muestra un panel flotante con: título, noteType badge, linkCount, botón "Abrir nota →"
- [ ] Double-click en un nodo navega directo al editor de la nota
- [ ] Zoom con scroll, pan con drag del canvas
- [ ] Si hay menos de 3 notas, muestra empty state: "El grafo cobra vida con más notas y conexiones"
- [ ] Botón fullscreen toggle en el header

**Archivos a crear/modificar:**

- `src/app/notes/graph/page.tsx` — Ruta de la página del grafo
- `src/components/graph/KnowledgeGraph.tsx` — Componente principal con `<GraphCanvas>`
- `src/components/graph/GraphNodePanel.tsx` — Panel flotante al click en nodo
- `src/hooks/useGraph.ts` — Hook que transforma datos de TinyBase (notes + links stores) a formato Reagraph `{ nodes[], edges[] }`

**Notas de implementación:**

- Reagraph API: `<GraphCanvas nodes={nodes} edges={edges} />`. Nodes: `{ id, label, fill, size }`. Edges: `{ id, source, target }`
- `useGraph` lee `useRowIds('notes')` + `useTable('notes')` para nodos, `useRowIds('links')` + `useTable('links')` para edges. Filtra `isArchived === true` de nodos. Filtra edges cuyos source/target no existan en nodos visibles
- Tamaño de nodo: `Math.max(5, Math.min(25, 5 + linkCount * 3))`
- Colores por `paraType`: definir mapa en el hook, referenciar CSS variables del theme cuando sea posible
- Reagraph soporta `onNodeClick`, `onNodeDoubleClick`, `onNodePointerOver/Out` nativamente
- Panel flotante: posición absoluta sobre el canvas, aparece al click, se cierra al click fuera o Escape
- Acceso: botón "Ver como grafo" en `/notes` + sub-item en sidebar bajo Notas (o link directo)

---

### F3: Filtros del Grafo

**Qué:** Panel de filtros expandible sobre el grafo para filtrar nodos por área (paraType), tipo de nota (noteType), y rango de links. El grafo se re-renderiza con los nodos filtrados.

**Criterio de done:**

- [ ] Dropdown "Área" filtra por paraType (Todas, Project, Area, Resource, Archive)
- [ ] Radio group "Tipo" filtra por noteType (Todas, Fleeting, Literature, Permanent)
- [ ] Slider o inputs "Links mínimos" filtra nodos con linkCount >= N
- [ ] Los filtros se combinan (AND). Edges se filtran automáticamente si un extremo no es visible
- [ ] Botón "Resetear filtros" vuelve a mostrar todo
- [ ] Los filtros persisten en estado local (no URL ni Firestore — se pierden al salir, YAGNI)

**Archivos a crear/modificar:**

- `src/components/graph/GraphFilters.tsx` — Componente de filtros
- `src/hooks/useGraph.ts` — Extender con lógica de filtrado (recibe `filters` como param)

**Notas de implementación:**

- `useGraph` recibe un objeto `GraphFilters` y aplica `.filter()` antes de mapear a formato Reagraph
- Los filtros son estado local del componente `page.tsx` del grafo — se pasan al hook como argumento
- El panel de filtros se muestra como un desplegable (Base UI `Collapsible` o similar) sobre el grafo

---

### F4: Notas Similares (Sidebar)

**Qué:** Panel en el editor de notas (debajo de Backlinks) que muestra las 5 notas más semánticamente similares a la nota actual, calculadas por cosine similarity de embeddings.

**Criterio de done:**

- [ ] En el editor de notas, debajo del panel de Backlinks, aparece "Notas similares"
- [ ] Muestra hasta 5 notas con título clickeable (navega al editor de esa nota)
- [ ] Cada nota muestra un score de similitud (ej: "92% similar")
- [ ] Si la nota actual no tiene embedding, muestra "Guardá la nota para ver sugerencias"
- [ ] Si no hay notas similares (score < 0.5), muestra "Sin notas similares aún"
- [ ] Los embeddings se cargan una sola vez al abrir la nota (no reactivo a cambios de otras notas)

**Archivos a crear/modificar:**

- `src/components/editor/SimilarNotesPanel.tsx` — Panel de notas similares
- `src/hooks/useSimilarNotes.ts` — Hook que carga embeddings de Firestore, calcula cosine similarity
- `src/lib/embeddings.ts` — Función `cosineSimilarity(a: number[], b: number[]): number` + `fetchEmbeddings`

**Notas de implementación:**

- **No usar TinyBase para embeddings.** Los vectores de 1536 dims son demasiado grandes para el store in-memory. Cargar bajo demanda desde Firestore con `getDocs(collection)` one-shot al abrir el editor
- `useSimilarNotes(noteId)`: 1) fetch embedding de la nota actual, 2) fetch todos los embeddings, 3) calcular cosine similarity, 4) retornar top 5 con score > 0.5
- Cosine similarity: `dot(a,b) / (norm(a) * norm(b))`. Implementación trivial, no necesita librería
- Cache en memoria: guardar embeddings en un `useRef` que persiste mientras la app esté abierta, invalidar cuando se navega a otra nota cuyo embedding no existe en el cache
- Para < 500 notas, cargar todos los embeddings es viable (~1.2MB total). Si escala, migrar a búsqueda server-side
- Threshold 0.5 es configurable — ajustar con datos reales

---

### F5: FSRS Resurfacing

**Qué:** Integrar `ts-fsrs` para calcular qué notas necesitan revisión y cuándo. El estado FSRS se guarda como campos flat en la nota. El usuario puede "revisar" una nota y calificar su recuerdo.

**Criterio de done:**

- [ ] Al abrir una nota, el header muestra un botón "Revisé esta nota" si tiene fecha de revisión pasada o cercana
- [ ] Al hacer click en "Revisé", aparecen 2 opciones: "La recuerdo bien" (Good) y "Necesito repasarla" (Again)
- [ ] La calificación actualiza los campos FSRS de la nota (`fsrsDue`, `fsrsStability`, `fsrsDifficulty`, etc.)
- [ ] La siguiente fecha de revisión se calcula automáticamente por ts-fsrs
- [ ] Las notas nuevas no tienen estado FSRS hasta su primera revisión (opt-in, no opt-out)
- [ ] `tsc --noEmit` compila sin errores

**Archivos a crear/modificar:**

- `src/lib/fsrs.ts` — Wrapper de ts-fsrs: `createScheduler()`, `scheduleReview(card, rating)`, `serializeCard(card)`, `deserializeCard(json)`
- `src/hooks/useResurfacing.ts` — Hook que lee estado FSRS de la nota, expone `reviewNote(rating)` y `nextReviewDate`
- `src/components/editor/ReviewBanner.tsx` — Banner en editor con botón de revisión y opciones de calificación
- `src/stores/notesStore.ts` — Agregar campos FSRS al schema: `fsrsState` (JSON string), `fsrsDue` (number/timestamp), `fsrsLastReview` (number/timestamp)
- `src/types/note.ts` — Agregar campos FSRS a la interfaz

**Notas de implementación:**

- **Estado FSRS como JSON string:** TinyBase no soporta objetos anidados. Guardar el `Card` de ts-fsrs serializado en `fsrsState: string`. Campos auxiliares `fsrsDue` y `fsrsLastReview` como timestamps numéricos para queries eficientes (el daily digest necesita filtrar "notas con `fsrsDue <= hoy`")
- Simplificación para knowledge notes: ts-fsrs tiene 4 ratings (Again/Hard/Good/Easy). Para notas (no flashcards), simplificar a 2: "La recuerdo bien" → `Rating.Good`, "Necesito repasarla" → `Rating.Again`. No necesitamos Hard/Easy para revisión de conocimiento
- `ts-fsrs` es client-side (~15KB). Importar en el frontend, no en Cloud Functions
- Primera revisión: `createEmptyCard()` de ts-fsrs, luego `scheduler.next(card, date, rating)`
- El `ReviewBanner` solo aparece si la nota tiene `fsrsDue` y `fsrsDue <= ahora + 24h` (ventana de revisión)
- Patrón de persistencia: `setPartialRow` → `setDoc` async (local-first, mismo pattern de Fase 2)

---

### F6: Daily Digest (Dashboard)

**Qué:** Card en el dashboard que muestra 2-3 notas que necesitan revisión hoy según FSRS, más 1-2 notas hub (alto linkCount) como inspiración. Reemplaza el placeholder "Daily Digest [Fase 1.1]" del wireframe.

**Criterio de done:**

- [ ] El dashboard muestra un card "Daily Digest" con 3-5 notas recomendadas
- [ ] Las notas con `fsrsDue <= hoy` aparecen primero (max 3), ordenadas por urgencia (más atrasadas primero)
- [ ] Si hay espacio, se rellenan con notas hub: notas con `linkCount >= 3` ordenadas random (seed diario para estabilidad)
- [ ] Cada nota muestra: título, razón de aparición ("Revisar hoy" vs "Hub: 5 conexiones"), link al editor
- [ ] Click en una nota navega al editor (donde el `ReviewBanner` estará visible si aplica)
- [ ] Si no hay notas con revisión pendiente ni hubs, muestra empty state: "Creá y revisá notas para activar tu Daily Digest"

**Archivos a crear/modificar:**

- `src/components/dashboard/DailyDigest.tsx` — Componente del card
- `src/hooks/useDailyDigest.ts` — Hook que computa las notas del digest (client-side, no CF)
- `src/app/page.tsx` — Integrar DailyDigest en el layout del dashboard

**Notas de implementación:**

- **Client-side, no Cloud Function.** El doc de arquitectura planea un CF scheduled `dailyDigest`. Decisión de cambio: para single-user, computar client-side es más simple, evita otra CF + colección `digest/{date}`, y los datos ya están en TinyBase. Si la app escala a multi-user o el cómputo es pesado, migrar a CF
- `useDailyDigest` lee todas las notas del store, filtra por `fsrsDue`, ordena, y complementa con hubs random
- Seed diario para hubs: `new Date().toISOString().split('T')[0]` como seed para `Math.random()` determinístico — mismos hubs durante el día, cambian al día siguiente
- No confundir con el `DailyDigest.tsx` placeholder del wireframe — este lo reemplaza con funcionalidad real

---

## Orden de implementación

1. **F1 (Embeddings CF)** → Es backend que corre en background. Una vez desplegada, empieza a generar embeddings para notas existentes y nuevas. Las demás features pueden desarrollarse mientras los embeddings se generan
2. **F2 (Knowledge Graph)** → Feature más visible e independiente. No necesita embeddings ni FSRS. Solo lee stores existentes (notes + links)
3. **F3 (Filtros del Grafo)** → Extensión directa de F2. Se construye inmediatamente después
4. **F5 (FSRS)** → Independiente de F1-F3. Agrega campos al store de notas y lógica de revisión. Necesita estar listo antes de F6
5. **F4 (Notas Similares)** → Necesita que F1 haya generado embeddings. Para este punto ya hay datos
6. **F6 (Daily Digest)** → Necesita F5 (FSRS state). Es el último porque integra todo en el dashboard

---

## Estructura de archivos

```
src/
├── app/notes/graph/
│   └── page.tsx                        # Página del knowledge graph
├── components/
│   ├── graph/
│   │   ├── KnowledgeGraph.tsx          # Canvas Reagraph + interacciones
│   │   ├── GraphNodePanel.tsx          # Panel flotante al click
│   │   └── GraphFilters.tsx            # Filtros desplegables
│   ├── editor/
│   │   ├── SimilarNotesPanel.tsx       # Panel de notas similares
│   │   └── ReviewBanner.tsx            # Banner de revisión FSRS
│   └── dashboard/
│       └── DailyDigest.tsx             # Card de Daily Digest
├── hooks/
│   ├── useGraph.ts                     # Datos del grafo (notes+links → Reagraph format)
│   ├── useSimilarNotes.ts              # Cosine similarity con embeddings
│   ├── useResurfacing.ts               # Estado FSRS + reviewNote()
│   └── useDailyDigest.ts              # Cómputo client-side del digest
├── lib/
│   ├── embeddings.ts                   # cosineSimilarity + fetchEmbeddings
│   └── fsrs.ts                         # Wrapper de ts-fsrs
├── stores/
│   └── notesStore.ts                   # + campos fsrsState, fsrsDue, fsrsLastReview
├── types/
│   └── note.ts                         # + campos FSRS en interfaz
│
└── functions/src/
    ├── embeddings/
    │   └── generateEmbedding.ts        # CF: onDocumentWritten → OpenAI embedding
    └── index.ts                        # + re-export generateEmbedding
```

---

## Definiciones técnicas

### D1: ¿Reagraph o Sigma.js + Graphology?

- **Opciones:** Reagraph (WebGL, React-native, zero config) vs Sigma.js + Graphology (más potente, más complejo)
- **Decisión:** Reagraph para Fase 4
- **Razón:** Para < 500 notas, Reagraph es suficiente y la API declarativa (`<GraphCanvas nodes edges />`) es mucho más simple. Sigma.js tiene mejor rendimiento a escala pero requiere imperative setup + Graphology como data layer. Si el grafo supera ~1000 nodos y Reagraph se pone lento, migrar en fase futura. El doc de arquitectura marca "Reagraph → Sigma.js" como progresión, no como requisito

### D2: ¿Daily Digest como CF scheduled o client-side?

- **Opciones:** CF scheduled (cada mañana, genera `digest/{date}` en Firestore) vs client-side (compute on load)
- **Decisión:** Client-side
- **Razón:** Para single-user, los datos ya están en TinyBase al cargar. Computar las notas del digest es O(n) sobre el store — trivial para < 1000 notas. Una CF scheduled agrega complejidad (cron, colección extra, sync), y el digest sería stale si el usuario revisa una nota entre el cron y la apertura del dashboard. Client-side siempre está fresh. Si la app escala a multi-user, migrar a CF

### D3: ¿Embeddings en TinyBase o Firestore directo?

- **Opciones:** Agregar tabla `embeddings` al TinyBase store vs cargar bajo demanda desde Firestore
- **Decisión:** Firestore directo (one-shot)
- **Razón:** Cada embedding es un array de 1536 floats (~6KB). Con 500 notas = ~3MB en memoria permanente en TinyBase. No vale la pena — los embeddings solo se usan al abrir el editor para "Notas similares". Cargar on-demand + cache en `useRef` es más eficiente

### D4: ¿4 ratings FSRS o simplificado a 2?

- **Opciones:** Again/Hard/Good/Easy (estándar FSRS) vs Again/Good (simplificado)
- **Decisión:** 2 ratings: "Necesito repasarla" (Again) + "La recuerdo bien" (Good)
- **Razón:** SecondMind no es una app de flashcards. El objetivo del resurfacing es re-exponer notas olvidadas, no optimizar memorización. 2 opciones reducen la fricción del review a un solo click significativo. ts-fsrs funciona perfectamente con un subconjunto de ratings

---

## Checklist de completado

Al terminar esta fase, TODAS estas condiciones deben ser verdaderas:

- [ ] La app compila sin errores (`tsc --noEmit`)
- [ ] `npm run deploy:functions` despliega las 3 CFs (processInboxItem, autoTagNote, generateEmbedding)
- [ ] El deploy a Firebase Hosting funciona (`npm run deploy`)
- [ ] Al guardar una nota con contenido, se genera un embedding automáticamente en Firestore
- [ ] `/notes/graph` muestra el grafo interactivo con nodos y edges
- [ ] Los filtros del grafo filtran nodos por área, tipo, y link count
- [ ] Al abrir una nota en el editor, se muestran notas similares basadas en embeddings
- [ ] El usuario puede "revisar" una nota y ver su próxima fecha de revisión
- [ ] El dashboard muestra el Daily Digest con notas para revisar hoy + hubs
- [ ] El grafo funciona con 0 notas (empty state), 5 notas, y 50+ notas sin errores de rendering

---

## Siguiente fase

Fase 5: Multi-plataforma — PWA optimizada (service worker, offline), Tauri wrapper para desktop (global hotkey, system tray), Capacitor wrapper para mobile (Share Intent Android), y Chrome extension web clipper. Esta fase habilita la base de conocimiento y resurfacing que hace que la app sea valiosa daily — Fase 5 mejora cómo se accede a ella.
