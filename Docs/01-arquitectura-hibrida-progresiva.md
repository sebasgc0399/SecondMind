# 🏗️ Arquitectura: Híbrida Progresiva — Guía Técnica

> Documento de referencia arquitectónica para SecondMind.
> Este documento NO es el SPEC — es la guía que informa al SPEC de cada fase.
> Actualizado tras Fases 0–3 con correcciones factuales del stack y patterns descubiertos.

---

## 1. Visión general

Un sistema de productividad y conocimiento personal que combina:
- **Ejecución** (tareas, proyectos, objetivos — lo que ya funciona en Notion)
- **Conocimiento vivo** (notas atómicas, links bidireccionales, grafo — lo que falta)
- **AI como copiloto** (procesamiento de inbox, auto-tagging, command palette, resurfacing)

### Principio rector
Construir lo mínimo que genere valor diario, iterar basándose en uso real. Cada fase debe ser usable por sí sola — no hay "todo o nada".

---

## 2. Stack técnico definitivo

### Core

| Capa | Tecnología | Justificación |
|------|-----------|---------------|
| **UI Framework** | React 19 + TypeScript strict | Stack conocido, máximo code-reuse |
| **Build** | Vite | Rápido, sin config extra |
| **Estilos** | Tailwind CSS v4 (CSS-first, `@theme` en `src/index.css`) | No existe `tailwind.config.ts` — toda la config vive en CSS |
| **Editor de notas** | TipTap (ProseMirror) | Headless, extensible, wikilinks custom |
| **Store reactivo** | TinyBase v8 | 13KB, hooks React. No tiene persister Firestore nativo — se usa `createCustomPersister` |
| **Backend** | Firebase (Firestore + Cloud Functions v2 + Auth + Storage + Hosting) | Stack conocido, $0 en free tier |
| **AI** | Cloud Functions v2 + Anthropic SDK (`@anthropic-ai/sdk`) → Claude Haiku (`claude-haiku-4-5-20251001`) | ~$0.02/mes para uso personal |
| **Búsqueda local** | Orama | ~40KB, TypeScript-native, FTS client-side. 2 indexes: notas (Fase 1) + global unificado (Fase 3) |
| **UI Components** | shadcn/ui (Base UI / `@base-ui/react`) | **No es Radix UI** — usa `data-open`/`data-closed` + `data-starting-style`/`data-ending-style`, NO `data-state` |
| **Routing** | React Router v7 (`createBrowserRouter`) | Client-side routing con layouts anidados |
| **Iconos** | lucide-react | Consistente, tree-shakeable |

### Fases posteriores

| Capa | Tecnología | Fase |
|------|-----------|------|
| **Grafo visual** | Reagraph → Sigma.js + Graphology | Fase 4 |
| **Embeddings** | OpenAI text-embedding-3-small | Fase 4 |
| **Resurfacing** | ts-fsrs (spaced repetition adaptado) | Fase 4 |
| **Desktop** | PWA → Tauri (hotkey + system tray) | Fase 5 |
| **Mobile** | PWA → Capacitor | Fase 5 |
| **Web clipper** | Chrome extension minimal | Fase 5 |
| **Búsqueda semántica** | Orama keyword + embeddings cosine (hybrid) | Fase 5+ |

---

## 3. Modelo de datos (Firestore)

### Principios del modelo
- **Notas son ciudadanos de primera clase** — no subcolecciones de proyectos
- **Links como colección separada** — IDs determinísticos `${sourceId}__${targetId}` para dedup trivial y queries bidireccionales eficientes
- **PARA como metadata** — no como estructura de carpetas
- **Títulos de links resueltos in-memory** — `useBacklinks` hace join con `useTable('notes')` en vez de cachear títulos en el doc de link. Cero stale titles, reactivo a cambios
- **Content de notas fuera de TinyBase** — el campo `content` (TipTap JSON) se lee/escribe directo de Firestore solo cuando se abre el editor. TinyBase solo maneja metadata. El persister usa `merge: true` para no sobrescribir `content` al sincronizar
- **AI fields flat en TinyBase** — TinyBase no soporta objetos anidados. Los campos de AI (`aiSuggestedTitle`, `aiSuggestedType`, etc.) se almacenan como strings flat en el store y se agrupan en objetos solo en el hook de mapping

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
│   └── embeddings/      → Vectores para búsqueda semántica (Fase 4)
```

### Esquema: `notes/{noteId}`

```typescript
interface Note {
  id: string;                    // crypto.randomUUID()
  title: string;                 // La idea, no el tema ("La fricción mata hábitos")
  content: string;               // TipTap JSON serializado (fuera del schema TinyBase, solo en Firestore)
  contentPlain: string;          // Texto plano para búsqueda (generado con editor.getText())
  
  // Clasificación PARA
  paraType: 'project' | 'area' | 'resource' | 'archive';
  
  // Zettelkasten
  noteType: 'fleeting' | 'literature' | 'permanent';
  source?: string;               // De dónde viene (libro, podcast, conversación, etc.)
  
  // Relaciones (IDs como JSON arrays serializados — parseIds/stringifyIds)
  projectIds: string[];          // Proyectos vinculados
  areaIds: string[];             // Áreas vinculadas
  tagIds: string[];              // Tags/temas
  
  // Links bidireccionales (referencia rápida — la verdad está en links/)
  outgoingLinkIds: string[];     // Notas a las que esta nota apunta
  incomingLinkIds: string[];     // Notas que apuntan a esta nota
  linkCount: number;             // Total de conexiones (para ranking)
  
  // Progressive Summarization
  summaryL1?: string;            // Pasajes clave resaltados
  summaryL2?: string;            // Lo más importante de L1
  summaryL3?: string;            // Resumen ejecutivo en tus palabras
  distillLevel: 0 | 1 | 2 | 3;  // Nivel actual de destilación
  
  // AI-generated (escritos por Cloud Function autoTagNote)
  aiTags?: string[];             // Tags sugeridos por Claude
  aiSummary?: string;            // Resumen de una línea generado
  aiProcessed: boolean;          // ¿Ya pasó por el pipeline AI?
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastViewedAt?: Timestamp;      // Para resurfacing (FSRS)
  viewCount: number;             // Engagement tracking
  isFavorite: boolean;
  isArchived: boolean;
}
```

### Esquema: `links/{sourceId__targetId}`

```typescript
interface NoteLink {
  id: string;                    // Determinístico: `${sourceId}__${targetId}`
  sourceId: string;              // Nota origen
  targetId: string;              // Nota destino
  
  // Contexto del link
  context?: string;              // Texto alrededor del [[wikilink]] en la nota origen
  linkType: 'explicit' | 'ai-suggested';  // ¿Lo creó el usuario o la AI?
  
  // Metadata
  createdAt: Timestamp;
  strength?: number;             // AI: similitud semántica (0-1)
  accepted: boolean;             // Para links AI-suggested: ¿el usuario aceptó?
}
```

> **Nota:** `sourceTitle` y `targetTitle` no se cachean en el doc de link. Se resuelven in-memory con join en `useBacklinks` → `useTable('notes')`. Esto elimina el stale-title problem sin round-trip.

### Esquema: `inbox/{itemId}`

```typescript
interface InboxItem {
  id: string;
  rawContent: string;            // Texto tal como se capturó
  source: 'quick-capture' | 'web-clip' | 'voice' | 'share-intent' | 'email';
  sourceUrl?: string;            // Si viene de web clipper
  
  // AI processing results (campos flat en TinyBase, objeto en hook)
  aiProcessed: boolean;
  // En Firestore/TinyBase: campos flat aiSuggestedTitle, aiSuggestedType, etc.
  // En el hook useInbox: se agrupan en objeto aiResult?: InboxAiResult
  aiResult?: {
    suggestedTitle: string;
    suggestedType: 'task' | 'note' | 'project' | 'reference' | 'trash';
    suggestedTags: string[];
    suggestedArea: AreaKey;       // Key del map AREAS
    summary: string;
    priority: Priority;
    relatedNoteIds: string[];    // Notas similares encontradas (Fase 4 embeddings)
  };
  
  // Estado
  status: 'pending' | 'processed' | 'dismissed';
  processedAs?: {
    type: 'note' | 'task' | 'project';
    resultId: string;            // ID de la nota/tarea/proyecto creado
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
  dueDate?: Timestamp;           // Cuándo hacerla
  
  // Relaciones
  projectId?: string;            // Singular — una tarea pertenece a UN proyecto
  areaId?: string;
  noteIds: string[];             // Notas vinculadas
  
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
  objectiveId?: string;          // Singular — un proyecto pertenece a UN objetivo
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
  id: string;                    // Mismo ID que la nota
  vector: number[];              // 1536 dimensiones (text-embedding-3-small)
  model: string;                 // "text-embedding-3-small"
  contentHash: string;           // Hash del contenido — regenerar si cambia
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
│   ├── layout.tsx               # Layout compartido: Sidebar + Outlet + QuickCapture + CommandPalette
│   ├── page.tsx                 # Dashboard
│   ├── not-found.tsx            # 404
│   ├── inbox/
│   │   ├── page.tsx             # Lista de inbox items
│   │   └── process/
│   │       └── page.tsx         # Inbox Processor one-by-one (Fase 3)
│   ├── notes/
│   │   ├── page.tsx             # Lista de notas
│   │   ├── [noteId]/
│   │   │   └── page.tsx         # Editor de nota
│   │   └── graph/
│   │       └── page.tsx         # Vista de grafo (Fase 4)
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
│   ├── capture/                 # Captura rápida + procesamiento AI
│   │   ├── QuickCapture.tsx     # Modal global (Alt+N)
│   │   ├── InboxItem.tsx        # Card con sugerencias AI inline (Fase 3)
│   │   ├── AiSuggestionCard.tsx # Display + edit de sugerencia (Fase 3)
│   │   └── InboxProcessorForm.tsx # Form one-by-one (Fase 3)
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
│       ├── CommandPalette.tsx   # Ctrl+K búsqueda global (Fase 3)
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
├── hooks/
│   ├── useAuth.ts
│   ├── useStoreInit.ts          # Inicializa persisters + grace period
│   ├── useNote.ts               # Carga content desde Firestore (getDoc one-shot)
│   ├── useNoteSave.ts           # Autosave debounced + syncLinks
│   ├── useNoteSearch.ts         # Orama FTS para notas
│   ├── useBacklinks.ts          # Join in-memory links + notes para títulos frescos
│   ├── useInbox.ts              # CRUD inbox + convertToNote/Task/Project + usePendingInboxCount
│   ├── useTasks.ts
│   ├── useProjects.ts
│   ├── useObjectives.ts
│   ├── useHabits.ts             # Toggle + helpers de fecha
│   ├── useQuickCapture.ts       # Context + Provider para Alt+N
│   ├── useCommandPalette.ts     # Context + Provider para Ctrl+K (Fase 3)
│   ├── useGlobalSearch.ts       # Orama index unificado multi-store (Fase 3)
│   └── useGraph.ts              # Datos del grafo (Fase 4)
│
├── lib/
│   ├── firebase.ts              # Config Firebase
│   ├── tinybase.ts              # createCustomPersister factory (merge: true)
│   ├── orama.ts                 # NOTES_SCHEMA + GLOBAL_SCHEMA + helpers
│   ├── formatDate.ts            # Fecha relativa, startOfDay, isSameDay
│   ├── editor/
│   │   ├── syncLinks.ts         # Diff + write links bidireccionales client-side
│   │   ├── extractLinks.ts      # Parser de [[wikilinks]] del contenido
│   │   └── serialize.ts         # TipTap JSON ↔ Markdown
│   └── ai/
│       └── suggestLinks.ts      # Client para sugerencia de links (Fase 4)
│
├── types/
│   ├── note.ts
│   ├── link.ts
│   ├── inbox.ts                 # InboxItem + InboxAiResult + ConvertOverrides
│   ├── task.ts
│   ├── project.ts
│   ├── objective.ts
│   ├── habit.ts
│   ├── area.ts
│   └── common.ts               # TaskStatus, ObjectiveStatus, Priority
│
└── functions/                   # Cloud Functions v2 (deploy separado, CommonJS, Node 20)
    ├── src/
    │   ├── index.ts             # Entry point, admin.initializeApp(), re-exports
    │   ├── inbox/
    │   │   └── processInboxItem.ts   # onDocumentCreated → Claude Haiku (Fase 3)
    │   ├── notes/
    │   │   └── autoTagNote.ts        # onDocumentWritten → Claude Haiku (Fase 3)
    │   ├── lib/
    │   │   └── parseJson.ts          # stripJsonFence helper compartido (Fase 3)
    │   ├── embeddings/
    │   │   └── generateEmbedding.ts  # onDocumentWritten → OpenAI (Fase 4)
    │   └── resurfacing/
    │       └── dailyDigest.ts        # Scheduled: generar digest diario (Fase 4)
    ├── package.json             # CommonJS, Node 20, firebase-functions ^7.2.5
    └── tsconfig.json
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
Cloud Function processInboxItem se dispara (onDocumentCreated en inbox/)
    │
    ▼
Claude Haiku procesa → escribe campos flat al doc:
  - aiSuggestedTitle, aiSuggestedType (note/task/project/trash)
  - aiSuggestedTags (JSON array), aiSuggestedArea (key de AREAS)
  - aiSummary, aiPriority, aiProcessed: true
    │
    ▼
Persister trae los campos al store → UI actualiza reactivamente
    │
    ▼
Usuario ve sugerencias en el card del inbox (inline)
  - Acepta con un click → crea nota/tarea/proyecto
  - Edita antes de aceptar → form inline
  - O procesa en batch via /inbox/process (one-by-one)
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
Cloud Function autoTagNote se dispara (onDocumentWritten)
  - Guard: if (aiProcessed || !contentPlain.trim()) return
  - Genera aiTags + aiSummary con Claude Haiku
  - Marca aiProcessed: true
    │
    ▼
(Fase 4) Al guardar también:
  5. Se genera/actualiza embedding
  6. Se encuentran notas semánticamente similares
  7. Se sugieren links adicionales ("¿Conectar con...?")
```

### Flujo 3: Procesamiento AI del inbox

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
  │ productividad personal. Analizas        │
  │ capturas rápidas y sugieres cómo        │
  │ clasificarlas. Áreas: Proyectos,        │
  │ Conocimiento, Finanzas, Salud,          │
  │ Pareja, Hábitos.                        │
  │                                         │
  │ User: Clasifica esta captura:           │
  │ "{rawContent}"                          │
  │                                         │
  │ Responde SOLO JSON:                     │
  │ { suggestedTitle, suggestedType,        │
  │   suggestedTags, suggestedArea,         │
  │   summary, priority }                   │
  └─────────────────────────────────────────┘
    │
    ▼
Validar JSON + fallbacks (suggestedArea null → 'conocimiento')
    │
    ▼
Escribir campos flat al doc + aiProcessed: true
    │
    ▼
Usuario revisa en /inbox o /inbox/process:
  - Ve sugerencia de Claude (tipo, título, tags, área, prioridad)
  - Acepta → crea nota/tarea/proyecto con campos pre-llenados
  - Edita → modifica antes de crear
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

| Problema con Firestore directo | Cómo TinyBase lo resuelve |
|-------------------------------|---------------------------|
| Latencia en reads (50-200ms) | Store in-memory, reads instantáneos |
| Sin reactividad granular | `useRow()`, `useCell()` re-renderizan solo lo que cambió |
| Offline requiere enablePersistence (limitado) | Store local + persister async a Firestore |
| Reads se cobran por documento | Cache local, solo sync deltas |

### Configuración (custom persister)

TinyBase v8 **no tiene** `persister-firestore` nativo. Se usa `createCustomPersister` con una factory reutilizable:

```typescript
// src/lib/tinybase.ts
import { createCustomPersister } from 'tinybase/persisters';

// Factory que crea un persister bidireccional Firestore ↔ TinyBase
// - onSnapshot listener para Firestore → TinyBase (auto-load)
// - setDoc con merge: true para TinyBase → Firestore (auto-save)
// - merge: true es CRÍTICO — sin él, el persister borra campos
//   escritos fuera del store (ej: content de notas, campos AI de CFs)
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
  const title = useCell('notes', noteId, 'title');
  const linkCount = useCell('notes', noteId, 'linkCount');
  
  return (
    <div>
      <h3>{title}</h3>
      <span>{linkCount} conexiones</span>
    </div>
  );
}
```

### Contenido largo — estrategia implementada

TinyBase solo guarda metadata. El `content` completo (TipTap JSON) se lee/escribe directo de Firestore solo cuando se abre el editor via `useNote` (getDoc one-shot) y `useNoteSave` (updateDoc debounced).

> **`useNoteSave` es el único punto que escribe `content`** a Firestore. Nuevas features que manipulen notas no deben tocar `content` por fuera de este flujo.

### Patterns clave descubiertos

- **Arrays como JSON strings:** `parseIds(row.projectIds)` / `stringifyIds([...ids, newId])` — TinyBase no soporta arrays nativos
- **`setPartialRow` > `setRow`:** `setRow` es full replace y causa race conditions en toggles rápidos. `setPartialRow` es commutative entre campos distintos
- **Local-first para toggles frecuentes:** `setPartialRow` local (sync) **antes** del `setDoc` Firestore (async)
- **Grace period:** 200ms para UI (skeleton flash), 1500ms para redirects/snapshots (hidratación Firestore en full-reload)
- **Creación de entidades — orden estricto:** `await setDoc(Firestore)` → `store.setRow(TinyBase)` → `navigate()`

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

### 2 indexes independientes

**Index de notas** (Fase 1) — usado por `useNoteSearch` en `/notes`:
```typescript
const NOTES_SCHEMA = {
  id: 'string', title: 'string', contentPlain: 'string',
  noteType: 'string', paraType: 'string', linkCount: 'number',
  updatedAt: 'number', isArchived: 'boolean',
};
```

**Index global unificado** (Fase 3) — usado por `useGlobalSearch` en Command Palette:
```typescript
const GLOBAL_SCHEMA = {
  id: 'string', _type: 'string',  // 'note' | 'task' | 'project'
  title: 'string', body: 'string',
  updatedAt: 'number', isArchived: 'boolean',
};
```

### Sync con TinyBase

Full rebuild del índice en cada `addTableListener`. ~50ms para ~300 docs. El index global tiene debounce de 100ms para agrupar los 3 listeners iniciales (notes + tasks + projects) en un solo rebuild.

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

### Fase 3: AI Pipeline ✅
- [x] Cloud Function `processInboxItem` con Claude Haiku
- [x] Schema `aiResult` flat en inboxStore + mapping en useInbox
- [x] InboxItem card con sugerencias AI inline (aceptar/editar/descartar)
- [x] Inbox Processor one-by-one (`/inbox/process`)
- [x] Command Palette (`Ctrl+K`) búsqueda global con Orama index unificado
- [x] Cloud Function `autoTagNote` con Claude Haiku (`onDocumentWritten`)

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
Porque Haiku cuesta ~$0.25/1M tokens input y produce resultados consistentes sin GPU. Para procesamiento batch de inbox, la calidad/costo es imbatible. Modelos locales son plan B si los costos escalan (improbable para uso personal — ~100 items/mes ≈ $0.02/mes).

### D4: ¿Por qué empezar con PWA y no Tauri directo?
Porque la PWA ya funciona en desktop (Chrome) y mobile (Android). Tauri añade hotkeys globales y system tray — features de conveniencia, no de funcionalidad core. Mejor tener la app funcionando antes de optimizar la captura.

### D5: ¿Por qué TinyBase en vez de RxDB?
TinyBase es 13KB vs ~100KB de RxDB. Para single-user personal app, TinyBase es suficiente y mucho más simple. RxDB brilla en multi-user y sync complejo — overkill aquí.

### D6: ¿Por qué Orama en vez de FlexSearch?
Orama es TypeScript-native, tiene faceted search (filtrar por tipo + área en una query), y pesa ~40KB. FlexSearch es más rápido en benchmarks puros pero no tiene facets ni tipado nativo.

### D7: ¿Cómo manejar conflictos de sync?
Last-Writer-Wins (LWW) por campo. Para notas atómicas (documentos cortos editados por una persona), LWW es suficiente. TinyBase + Firestore persister ya implementa esto.

### D8: ¿Por qué links bidireccionales client-side y no Cloud Function?
Una Cloud Function `syncBacklinks` agregaría latencia, costo, y un segundo write path. El sync client-side en `syncLinks.ts` es síncrono con el save, determinístico, y los títulos se resuelven in-memory sin cache stale.

### D9: ¿Por qué `onDocumentWritten` y no `onDocumentCreated` para auto-tagging?
Las notas creadas desde `/notes` arrancan con `contentPlain: ''` — el contenido llega en el primer auto-save (2s después). `onDocumentCreated` se dispara con content vacío y el guard hace early return. `onDocumentWritten` detecta el primer write con contenido. El guard `aiProcessed` evita re-procesamiento en writes subsiguientes.

### D10: ¿Por qué campos flat en vez de objeto anidado para aiResult del inbox?
TinyBase no soporta objetos anidados en su schema. Los campos `aiSuggestedTitle`, `aiSuggestedType`, etc. se almacenan flat en el store con defaults vacíos. El hook `useInbox` los agrupa en un objeto `InboxAiResult` solo al mappear — la hidratación bidireccional Firestore ↔ TinyBase funciona sin adaptadores.

---

## 11. Métricas de éxito

El sistema funciona si:

| Métrica | Target |
|---------|--------|
| Tiempo de captura (idea → guardado) | < 3 segundos |
| Notas creadas por semana | > 5 (vs. ~1-2 en Notion actual) |
| % de notas con al menos 1 link | > 50% |
| Inbox procesado en < 24h | > 80% de items |
| Notas resurfaceadas y revisadas/semana | > 3 |
| Notas reutilizadas en proyectos | > 20% |

---

## 12. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| TinyBase no escala a >5K notas | Baja | Alto | Content ya va directo a Firestore; migrar metadata si necesario |
| Costos de Claude/OpenAI escalan | Baja | Bajo | Batch API (-50%), o migrar a modelos locales |
| Orama rebuild lento con >1K notas | Media | Bajo | Migrar a sync incremental (update/remove por row) |
| Tauri mobile no madura | Media | Bajo | Capacitor como alternativa probada |
| El grafo no aporta valor real | Media | Bajo | Es Fase 4 — para entonces hay datos para validar |
| Over-engineering antes de validar | Alta | Alto | MVP en 4 semanas o menos. Si no lo uso diario, pivotar. |

---

## 13. Gotchas técnicos

Conocimiento acumulado de las Fases 0–3. Toda sesión de desarrollo debe respetar estos patterns:

**Fases 0–2:**

1. **`merge: true` en persister** — Sin merge, el persister borra campos escritos fuera del schema de TinyBase (ej: `content`, campos AI de CFs). Precondición para toda feature que escriba a Firestore fuera del schema
2. **`setPartialRow` > `setRow` para updates** — `setRow` es full replace y causa race conditions en toggles rápidos. `setPartialRow` es commutative entre campos distintos
3. **Local-first para toggles** — `setPartialRow` sync → `setDoc` async. Invertir causa reads stale en clicks rápidos a campos distintos
4. **Grace 200ms para UI, 1500ms para redirects** — `isInitializing` del hook (200ms) no es suficiente para decidir "el recurso no existe → redirect" en full-reload por URL
5. **Creación de entidades — orden estricto** — `await setDoc(Firestore)` → `store.setRow` → `navigate`. Evita race con `getDoc` en la siguiente página
6. **Items de inbox nunca se borran** — Se marcan `processed`/`dismissed`, nunca `deleteDoc`
7. **Base-UI ≠ Radix** — Usa `data-open`/`data-closed` + `data-starting-style`/`data-ending-style`, NO `data-state="open"`
8. **`React.FormEvent` deprecated en React 19** — Usar inline arrow en `onSubmit` para que TypeScript infiera el tipo
9. **Tailwind v4 CSS-first** — Config en `@theme` dentro de `src/index.css`. NO existe `tailwind.config.ts`
10. **ESLint flat config** — `eslint.config.js`, NO `.eslintrc.cjs`
11. **Relaciones 1:N** — El lado singular (`project.objectiveId`) es fuente de verdad para render, no el plural (`objective.projectIds`)
12. **`Intl.DateTimeFormat('es', { weekday: 'narrow' })`** devuelve "X" para miércoles, no "M". Usar Intl directo, no hardcodear
13. **Self-links filtrados** — `targetId !== sourceId` en `syncLinks` para evitar polucionar el grafo
14. **Auto-save es el único punto que escribe `content`** — `useNoteSave` es el único lugar que toca el campo `content` en Firestore

**Fase 3:**

15. **Claude Haiku devuelve `null` en campos individuales del JSON** para inputs basura (especialmente `suggestedArea`). Validar cada campo con fallback en las Cloud Functions — el fallback para área es `'conocimiento'`
16. **`isInitializing` (200ms) no alcanza para snapshots de datos en full reload** — Los persisters tardan más en hidratar. Para snapshots (ej: batch del InboxProcessor), observar `items.length > 0` como signal real o usar grace de 1500ms
17. **`onDocumentCreated` no cubre notas creadas vacías desde el editor** — Las notas desde `/notes` arrancan con `contentPlain: ''`. `autoTagNote` usa `onDocumentWritten` con guard `aiProcessed`
18. **Notas del inbox processor necesitan `aiProcessed: true` al crear** si vienen con tags aceptados del AI. Sin esto, `autoTagNote` sobrescribiría los tags que el usuario aceptó. `convertToNote` setea `aiProcessed: !!(overrides?.tags?.length > 0)`
19. **Orama v3 `search()` es sync at runtime** aunque el tipo diga `Results | Promise<Results>`. Se castea a `Results<AnyDocument>` y se usa en `useMemo`
20. **Firebase Functions v6 → v7 breaking change** — La v6 fallaba con timeout en el discovery protocol de la CLI. Usar `firebase-functions ^7.2.5`+
21. **`/lib/` en `.gitignore` de functions** necesita anchor (`/lib/`) para no ignorar `src/lib/` (sources) además de `lib/` (compiled)

---

> **Siguiente paso**: Implementar Fase 4 — Grafo + Resurfacing.
