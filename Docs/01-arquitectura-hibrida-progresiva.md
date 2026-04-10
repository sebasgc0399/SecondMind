# 🏗️ Arquitectura D: Híbrida Progresiva — Guía Técnica

> Documento de referencia arquitectónica para el Segundo Cerebro digital.
> Este documento NO es el SPEC — es la guía que informa al SPEC.

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

### Core (MVP)

| Capa | Tecnología | Justificación |
|------|-----------|---------------|
| **UI Framework** | React 19 + TypeScript strict | Stack conocido, máximo code-reuse |
| **Build** | Vite | Ya lo usas, rápido, sin config extra |
| **Estilos** | Tailwind CSS | Consistente con tus otros proyectos |
| **Editor de notas** | TipTap (ProseMirror) | Headless, extensible, wikilinks custom |
| **Store reactivo** | TinyBase | 13KB, hooks React, persister Firestore |
| **Backend** | Firebase (Firestore + Cloud Functions v2 + Auth + Storage) | Stack conocido, $0 en free tier |
| **Búsqueda local** | Orama | ~40KB, TypeScript-native, FTS client-side |
| **UI Components** | shadcn/ui | Ya lo usas, Tailwind-first |

### Fases posteriores

| Capa | Tecnología | Fase |
|------|-----------|------|
| **Grafo visual** | Reagraph → Sigma.js + Graphology | v1.0 → v2 |
| **AI inbox** | Cloud Functions → Claude Haiku | v1.0 |
| **Embeddings** | OpenAI text-embedding-3-small | v1.1 |
| **Resurfacing** | ts-fsrs (spaced repetition adaptado) | v1.1 |
| **Desktop** | PWA → Tauri (hotkey + system tray) | MVP → v1.1 |
| **Mobile** | PWA → Capacitor | v2 |
| **Web clipper** | Chrome extension minimal | v1.1 |
| **Búsqueda semántica** | Orama keyword + embeddings cosine (hybrid) | v2 |

---

## 3. Modelo de datos (Firestore)

### Principios del modelo
- **Notas son ciudadanos de primera clase** — no subcolecciones de proyectos
- **Links como colección separada** — permite queries bidireccionales eficientes
- **PARA como metadata** — no como estructura de carpetas
- **Denormalización intencional** — títulos de notas linkeadas se cachean para evitar reads extra

### Colecciones principales

```
firestore/
├── users/{userId}/
│   ├── notes/           → Notas atómicas (la entidad central)
│   ├── links/           → Conexiones bidireccionales entre notas
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
  id: string;                    // auto-generated
  title: string;                 // La idea, no el tema ("La fricción mata hábitos")
  content: string;               // TipTap JSON serializado
  contentPlain: string;          // Texto plano para búsqueda (generado de content)
  
  // Clasificación PARA
  paraType: 'project' | 'area' | 'resource' | 'archive';
  
  // Zettelkasten
  noteType: 'fleeting' | 'literature' | 'permanent';
  source?: string;               // De dónde viene (libro, podcast, conversación, etc.)
  
  // Relaciones (IDs denormalizados)
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
  
  // AI-generated
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

### Esquema: `links/{linkId}`

```typescript
interface NoteLink {
  id: string;
  sourceId: string;              // Nota origen
  targetId: string;              // Nota destino
  
  // Contexto del link
  context?: string;              // Texto alrededor del [[wikilink]] en la nota origen
  linkType: 'explicit' | 'ai-suggested';  // ¿Lo creó el usuario o la AI?
  
  // Denormalización para queries rápidas
  sourceTitle: string;           // Cache del título de la nota origen
  targetTitle: string;           // Cache del título de la nota destino
  
  // Metadata
  createdAt: Timestamp;
  strength?: number;             // AI: similitud semántica (0-1)
  accepted: boolean;             // Para links AI-suggested: ¿el usuario aceptó?
}
```

### Esquema: `inbox/{itemId}`

```typescript
interface InboxItem {
  id: string;
  rawContent: string;            // Texto tal como se capturó
  source: 'quick-capture' | 'web-clip' | 'voice' | 'share-intent' | 'email';
  sourceUrl?: string;            // Si viene de web clipper
  
  // AI processing results
  aiProcessed: boolean;
  aiResult?: {
    suggestedTitle: string;
    suggestedTags: string[];
    suggestedType: 'task' | 'note' | 'project' | 'reference' | 'trash';
    summary: string;
    relatedNoteIds: string[];    // Notas similares encontradas
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

### Esquema: `tasks/{taskId}`

```typescript
interface Task {
  id: string;
  name: string;
  status: 'inbox' | 'todo' | 'in-progress' | 'waiting' | 'completed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  date?: Timestamp;              // Cuándo hacerla
  
  // Relaciones
  projectId?: string;
  areaId?: string;
  objectiveId?: string;
  noteIds: string[];             // Notas vinculadas
  
  description?: string;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt?: Timestamp;
}
```

### Esquema: `projects/{projectId}`

```typescript
interface Project {
  id: string;
  name: string;
  status: 'inbox' | 'not-started' | 'in-progress' | 'on-hold' | 'completed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  
  // Relaciones
  areaId?: string;
  objectiveId?: string;
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
├── app/                         # Rutas y layouts
│   ├── layout.tsx
│   ├── page.tsx                 # Dashboard
│   ├── inbox/
│   ├── notes/
│   │   ├── page.tsx             # Lista de notas
│   │   ├── [noteId]/
│   │   │   └── page.tsx         # Editor de nota
│   │   └── graph/
│   │       └── page.tsx         # Vista de grafo
│   ├── tasks/
│   ├── projects/
│   ├── objectives/
│   └── habits/
│
├── components/
│   ├── ui/                      # shadcn/ui components
│   ├── editor/                  # TipTap editor y extensiones
│   │   ├── Editor.tsx
│   │   ├── extensions/
│   │   │   ├── wikilink.ts      # [[wikilinks]] con autocompletado
│   │   │   ├── slash-command.ts  # / commands
│   │   │   └── tag.ts           # #tag inline
│   │   └── menus/
│   │       ├── BubbleMenu.tsx
│   │       └── SlashMenu.tsx
│   ├── graph/                   # Visualización de grafo
│   │   ├── KnowledgeGraph.tsx
│   │   └── GraphFilters.tsx
│   ├── capture/                 # Captura rápida
│   │   ├── QuickCapture.tsx     # Modal/drawer de captura
│   │   └── InboxProcessor.tsx   # Vista de procesamiento AI
│   ├── dashboard/
│   │   ├── TodayTasks.tsx
│   │   ├── ActiveProjects.tsx
│   │   ├── DailyDigest.tsx      # Resurfacing de notas
│   │   └── HabitTracker.tsx
│   └── layout/
│       ├── Sidebar.tsx
│       ├── CommandPalette.tsx   # ⌘K para búsqueda global
│       └── Breadcrumbs.tsx
│
├── stores/                      # TinyBase stores
│   ├── notesStore.ts
│   ├── tasksStore.ts
│   ├── projectsStore.ts
│   ├── linksStore.ts
│   └── inboxStore.ts
│
├── hooks/                       # Custom hooks
│   ├── useNote.ts
│   ├── useSearch.ts             # Orama FTS
│   ├── useBacklinks.ts          # Links bidireccionales
│   ├── useGraph.ts              # Datos del grafo
│   └── useQuickCapture.ts
│
├── lib/
│   ├── firebase.ts              # Config Firebase
│   ├── tinybase.ts              # Config TinyBase + persisters
│   ├── orama.ts                 # Config búsqueda
│   ├── editor/
│   │   ├── serialize.ts         # TipTap JSON ↔ Markdown
│   │   └── extractLinks.ts     # Parser de [[wikilinks]] del contenido
│   └── ai/
│       ├── processInbox.ts      # Client para Cloud Function de inbox
│       └── suggestLinks.ts      # Client para sugerencia de links
│
├── types/                       # TypeScript interfaces (los esquemas de arriba)
│   ├── note.ts
│   ├── task.ts
│   ├── project.ts
│   └── inbox.ts
│
└── functions/                   # Cloud Functions v2 (deploy separado)
    ├── src/
    │   ├── inbox/
    │   │   └── processInboxItem.ts   # onDocumentCreated → Claude Haiku
    │   ├── embeddings/
    │   │   └── generateEmbedding.ts  # onDocumentWritten → OpenAI
    │   ├── links/
    │   │   └── syncBacklinks.ts      # Mantener links bidireccionales en sync
    │   └── resurfacing/
    │       └── dailyDigest.ts        # Scheduled: generar digest diario
    └── package.json
```

---

## 5. Flujos clave

### Flujo 1: Captura rápida (<2 segundos percibidos)

```
Usuario presiona ⌘+Shift+N (o toca "+")
    │
    ▼
QuickCapture modal se abre (campo de texto enfocado)
    │
    ▼
Escribe texto → Enter
    │
    ▼
TinyBase guarda localmente (INSTANTÁNEO)
    │
    ▼
TinyBase persiste a Firestore (async, invisible)
    │
    ▼
Cloud Function se dispara (onDocumentCreated en inbox/)
    │
    ▼
Claude Haiku procesa:
  - Sugiere título
  - Sugiere tags
  - Sugiere tipo (nota/tarea/proyecto)
  - Genera resumen de 1 línea
  - Busca notas relacionadas (v1.1: por embeddings)
    │
    ▼
Inbox item actualizado con aiResult
    │
    ▼
Usuario ve sugerencias en InboxProcessor
  - Acepta/modifica/descarta cada sugerencia
  - Un tap para convertir en nota/tarea/proyecto
```

### Flujo 2: Escribir una nota atómica con links

```
Usuario abre editor de nota
    │
    ▼
Escribe contenido en TipTap
    │
    ▼
Escribe [[ → autocompletado muestra notas existentes
    │
    ▼
Selecciona nota → se crea un [[wikilink]]
    │
    ▼
Al guardar:
  1. extractLinks() parsea el contenido
  2. Nuevos links se escriben en links/ collection
  3. Cloud Function syncBacklinks actualiza incomingLinkIds
     en las notas destino (bidireccional automático)
  4. El sidebar muestra "Backlinks" con todas las notas
     que apuntan a esta nota
    │
    ▼
(v1.1) Al guardar también:
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
  - Descarta → elimina del inbox
```

### Flujo 4: Resurfacing diario (v1.1)

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

### Configuración básica

```typescript
import { createStore } from 'tinybase';
import { createFirestorePersister } from 'tinybase/persisters/persister-firestore';
import { db } from './firebase';
import { collection } from 'firebase/firestore';

// 1. Crear store
const notesStore = createStore();

// 2. Definir tablas
notesStore.setTablesSchema({
  notes: {
    title: { type: 'string', default: '' },
    contentPlain: { type: 'string', default: '' },
    paraType: { type: 'string', default: 'resource' },
    noteType: { type: 'string', default: 'fleeting' },
    distillLevel: { type: 'number', default: 0 },
    linkCount: { type: 'number', default: 0 },
    isFavorite: { type: 'boolean', default: false },
    isArchived: { type: 'boolean', default: false },
    aiProcessed: { type: 'boolean', default: false },
    viewCount: { type: 'number', default: 0 },
  },
});

// 3. Conectar a Firestore
const persister = createFirestorePersister(
  notesStore,
  collection(db, `users/${userId}/notes`)
);

// 4. Iniciar sync bidireccional
await persister.startAutoLoad();  // Firestore → TinyBase
await persister.startAutoSave();  // TinyBase → Firestore
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

### Nota importante sobre contenido largo

TinyBase es un store in-memory. Para notas con contenido largo (TipTap JSON), hay dos estrategias:

**Estrategia A (simple, MVP):** Guardar `content` como celda en TinyBase. Para <2000 notas funciona bien.

**Estrategia B (escalable, v2):** TinyBase solo guarda metadata (título, tags, flags). El `content` completo se lee/escribe directo de Firestore solo cuando se abre el editor. Esto mantiene el store ligero.

---

## 7. TipTap — Editor de notas atómicas

### Extensiones necesarias

```
Extensiones base:
├── StarterKit (bold, italic, headings, lists, code, etc.)
├── Placeholder ("Escribe una idea...")
├── Typography (smart quotes, em-dash)
└── CharacterCount (feedback visual)

Extensiones custom (construir):
├── WikiLink          → [[nota]] con autocompletado
├── SlashCommand      → / para insertar bloques
├── TagInline         → #tag reconocido inline
└── ProgressiveHighlight → Niveles de summarization visual
```

### WikiLink extension — concepto

```typescript
// La extensión detecta [[ como trigger
// Muestra un popup con autocompletado de títulos de notas
// Al seleccionar, inserta un Node con el ID de la nota
// Al renderizar, muestra el título como link clickeable
// Al hacer click, navega a la nota

// Node schema:
{
  type: 'wikilink',
  attrs: {
    noteId: string,        // ID de la nota linkeada
    noteTitle: string,     // Título (cache para display)
  }
}
```

### Serialización

TipTap guarda contenido como JSON (ProseMirror document). Para `contentPlain` (búsqueda), se genera texto plano con `editor.getText()`. Para export Markdown, se usa `@tiptap/pm` con serializer custom.

---

## 8. Búsqueda con Orama

### ¿Por qué Orama y no Algolia/MeiliSearch?

- **Client-side**: no necesita servidor adicional
- **~40KB**: tamaño mínimo
- **TypeScript-native**: tipado perfecto
- **Stemming y fuzzy**: búsqueda inteligente incluida
- **Faceted search**: filtrar por tipo, área, tags en una query

### Setup conceptual

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

// Insertar notas del TinyBase store
for (const noteId of noteIds) {
  const note = notesStore.getRow('notes', noteId);
  await insert(searchIndex, { id: noteId, ...note });
}

// Buscar
const results = await search(searchIndex, {
  term: 'fricción hábitos',
  properties: ['title', 'contentPlain'],
  facets: { paraType: {}, noteType: {} },
  limit: 20,
});
```

### Sync con TinyBase

Usar listeners de TinyBase para mantener el índice Orama sincronizado:

```typescript
notesStore.addRowListener('notes', null, (store, tableId, rowId) => {
  const note = store.getRow('notes', rowId);
  // Actualizar o insertar en Orama
});
```

---

## 9. Fases de desarrollo

### Fase 0: Setup (1 semana)
- [ ] Proyecto Vite + React 19 + TypeScript + Tailwind
- [ ] Firebase project + Firestore rules + Auth (Google sign-in)
- [ ] TinyBase config + persister Firestore
- [ ] Estructura de carpetas base
- [ ] Deploy inicial a Firebase Hosting

### Fase 1: MVP — Captura + Notas + Links (3-4 semanas)
- [ ] Quick Capture (modal, ⌘+Shift+N)
- [ ] TipTap editor con extensión WikiLink
- [ ] Lista de notas (búsqueda con Orama)
- [ ] Backlinks sidebar (notas que apuntan a la nota actual)
- [ ] Clasificación PARA básica (select en nota)
- [ ] Inbox view (lista simple)
- [ ] Dashboard mínimo (notas recientes, tareas pendientes)

### Fase 2: Ejecución — Tareas + Proyectos (2-3 semanas)
- [ ] CRUD de tareas con vistas (hoy, pronto, completadas)
- [ ] CRUD de proyectos con status
- [ ] Vincular tareas ↔ proyectos ↔ notas
- [ ] Objetivos básicos
- [ ] Habit tracker (checks diarios)

### Fase 3: AI Pipeline (2-3 semanas)
- [ ] Cloud Function: inbox processing con Claude Haiku
- [ ] InboxProcessor UI (revisar/aceptar sugerencias)
- [ ] Auto-tagging de notas nuevas
- [ ] Command Palette (⌘K) búsqueda global

### Fase 4: Grafo + Resurfacing (2-3 semanas)
- [ ] Reagraph: visualización del knowledge graph
- [ ] Filtros de grafo (por área, por tipo, por fecha)
- [ ] Embeddings pipeline (Cloud Function + OpenAI)
- [ ] "Notas similares" sidebar
- [ ] ts-fsrs: resurfacing algorithm
- [ ] Daily Digest component en dashboard

### Fase 5: Multi-plataforma (3-4 semanas)
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
| TinyBase no escala a >5K notas | Baja | Alto | Migrar metadata a TinyBase, content a Firestore directo |
| TipTap WikiLink extension compleja | Media | Medio | Empezar con link manual (paste ID), autocompletado en v2 |
| Costos de Claude/OpenAI escalan | Baja | Bajo | Batch API (-50%), o migrar a modelos locales |
| Tauri mobile no madura | Media | Bajo | Capacitor como alternativa probada |
| El grafo no aporta valor real | Media | Bajo | Es fase 4 — para entonces ya hay datos para validar |
| Over-engineering antes de validar | Alta | Alto | MVP en 4 semanas o menos. Si no lo uso diario, pivotar. |

---
