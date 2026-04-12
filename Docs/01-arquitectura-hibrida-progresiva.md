# 🏗️ Arquitectura: Híbrida Progresiva — Guía Técnica

> Documento de referencia arquitectónica para SecondMind.
> Este documento NO es el SPEC — es la guía que informa al SPEC de cada fase.
> Actualizado tras Fases 0–2 con correcciones factuales del stack y patterns descubiertos.

---

## 1. Visión general

Un sistema de productividad y conocimiento personal que combina:

- **Ejecución** (tareas, proyectos, objetivos — lo que ya funciona en Notion)
- **Conocimiento vivo** (notas atómicas, links bidireccionales, grafo — lo que falta)
- **AI como copiloto** (procesamiento de inbox, auto-linking, resurfacing)

### Principio rector

Construir lo mínimo que genere valor diario, iterar basándose en uso real. Cada fase debe ser usable por sí sola — no hay "todo o nada".

---

## 2. Stack técnico definitivo

### Core

| Capa                | Tecnología                                                           | Justificación                                                                                                   |
| ------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **UI Framework**    | React 19 + TypeScript strict                                         | Stack conocido, máximo code-reuse                                                                               |
| **Build**           | Vite                                                                 | Rápido, sin config extra                                                                                        |
| **Estilos**         | Tailwind CSS v4 (CSS-first, `@theme` en `src/index.css`)             | No existe `tailwind.config.ts` — toda la config vive en CSS                                                     |
| **Editor de notas** | TipTap (ProseMirror)                                                 | Headless, extensible, wikilinks custom                                                                          |
| **Store reactivo**  | TinyBase v8                                                          | 13KB, hooks React. No tiene persister Firestore nativo — se usa `createCustomPersister`                         |
| **Backend**         | Firebase (Firestore + Cloud Functions v2 + Auth + Storage + Hosting) | Stack conocido, $0 en free tier                                                                                 |
| **Búsqueda local**  | Orama                                                                | ~40KB, TypeScript-native, FTS client-side                                                                       |
| **UI Components**   | shadcn/ui (Base UI / `@base-ui/react`)                               | **No es Radix UI** — usa `data-open`/`data-closed` + `data-starting-style`/`data-ending-style`, NO `data-state` |
| **Routing**         | React Router v7 (`createBrowserRouter`)                              | Client-side routing con layouts anidados                                                                        |
| **Iconos**          | lucide-react                                                         | Consistente, tree-shakeable                                                                                     |

### Fases posteriores

| Capa                   | Tecnología                                 | Fase       |
| ---------------------- | ------------------------------------------ | ---------- |
| **Grafo visual**       | Reagraph → Sigma.js + Graphology           | v1.0 → v2  |
| **AI inbox**           | Cloud Functions → Claude Haiku             | v1.0       |
| **Embeddings**         | OpenAI text-embedding-3-small              | v1.1       |
| **Resurfacing**        | ts-fsrs (spaced repetition adaptado)       | v1.1       |
| **Desktop**            | PWA → Tauri (hotkey + system tray)         | MVP → v1.1 |
| **Mobile**             | PWA → Capacitor                            | v2         |
| **Web clipper**        | Chrome extension minimal                   | v1.1       |
| **Búsqueda semántica** | Orama keyword + embeddings cosine (hybrid) | v2         |

---

## 3. Modelo de datos (Firestore)

### Principios del modelo

- **Notas son ciudadanos de primera clase** — no subcolecciones de proyectos
- **Links como colección separada** — IDs determinísticos `${sourceId}__${targetId}` para dedup trivial y queries bidireccionales eficientes
- **PARA como metadata** — no como estructura de carpetas
- **Títulos de links resueltos in-memory** — `useBacklinks` hace join con `useTable('notes')` en vez de cachear títulos en el doc de link. Cero stale titles, reactivo a cambios
- **Content de notas fuera de TinyBase** — el campo `content` (TipTap JSON) se lee/escribe directo de Firestore solo cuando se abre el editor. TinyBase solo maneja metadata. El persister usa `merge: true` para no sobrescribir `content` al sincronizar

### Colecciones principales

```
firestore/
├── users/{userId}/
│   ├── notes/           → Notas atómicas (la entidad central)
│   ├── links/           → Conexiones bidireccionales entre notas (ID: sourceId__targetId)
│   ├── tasks/           → Tareas (acciones atómicas)
│   ├── projects/        → Proyectos (resultados con deadline)
│   ├── objectives/      → Objetivos (metas grandes)
│   ├── areas/           → Áreas de responsabilidad (PARA)
│   ├── inbox/           → Capturas sin procesar
│   ├── tags/            → Tags/temas
│   ├── habits/          → Habit tracker entries
│   └── embeddings/      → Vectores para búsqueda semántica (v1.1)
```

### Esquema: `notes/{noteId}`

```typescript
interface Note {
  id: string; // crypto.randomUUID()
  title: string; // La idea, no el tema ("La fricción mata hábitos")
  content: string; // TipTap JSON serializado (fuera del schema TinyBase, solo en Firestore)
  contentPlain: string; // Texto plano para búsqueda (generado con editor.getText())

  // Clasificación PARA
  paraType: 'project' | 'area' | 'resource' | 'archive';

  // Zettelkasten
  noteType: 'fleeting' | 'literature' | 'permanent';
  source?: string; // De dónde viene (libro, podcast, conversación, etc.)

  // Relaciones (IDs como JSON arrays serializados — parseIds/stringifyIds)
  projectIds: string[]; // Proyectos vinculados
  areaIds: string[]; // Áreas vinculadas
  tagIds: string[]; // Tags/temas

  // Links bidireccionales (referencia rápida — la verdad está en links/)
  outgoingLinkIds: string[]; // Notas a las que esta nota apunta
  incomingLinkIds: string[]; // Notas que apuntan a esta nota
  linkCount: number; // Total de conexiones (para ranking)

  // Progressive Summarization
  summaryL1?: string; // Pasajes clave resaltados
  summaryL2?: string; // Lo más importante de L1
  summaryL3?: string; // Resumen ejecutivo en tus palabras
  distillLevel: 0 | 1 | 2 | 3; // Nivel actual de destilación

  // AI-generated
  aiTags?: string[]; // Tags sugeridos por Claude
  aiSummary?: string; // Resumen de una línea generado
  aiProcessed: boolean; // ¿Ya pasó por el pipeline AI?

  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastViewedAt?: Timestamp; // Para resurfacing (FSRS)
  viewCount: number; // Engagement tracking
  isFavorite: boolean;
  isArchived: boolean;
}
```

### Esquema: `links/{sourceId__targetId}`

```typescript
interface NoteLink {
  id: string; // Determinístico: `${sourceId}__${targetId}`
  sourceId: string; // Nota origen
  targetId: string; // Nota destino

  // Contexto del link
  context?: string; // Texto alrededor del [[wikilink]] en la nota origen
  linkType: 'explicit' | 'ai-suggested'; // ¿Lo creó el usuario o la AI?

  // Metadata
  createdAt: Timestamp;
  strength?: number; // AI: similitud semántica (0-1)
  accepted: boolean; // Para links AI-suggested: ¿el usuario aceptó?
}
```

> **Nota:** `sourceTitle` y `targetTitle` no se cachean en el doc de link. Se resuelven in-memory con join en `useBacklinks` → `useTable('notes')`. Esto elimina el stale-title problem sin round-trip.

### Esquema: `inbox/{itemId}`

```typescript
interface InboxItem {
  id: string;
  rawContent: string; // Texto tal como se capturó
  source: 'quick-capture' | 'web-clip' | 'voice' | 'share-intent' | 'email';
  sourceUrl?: string; // Si viene de web clipper

  // AI processing results
  aiProcessed: boolean;
  aiResult?: {
    suggestedTitle: string;
    suggestedTags: string[];
    suggestedType: 'task' | 'note' | 'project' | 'reference' | 'trash';
    summary: string;
    relatedNoteIds: string[]; // Notas similares encontradas
  };

  // Estado
  status: 'pending' | 'processed' | 'dismissed';
  processedAs?: {
    type: 'note' | 'task' | 'project';
    resultId: string; // ID de la nota/tarea/proyecto creado
  };

  createdAt: Timestamp;
}
```

> **Items nunca se borran físicamente** — se marcan `processed` o `dismissed`. Preserva historial para undo o auditoría futura.

### Esquema: `tasks/{taskId}`

```typescript
interface Task {
  id: string;
  name: string;
  status: 'inbox' | 'in-progress' | 'waiting' | 'delegated' | 'completed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: Timestamp; // Cuándo hacerla

  // Relaciones
  projectId?: string; // Singular — una tarea pertenece a UN proyecto
  areaId?: string;
  noteIds: string[]; // Notas vinculadas

  description?: string;

  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt?: Timestamp;
}
```

> **Cambio vs diseño original:** `status` droppeó `'todo'` (nunca se usó) y agregó `'delegated'`. `completeTask` es un toggle — destildar vuelve a `in-progress`.

### Esquema: `projects/{projectId}`

```typescript
interface Project {
  id: string;
  name: string;
  status: 'not-started' | 'in-progress' | 'on-hold' | 'completed';
  priority: 'low' | 'medium' | 'high' | 'urgent';

  // Relaciones
  areaId?: string;
  objectiveId?: string; // Singular — un proyecto pertenece a UN objetivo
  taskIds: string[];
  noteIds: string[];

  // Fechas
  startDate?: Timestamp;
  deadline?: Timestamp;

  isArchived: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

> **Progreso derivado:** % completado = tareas completadas / total de tareas donde `task.projectId === project.id`. Cross-store reactivo en UI.

### Esquema: `objectives/{objectiveId}`

```typescript
interface Objective {
  id: string;
  name: string;
  status: 'not-started' | 'in-progress' | 'completed';
  deadline?: Timestamp;

  areaId?: string;
  projectIds: string[];
  taskIds: string[];

  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

> **Relaciones 1:N:** El lado singular (`project.objectiveId`) es fuente de verdad para render, no el plural (`objective.projectIds`). `projects.filter(p => p.objectiveId === id)` evita drift visual cuando se reasigna un proyecto.

### Esquema: `embeddings/{noteId}`

```typescript
// Colección separada para no inflar los documentos de notas
interface NoteEmbedding {
  id: string; // Mismo ID que la nota
  vector: number[]; // 1536 dimensiones (text-embedding-3-small)
  model: string; // "text-embedding-3-small"
  contentHash: string; // Hash del contenido — regenerar si cambia
  createdAt: Timestamp;
}
```

---

## 4. Arquitectura de componentes (React)

### Estructura de carpetas

```
src/
├── app/                         # Rutas (React Router con createBrowserRouter)
│   ├── router.tsx               # Definición de rutas
│   ├── layout.tsx               # Layout compartido: Sidebar + Outlet + QuickCapture
│   ├── page.tsx                 # Dashboard
│   ├── not-found.tsx            # 404
│   ├── inbox/
│   ├── notes/
│   │   ├── page.tsx             # Lista de notas
│   │   ├── [noteId]/
│   │   │   └── page.tsx         # Editor de nota
│   │   └── graph/
│   │       └── page.tsx         # Vista de grafo
│   ├── tasks/
│   ├── projects/
│   │   ├── page.tsx
│   │   └── [projectId]/
│   │       └── page.tsx         # Detalle de proyecto
│   ├── objectives/
│   └── habits/
│
├── components/
│   ├── ui/                      # shadcn/ui components (Base UI)
│   ├── editor/                  # TipTap editor y extensiones
│   │   ├── NoteEditor.tsx
│   │   ├── NoteCard.tsx
│   │   ├── BacklinksPanel.tsx
│   │   └── extensions/
│   │       └── wikilink.ts      # [[wikilinks]] con autocompletado
│   ├── graph/                   # Visualización de grafo (Fase 4)
│   │   ├── KnowledgeGraph.tsx
│   │   └── GraphFilters.tsx
│   ├── capture/                 # Captura rápida
│   │   ├── QuickCapture.tsx     # Modal global (Alt+N)
│   │   └── InboxProcessor.tsx   # Vista de procesamiento AI (Fase 3)
│   ├── tasks/
│   │   ├── TaskCard.tsx
│   │   └── TaskInlineCreate.tsx
│   ├── projects/
│   │   ├── ProjectCard.tsx
│   │   ├── ProjectCreateModal.tsx
│   │   ├── ProjectNoteList.tsx
│   │   └── NoteLinkModal.tsx
│   ├── objectives/
│   │   ├── ObjectiveCard.tsx
│   │   └── ObjectiveCreateModal.tsx
│   ├── habits/
│   │   ├── HabitGrid.tsx
│   │   └── HabitRow.tsx
│   ├── dashboard/
│   │   ├── Greeting.tsx
│   │   ├── QuickCaptureButton.tsx
│   │   ├── InboxCard.tsx
│   │   ├── RecentNotesCard.tsx
│   │   ├── TasksTodayCard.tsx
│   │   ├── ProjectsActiveCard.tsx
│   │   ├── HabitsTodayCard.tsx
│   │   └── DailyDigest.tsx      # Resurfacing de notas (Fase 4)
│   └── layout/
│       ├── Sidebar.tsx
│       ├── CommandPalette.tsx   # ⌘K para búsqueda global (Fase 3)
│       └── Breadcrumbs.tsx
│
├── stores/                      # TinyBase stores (uno por entidad)
│   ├── notesStore.ts
│   ├── linksStore.ts
│   ├── inboxStore.ts
│   ├── tasksStore.ts
│   ├── projectsStore.ts
│   ├── objectivesStore.ts
│   └── habitsStore.ts
│
├── hooks/                       # Custom hooks
│   ├── useAuth.ts
│   ├── useStoreInit.ts          # Inicializa persisters + grace period
│   ├── useNote.ts               # Carga content desde Firestore (getDoc one-shot)
│   ├── useNoteSave.ts           # Autosave debounced + syncLinks
│   ├── useNoteSearch.ts         # Orama FTS
│   ├── useBacklinks.ts          # Join in-memory links + notes para títulos frescos
│   ├── useInbox.ts              # CRUD inbox + usePendingInboxCount
│   ├── useTasks.ts
│   ├── useProjects.ts
│   ├── useObjectives.ts
│   ├── useHabits.ts             # Toggle + helpers de fecha
│   ├── useQuickCapture.ts
│   └── useGraph.ts              # Datos del grafo (Fase 4)
│
├── lib/
│   ├── firebase.ts              # Config Firebase
│   ├── tinybase.ts              # createCustomPersister factory (merge: true)
│   ├── orama.ts                 # Config búsqueda
│   ├── formatDate.ts            # Fecha relativa, startOfDay, isSameDay
│   ├── editor/
│   │   ├── syncLinks.ts         # Diff + write links bidireccionales client-side
│   │   ├── extractLinks.ts      # Parser de [[wikilinks]] del contenido
│   │   └── serialize.ts         # TipTap JSON ↔ Markdown
│   └── ai/
│       ├── processInbox.ts      # Client para Cloud Function de inbox (Fase 3)
│       └── suggestLinks.ts      # Client para sugerencia de links (Fase 4)
│
├── types/                       # TypeScript interfaces
│   ├── note.ts
│   ├── link.ts
│   ├── inbox.ts
│   ├── task.ts
│   ├── project.ts
│   ├── objective.ts
│   ├── habit.ts
│   ├── area.ts
│   └── common.ts               # TaskStatus, ObjectiveStatus, Priority
│
└── functions/                   # Cloud Functions v2 (deploy separado)
    ├── src/
    │   ├── inbox/
    │   │   └── processInboxItem.ts   # onDocumentCreated → Claude Haiku (Fase 3)
    │   ├── notes/
    │   │   └── autoTagNote.ts        # onDocumentCreated → Claude Haiku (Fase 3)
    │   ├── embeddings/
    │   │   └── generateEmbedding.ts  # onDocumentWritten → OpenAI (Fase 4)
    │   └── resurfacing/
    │       └── dailyDigest.ts        # Scheduled: generar digest diario (Fase 4)
    └── package.json
```

> **Nota:** `syncBacklinks` Cloud Function fue eliminada del diseño. Los links bidireccionales se sincronizan 100% client-side en `syncLinks.ts` (decisión de diseño — ver sección 5, Flujo 2 y sección 10, D8).

---

## 5. Flujos clave

### Flujo 1: Captura rápida (< 3 segundos)

```
Usuario presiona Alt+N (global, cualquier ruta)
    │
    ▼
QuickCapture modal se abre (textarea enfocado)
    │
    ▼
Escribe texto → Enter
    │
    ▼
TinyBase guarda localmente (INSTANTÁNEO)
    │
    ▼
TinyBase persiste a Firestore (async, invisible, merge: true)
    │
    ▼
(Fase 3) Cloud Function se dispara (onDocumentCreated en inbox/)
    │
    ▼
Claude Haiku procesa:
  - Sugiere título
  - Sugiere tags
  - Sugiere tipo (nota/tarea/proyecto)
  - Genera resumen de 1 línea
  - (v1.1) Busca notas relacionadas por embeddings
    │
    ▼
Inbox item actualizado con aiResult
    │
    ▼
Usuario ve sugerencias en InboxProcessor
  - Acepta/modifica/descarta cada sugerencia
  - Un tap para convertir en nota/tarea/proyecto
```

> **Shortcut:** `Alt+N` en vez de `⌘+Shift+N` — este último choca con "Nueva ventana incógnito" de Chrome.

### Flujo 2: Escribir una nota atómica con links

```
Usuario abre editor de nota
    │
    ▼
useNote carga content desde Firestore (getDoc one-shot, no onSnapshot)
    │
    ▼
Escribe contenido en TipTap
    │
    ▼
Escribe [[ → autocompletado muestra notas existentes
    (via @tiptap/suggestion, popup con createPortal + virtual anchor, sin tippy.js)
    │
    ▼
Selecciona nota → se crea un [[wikilink]]
    │
    ▼
Al guardar (debounce 2s via useNoteSave):
  1. updateDoc a Firestore (content + contentPlain + title + updatedAt)
  2. notesStore.setPartialRow con metadata
  3. syncLinks() — client-side, NO Cloud Function:
     a. extractLinks() parsea el TipTap JSON
     b. Diff con links existentes en linksStore (filtrados por sourceId)
     c. Self-links (targetId === sourceId) se filtran
     d. setDoc para creates, deleteDoc para removes (en paralelo)
     e. Actualiza incomingLinkIds de targets afectados via setPartialRow
     f. Retorna { outgoingLinkIds, linkCount }
  4. BacklinksPanel muestra backlinks con títulos frescos
     (join in-memory useTable('notes'), no cache en doc de link)
    │
    ▼
(v1.1) Al guardar también:
  5. Se genera/actualiza embedding
  6. Se encuentran notas semánticamente similares
  7. Se sugieren links adicionales ("¿Conectar con...?")
```

### Flujo 3: Procesamiento AI del inbox (Fase 3)

```
Cloud Function: processInboxItem (onDocumentCreated)
    │
    ▼
Leer rawContent del inbox item
    │
    ▼
Llamar Claude Haiku con prompt estructurado:
  ┌─────────────────────────────────────────┐
  │ System: Eres un asistente de            │
  │ productividad. Analiza esta captura     │
  │ y clasifícala.                          │
  │                                         │
  │ User: "{rawContent}"                    │
  │                                         │
  │ Responde SOLO JSON:                     │
  │ {                                       │
  │   "title": "...",                       │
  │   "type": "note|task|project|trash",    │
  │   "tags": ["tag1", "tag2"],             │
  │   "summary": "Una línea",              │
  │   "priority": "low|medium|high",        │
  │   "paraType": "project|area|resource"   │
  │ }                                       │
  └─────────────────────────────────────────┘
    │
    ▼
(v1.1) Generar embedding → buscar top-5 notas similares
    │
    ▼
Guardar aiResult en el inbox item
    │
    ▼
Usuario revisa en InboxProcessor:
  - Ve sugerencia de Claude
  - Acepta → se crea nota/tarea/proyecto con un click
  - Modifica → edita antes de crear
  - Descarta → marca como dismissed
```

### Flujo 4: Resurfacing diario (Fase 4)

```
Cloud Function scheduled: dailyDigest (cada mañana, 6 AM)
    │
    ▼
Para el usuario:
  1. Consultar notas con FSRS score más alto
     (mayor necesidad de revisión)
  2. Consultar notas semánticamente cercanas
     a las editadas en últimos 3 días
  3. Pick aleatorio de notas con >3 links
     (nodos hub del grafo)
    │
    ▼
Generar digest: 3-5 notas con contexto
  - Por qué esta nota te puede interesar hoy
  - Links a notas relacionadas
    │
    ▼
Guardar en users/{userId}/digest/{date}
    │
    ▼
Dashboard muestra DailyDigest component
```

---

## 6. TinyBase como data layer

### ¿Por qué TinyBase y no Firestore directo?

| Problema con Firestore directo                | Cómo TinyBase lo resuelve                                |
| --------------------------------------------- | -------------------------------------------------------- |
| Latencia en reads (50-200ms)                  | Store in-memory, reads instantáneos                      |
| Sin reactividad granular                      | `useRow()`, `useCell()` re-renderizan solo lo que cambió |
| Offline requiere enablePersistence (limitado) | Store local + persister async a Firestore                |
| Reads se cobran por documento                 | Cache local, solo sync deltas                            |

### Configuración (custom persister)

TinyBase v8 **no tiene** `persister-firestore` nativo. Se usa `createCustomPersister` con una factory reutilizable:

```typescript
// src/lib/tinybase.ts
import { createCustomPersister } from 'tinybase/persisters';

// Factory que crea un persister bidireccional Firestore ↔ TinyBase
// - onSnapshot listener para Firestore → TinyBase (auto-load)
// - setDoc con merge: true para TinyBase → Firestore (auto-save)
// - merge: true es CRÍTICO — sin él, el persister borra campos
//   escritos fuera del store (ej: content de notas)
export function createFirestorePersister({ store, collectionPath, tableName }) {
  return createCustomPersister(store, {
    // ... implementación con onSnapshot + setDoc({ merge: true })
  });
}
```

### Uso en componentes React

```typescript
import { useRow, useCell, useRowIds } from 'tinybase/ui-react';

function NoteCard({ noteId }: { noteId: string }) {
  // Re-renderiza SOLO si title o linkCount cambian
  const title = useCell('notes', noteId, 'title');
  const linkCount = useCell('notes', noteId, 'linkCount');

  return (
    <div>
      <h3>{title}</h3>
      <span>{linkCount} conexiones</span>
    </div>
  );
}

function NotesList() {
  // Re-renderiza solo cuando se agregan/eliminan notas
  const noteIds = useRowIds('notes');
  return noteIds.map(id => <NoteCard key={id} noteId={id} />);
}
```

### Contenido largo — estrategia implementada

TinyBase solo guarda metadata (título, tags, flags). El `content` completo (TipTap JSON) se lee/escribe directo de Firestore solo cuando se abre el editor via `useNote` (getDoc one-shot) y `useNoteSave` (updateDoc debounced). Esto mantiene el store ligero y evita cargar contenido de todas las notas en memoria.

> **`useNoteSave` es el único punto que escribe `content`** a Firestore. Nuevas features que manipulen notas no deben tocar `content` por fuera de este flujo.

### Patterns clave descubiertos

- **Arrays como JSON strings:** `parseIds(row.projectIds)` / `stringifyIds([...ids, newId])` — TinyBase no soporta arrays nativos
- **`setPartialRow` > `setRow`:** `setRow` es full replace y causa race conditions en toggles rápidos (ej: dos hábitos clickeados seguidos). `setPartialRow` es commutative entre campos distintos
- **Local-first para toggles frecuentes:** `setPartialRow` local (sync) **antes** del `setDoc` Firestore (async) — evita races en clicks rápidos. Para updates de un solo campo donde la race es improbable, el orden inverso (`setDoc → setPartialRow`) es aceptable
- **Grace period:** 200ms para UI (evita skeleton flash), 1500ms para redirects por existencia de recurso (el `isInitializing` de 200ms no es suficiente para esperar hidratación completa de Firestore en full-reload por URL)
- **Creación de entidades — orden estricto:** `await setDoc(Firestore)` → `store.setRow(TinyBase)` → `navigate()`. Invertir causa race con `getDoc`/`useNote` en la página destino

---

## 7. TipTap — Editor de notas atómicas

### Extensiones

```
Extensiones base (implementadas):
├── StarterKit (bold, italic, headings, lists, code, etc.)
└── Placeholder ("Escribe una idea...")

Extensión custom (implementada):
└── WikiLink → [[nota]] con autocompletado
    ├── @tiptap/suggestion con char: '[[' (TipTap v3 acepta strings multi-char nativamente)
    ├── Popup: createPortal + virtual anchor del clientRect() (sin tippy.js)
    ├── Node schema: { type: 'wikilink', attrs: { noteId, noteTitle } }
    └── Click: event delegation con data-note-id → navigate

Extensiones custom (planeadas, Fase 4+):
├── SlashCommand      → / para insertar bloques
├── TagInline         → #tag reconocido inline
└── ProgressiveHighlight → Niveles de summarization visual
```

### Serialización

TipTap guarda contenido como JSON (ProseMirror document). Para `contentPlain` (búsqueda), se genera texto plano con `editor.getText()`. El título se extrae automáticamente de la primera línea del plain text en `useNoteSave`.

---

## 8. Búsqueda con Orama

### ¿Por qué Orama y no Algolia/MeiliSearch?

- **Client-side**: no necesita servidor adicional
- **~40KB**: tamaño mínimo
- **TypeScript-native**: tipado perfecto
- **Stemming y fuzzy**: búsqueda inteligente incluida
- **Faceted search**: filtrar por tipo, área, tags en una query

### Setup

```typescript
import { create, insert, search } from '@orama/orama';

const searchIndex = await create({
  schema: {
    title: 'string',
    contentPlain: 'string',
    paraType: 'enum',
    noteType: 'enum',
    tags: 'string[]',
  },
});
```

### Sync con TinyBase

Full rebuild del índice en cada `addTableListener('notes')`. ~50ms para ~100 notas — más simple que incremental y correcto para el corpus actual. Se optimiza a updates incrementales si el corpus crece >1K.

```typescript
// Pattern actual: full rebuild on table change
notesStore.addTableListener('notes', () => {
  // Destroy + recreate + insertMultiple de todas las notas
});
```

> **Fase 3** extenderá Orama a un index unificado con campo `_type: 'note' | 'task' | 'project'` para el Command Palette (⌘K).

---

## 9. Fases de desarrollo

### Fase 0: Setup ✅

- [x] Proyecto Vite + React 19 + TypeScript + Tailwind v4
- [x] Firebase project + Firestore rules + Auth (Google sign-in)
- [x] TinyBase v8 config + custom persister Firestore
- [x] Estructura de carpetas base
- [x] Deploy inicial a Firebase Hosting

### Fase 1: MVP — Captura + Notas + Links ✅

- [x] Quick Capture (modal, `Alt+N`)
- [x] TipTap editor con extensión WikiLink
- [x] Lista de notas (búsqueda con Orama)
- [x] Backlinks sidebar (notas que apuntan a la nota actual)
- [x] Clasificación PARA básica (select en nota)
- [x] Inbox view (lista simple, procesamiento manual)
- [x] Dashboard mínimo (notas recientes, inbox pendiente)

### Fase 2: Ejecución — Tareas + Proyectos + Objetivos + Hábitos ✅

- [x] CRUD de tareas con vistas (hoy, pronto, completadas)
- [x] CRUD de proyectos con status + detalle con tareas y notas vinculadas
- [x] Vincular tareas ↔ proyectos ↔ notas (bidireccional client-side)
- [x] Objetivos con progreso agregado vía proyectos
- [x] Habit tracker (grid semanal, checks diarios)
- [x] Dashboard expandido (5 cards)

### Fase 3: AI Pipeline (SPEC listo, pendiente implementar)

- [ ] Cloud Function: inbox processing con Claude Haiku
- [ ] InboxProcessor UI (revisar/aceptar sugerencias)
- [ ] Auto-tagging de notas nuevas
- [ ] Command Palette (⌘K) búsqueda global

### Fase 4: Grafo + Resurfacing

- [ ] Reagraph: visualización del knowledge graph
- [ ] Filtros de grafo (por área, por tipo, por fecha)
- [ ] Embeddings pipeline (Cloud Function + OpenAI)
- [ ] "Notas similares" sidebar
- [ ] ts-fsrs: resurfacing algorithm
- [ ] Daily Digest component en dashboard

### Fase 5: Multi-plataforma

- [ ] PWA optimizada (service worker, offline)
- [ ] Tauri wrapper (global hotkey, system tray)
- [ ] Capacitor wrapper (Share Intent Android)
- [ ] Chrome extension web clipper

---

## 10. Decisiones de diseño clave

### D1: ¿Por qué notas y tareas en la misma app?

Porque separar ejecución y conocimiento es el error que cometen la mayoría de tools. El poder está en vincular una nota a un proyecto, y que al abrir el proyecto veas el conocimiento relevante. Notion lo intenta pero con friction — aquí es nativo.

### D2: ¿Por qué no usar Firestore offline persistence nativa?

Porque es limitada: no soporta queries complejas offline, tiene un límite de cache, y no ofrece reactividad granular. TinyBase como capa intermedia da instantaneidad + control total del cache.

### D3: ¿Por qué Claude Haiku y no modelos locales para inbox?

Porque Haiku cuesta ~$0.25/1M tokens input y produce resultados consistentes sin GPU. Para procesamiento batch de inbox, la calidad/costo es imbatible. Modelos locales son plan B si los costos escalan (improbable para uso personal — ~100 items/mes ≈ centavos).

### D4: ¿Por qué empezar con PWA y no Tauri directo?

Porque la PWA ya funciona en desktop (Chrome) y mobile (Android). Tauri añade hotkeys globales y system tray — features de conveniencia, no de funcionalidad core. Mejor tener la app funcionando antes de optimizar la captura.

### D5: ¿Por qué TinyBase en vez de RxDB?

TinyBase es 13KB vs ~100KB de RxDB. Para single-user personal app, TinyBase es suficiente y mucho más simple. RxDB brilla en multi-user y sync complejo — overkill aquí.

### D6: ¿Por qué Orama en vez de FlexSearch?

Orama es TypeScript-native, tiene faceted search (filtrar por tipo + área en una query), y pesa ~40KB. FlexSearch es más rápido en benchmarks puros pero no tiene facets ni tipado nativo.

### D7: ¿Cómo manejar conflictos de sync?

Last-Writer-Wins (LWW) por campo. Para notas atómicas (documentos cortos editados por una persona), LWW es suficiente. TinyBase + Firestore persister ya implementa esto.

### D8: ¿Por qué links bidireccionales client-side y no Cloud Function?

Una Cloud Function `syncBacklinks` agregaría latencia, costo, y un segundo write path. El sync client-side en `syncLinks.ts` es síncrono con el save, determinístico, y los títulos se resuelven in-memory sin cache stale. Decisión validada en Fase 1 — no se justifica la complejidad backend para single-user.

---

## 11. Métricas de éxito

El sistema funciona si:

| Métrica                                | Target                          |
| -------------------------------------- | ------------------------------- |
| Tiempo de captura (idea → guardado)    | < 3 segundos                    |
| Notas creadas por semana               | > 5 (vs. ~1-2 en Notion actual) |
| % de notas con al menos 1 link         | > 50%                           |
| Inbox procesado en < 24h               | > 80% de items                  |
| Notas resurfaceadas y revisadas/semana | > 3                             |
| Notas reutilizadas en proyectos        | > 20%                           |

---

## 12. Riesgos y mitigaciones

| Riesgo                            | Probabilidad | Impacto | Mitigación                                                      |
| --------------------------------- | ------------ | ------- | --------------------------------------------------------------- |
| TinyBase no escala a >5K notas    | Baja         | Alto    | Content ya va directo a Firestore; migrar metadata si necesario |
| Costos de Claude/OpenAI escalan   | Baja         | Bajo    | Batch API (-50%), o migrar a modelos locales                    |
| Orama rebuild lento con >1K notas | Media        | Bajo    | Migrar a sync incremental (update/remove por row)               |
| Tauri mobile no madura            | Media        | Bajo    | Capacitor como alternativa probada                              |
| El grafo no aporta valor real     | Media        | Bajo    | Es fase 4 — para entonces ya hay datos para validar             |
| Over-engineering antes de validar | Alta         | Alto    | MVP en 4 semanas o menos. Si no lo uso diario, pivotar.         |

---

## 13. Gotchas técnicos

Conocimiento acumulado de las Fases 0–2. Toda sesión de desarrollo debe respetar estos patterns:

1. **`merge: true` en persister** — Sin merge, el persister borra campos escritos fuera del schema de TinyBase (ej: `content`). Precondición para toda feature que escriba a Firestore fuera del schema
2. **`setPartialRow` > `setRow` para updates** — `setRow` es full replace y causa race conditions en toggles rápidos. `setPartialRow` es commutative entre campos distintos
3. **Local-first para toggles** — `setPartialRow` sync → `setDoc` async. Invertir causa reads stale en clicks rápidos a campos distintos
4. **Grace 200ms para UI, 1500ms para redirects** — `isInitializing` del hook (200ms) no es suficiente para decidir "el recurso no existe → redirect" en full-reload por URL
5. **Creación de entidades — orden estricto** — `await setDoc(Firestore)` → `store.setRow` → `navigate`. Evita race con `getDoc` en la siguiente página
6. **Items de inbox nunca se borran** — Se marcan `processed`/`dismissed`, nunca `deleteDoc`
7. **Base-UI ≠ Radix** — Usa `data-open`/`data-closed` + `data-starting-style`/`data-ending-style`, NO `data-state="open"`. Las clases `animate-in`/`animate-out` de tw-animate-css no aplican
8. **`React.FormEvent` deprecated en React 19** — Usar inline arrow en `onSubmit` para que TypeScript infiera el tipo
9. **Tailwind v4 CSS-first** — Config en `@theme` dentro de `src/index.css`. NO existe `tailwind.config.ts`
10. **ESLint flat config** — `eslint.config.js`, NO `.eslintrc.cjs`
11. **Relaciones 1:N** — El lado singular (`project.objectiveId`) es fuente de verdad para render, no el plural (`objective.projectIds`)
12. **`Intl.DateTimeFormat('es', { weekday: 'narrow' })`** devuelve "X" para miércoles, no "M". Usar Intl directo, no hardcodear
13. **Self-links filtrados** — `targetId !== sourceId` en `syncLinks` para evitar polucionar el grafo
14. **Auto-save es el único punto que escribe `content`** — `useNoteSave` es el único lugar que toca el campo `content` en Firestore

---
