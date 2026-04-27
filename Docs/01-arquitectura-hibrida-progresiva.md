# 🏗️ Arquitectura: Híbrida Progresiva — Guía Técnica

> Documento de referencia arquitectónica para SecondMind.
> Este documento NO es el SPEC — es la guía que informa al SPEC de cada fase.
> Actualizado tras Fases 0–5.2 con correcciones factuales del stack y patterns descubiertos.

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

| Capa                | Tecnología                                                                                                        | Justificación                                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **UI Framework**    | React 19 + TypeScript strict                                                                                      | Stack conocido, máximo code-reuse                                                                               |
| **Build**           | Vite                                                                                                              | Rápido, sin config extra                                                                                        |
| **Estilos**         | Tailwind CSS v4 (CSS-first, `@theme` en `src/index.css`)                                                          | No existe `tailwind.config.ts` — toda la config vive en CSS                                                     |
| **Editor de notas** | TipTap (ProseMirror)                                                                                              | Headless, extensible, wikilinks custom                                                                          |
| **Store reactivo**  | TinyBase v8                                                                                                       | 13KB, hooks React. No tiene persister Firestore nativo — se usa `createCustomPersister`                         |
| **Backend**         | Firebase (Firestore + Cloud Functions v2 + Auth + Storage + Hosting)                                              | Stack conocido, $0 en free tier                                                                                 |
| **AI**              | Cloud Functions v2 + Anthropic SDK → Claude Haiku (`claude-haiku-4-5-20251001`) con tool use + schema enforcement | ~$0.02/mes para uso personal. JSON garantizado por schema, no por prompt                                        |
| **Búsqueda local**  | Orama                                                                                                             | ~40KB, TypeScript-native, FTS client-side. 2 indexes: notas (Fase 1) + global unificado (Fase 3)                |
| **UI Components**   | shadcn/ui (Base UI / `@base-ui/react`)                                                                            | **No es Radix UI** — usa `data-open`/`data-closed` + `data-starting-style`/`data-ending-style`, NO `data-state` |
| **Routing**         | React Router v7 (`createBrowserRouter`)                                                                           | Client-side routing con layouts anidados                                                                        |
| **Iconos**          | lucide-react                                                                                                      | Consistente, tree-shakeable                                                                                     |
| **Grafo visual**    | Reagraph (WebGL, force-directed 2D)                                                                               | React-native, API declarativa `<GraphCanvas>`, suficiente para <500 nodos                                       |
| **Embeddings**      | Cloud Functions v2 + OpenAI SDK → `text-embedding-3-small` (1536 dims)                                            | ~$0.002/500 notas. Guard por `contentHash` SHA-256 evita regeneraciones                                         |
| **Resurfacing**     | ts-fsrs (~15KB, client-side)                                                                                      | Spaced repetition adaptado a knowledge notes. 2 ratings (Again/Good), opt-in por nota                           |

### Multi-plataforma (Fase 5)

| Capa            | Tecnología                                                                                                                      | Fase | Estado |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---- | ------ |
| **PWA**         | `vite-plugin-pwa` + Workbox (`maximumFileSizeToCacheInBytes: 4MB` para Reagraph)                                                | 5.0  | ✅     |
| **Desktop**     | Tauri v2 (Rust, WebView2) — system tray, `Ctrl+Shift+Space` global, single-instance, autostart, window-state                    | 5.1  | ✅     |
| **Mobile**      | Capacitor 8 (Android) — Google Sign-In nativo (`@capgo/capacitor-social-login`), Share Intent (`@capgo/capacitor-share-target`) | 5.2  | ✅     |
| **Web clipper** | Chrome Extension MV3 + CRXJS — `chrome.identity` Firebase auth, `firestore/lite` writes                                         | 5.0  | ✅     |

### Posibles iteraciones futuras

| Capa                   | Tecnología                                                      | Notas                 |
| ---------------------- | --------------------------------------------------------------- | --------------------- |
| **Búsqueda semántica** | Orama keyword + embeddings cosine (hybrid)                      | Pendiente             |
| **Grafo avanzado**     | Sigma.js + Graphology (migración desde Reagraph si >1000 nodos) | Pendiente             |
| **iOS**                | Capacitor (requiere macOS + Apple Developer ID $99/año)         | Fuera de scope actual |

### Dependencias clave con historia

Versiones específicas y notas operativas (gotchas mini que justifican la elección o la versión pineada). Movido desde `Spec/ESTADO-ACTUAL.md` para mantener ese archivo como snapshot operativo.

| Paquete                         | Versión   | Nota                                                                               |
| ------------------------------- | --------- | ---------------------------------------------------------------------------------- |
| `firebase-functions`            | `^7.2.5`  | v6 fallaba con timeout en discovery                                                |
| `@anthropic-ai/sdk`             | `^0.40.1` | Soporta `tools` + `tool_choice` para schema enforcement                            |
| `tinybase`                      | v8        | Sin `persister-firestore` nativo. Custom persister con `createCustomPersister`     |
| `@orama/orama`                  | v3        | `search()` es sync at runtime aunque el tipo diga `Promise`                        |
| `reagraph`                      | latest    | WebGL graph viz (Three.js). Compatible React 19. ~1.3MB bundle                     |
| `openai`                        | `^4.85`   | SDK para embeddings en CF `generateEmbedding`. Solo en `src/functions/`            |
| `ts-fsrs`                       | latest    | FSRS spaced repetition. Client-side (~15KB)                                        |
| `vite-plugin-pwa`               | `^1.2.0`  | Requiere `--legacy-peer-deps` con Vite 8. `generateSW` + `autoUpdate`              |
| `@crxjs/vite-plugin`            | `^2.4.0`  | Named export `{ crx }`. Soporta Vite 8 + MV3 + React + HMR                         |
| `@tauri-apps/cli`               | `^2.10.1` | CLI para scaffold/dev/build. Requiere Rust + MSVC Build Tools en Windows           |
| `@tauri-apps/api`               | `^2.10.1` | Window management, webview, event system. Import dinámico para no romper build web |
| `tauri-plugin-global-shortcut`  | `2.3.1`   | Registro OS-level de hotkeys. Rust-side con `with_handler` en `setup()` (post F7)  |
| `tauri-plugin-autostart`        | `2.5.1`   | Autostart con Windows (registry key HKCU Run)                                      |
| `tauri-plugin-window-state`     | `2.4.1`   | Persiste pos/size. `.with_denylist(&["capture"])` para excluir la ventana efímera  |
| `tauri-plugin-single-instance`  | `2.4.1`   | Previene múltiples procesos simultáneos. Crítico con autostart                     |
| `@capacitor/core`               | `^8.3.0`  | Runtime Cap 8. Requiere Node 22+ y Android Studio Otter+                           |
| `@capacitor/cli`                | `^8.3.0`  | `cap run android` falla en Windows por `gradlew` sin `.bat` (workaround en SETUP)  |
| `@capacitor/android`            | `^8.3.0`  | Plataforma Android. `minSdk 24`, `compileSdk 36`, `targetSdk 36`                   |
| `@capacitor/splash-screen`      | `^8.0.1`  | `launchAutoHide: false` + `SplashScreen.hide()` manual                             |
| `@capgo/capacitor-social-login` | `^8.3.14` | Google Sign-In nativo. Sucesor oficial del abandonado `codetrix-studio`            |
| `@capgo/capacitor-share-target` | `^8.0.27` | Listener `shareReceived` + intent-filter SEND. Único con soporte Cap 8 free        |

---

## 3. Modelo de datos (Firestore)

### Principios del modelo

- **Notas son ciudadanos de primera clase** — no subcolecciones de proyectos
- **Links como colección separada** — IDs determinísticos `${sourceId}__${targetId}` para dedup trivial y queries bidireccionales eficientes
- **PARA como metadata** — no como estructura de carpetas
- **Títulos de links resueltos in-memory** — `useBacklinks` hace join con `useTable('notes')` en vez de cachear títulos en el doc de link. Cero stale titles, reactivo a cambios
- **Content de notas fuera de TinyBase** — el campo `content` (TipTap JSON) se lee/escribe directo de Firestore solo cuando se abre el editor. TinyBase solo maneja metadata. El persister usa `merge: true` para no sobrescribir `content` al sincronizar
- **AI fields flat en TinyBase** — TinyBase no soporta objetos anidados. Los campos de AI (`aiSuggestedTitle`, `aiSuggestedType`, etc.) se almacenan como strings flat en el store y se agrupan en objetos solo en el hook de mapping
- **Timestamps como `number` (UNIX ms)** — aunque Firestore serializa `Timestamp` nativo al leer/escribir, los types del proyecto (`src/types/*.ts`) usan `number` por consistencia con TinyBase, que solo acepta primitivos (`string | number | boolean`). Los schemas en este documento usan `number` para reflejar la representación TS, no el wire format Firestore

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
  // L1 (bold) y L2 (highlight) viven como marks en `content` (TipTap JSON),
  // no como strings extraídos. distillLevel se deriva vía computeDistillLevel.
  summaryL3?: string; // Resumen ejecutivo en tus palabras
  distillLevel: 0 | 1 | 2 | 3; // Nivel actual de destilación

  // AI-generated (escritos por Cloud Function autoTagNote via tool use)
  aiTags?: string[]; // Tags sugeridos por Claude
  aiSummary?: string; // Resumen de una línea generado
  aiProcessed: boolean; // ¿Ya pasó por el pipeline AI?

  // FSRS — Spaced Repetition (Fase 4, opt-in por nota)
  fsrsState?: string; // Card de ts-fsrs serializado como JSON string
  fsrsDue?: number; // Timestamp de próxima revisión (para queries eficientes)
  fsrsLastReview?: number; // Timestamp de última revisión

  // Metadata
  createdAt: number;
  updatedAt: number;
  lastViewedAt?: number; // Para resurfacing (FSRS)
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
  createdAt: number;
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
  source: 'quick-capture' | 'web-clip' | 'desktop-capture' | 'share-intent' | 'voice' | 'email';
  sourceUrl?: string; // Si viene de web clipper

  // AI processing results (campos flat en TinyBase, objeto en hook)
  aiProcessed: boolean;
  // En Firestore/TinyBase: campos flat aiSuggestedTitle, aiSuggestedType, etc.
  // En el hook useInbox: se agrupan en objeto aiResult?: InboxAiResult
  // Schema enforcement via tool use — valores garantizados por enum/required (Fase 3.1)
  aiResult?: {
    suggestedTitle: string;
    suggestedType: 'task' | 'note' | 'project' | 'trash'; // enum enforced por schemas.ts
    suggestedTags: string[];
    suggestedArea: AreaKey; // Key del map AREAS — enum enforced, nunca null
    summary: string;
    priority: Priority; // enum enforced
    relatedNoteIds: string[]; // Notas similares encontradas (Fase 4 embeddings)
  };

  // Estado
  status: 'pending' | 'processed' | 'dismissed';
  processedAs?: {
    type: 'note' | 'task' | 'project';
    resultId: string; // ID de la nota/tarea/proyecto creado
  };

  createdAt: number;
}
```

> **Items nunca se borran físicamente** — se marcan `processed` o `dismissed`. Preserva historial para undo o auditoría futura.

> **Sobre `source`:** `'quick-capture'` (modal Alt+N), `'web-clip'` (Chrome Extension), `'share-intent'` (Capacitor Android) y `'desktop-capture'` (ventana Tauri) tienen setter runtime. `'voice'` y `'email'` están declarados como aspiracionales — no hay entry point implementado al momento, se consumen cuando la feature exista.

### Esquema: `tasks/{taskId}`

```typescript
interface Task {
  id: string;
  name: string;
  status: 'inbox' | 'in-progress' | 'waiting' | 'delegated' | 'completed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: number; // Cuándo hacerla

  // Relaciones
  projectId?: string; // Singular — una tarea pertenece a UN proyecto
  areaId?: string;
  objectiveId?: string; // Singular — una tarea puede pertenecer a UN objetivo
  noteIds: string[]; // Notas vinculadas

  description?: string;
  isArchived: boolean;

  createdAt: number;
  updatedAt: number;
  completedAt?: number;
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
  startDate?: number;
  deadline?: number;

  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
}
```

> **Progreso derivado:** % completado = tareas completadas / total de tareas donde `task.projectId === project.id`. Cross-store reactivo en UI.

### Esquema: `objectives/{objectiveId}`

```typescript
interface Objective {
  id: string;
  name: string;
  status: 'not-started' | 'in-progress' | 'completed';
  deadline?: number;

  areaId?: string;
  projectIds: string[];
  taskIds: string[];

  createdAt: number;
  updatedAt: number;
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
  createdAt: number;
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
│   │   ├── SimilarNotesPanel.tsx  # Top 5 notas por cosine similarity (Fase 4)
│   │   ├── ReviewBanner.tsx       # FSRS: activar/revisar/próxima fecha (Fase 4)
│   │   └── extensions/
│   │       └── wikilink.ts      # [[wikilinks]] con autocompletado
│   ├── graph/                   # Visualización de grafo (Fase 4)
│   │   ├── KnowledgeGraph.tsx   # Canvas Reagraph + hover/click/dblclick
│   │   ├── GraphNodePanel.tsx   # Panel flotante al click en nodo
│   │   └── GraphFilters.tsx     # Panel colapsable: paraType + noteType + minLinks
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
│   │   └── DailyDigest.tsx      # Resurfacing: review FSRS + hubs (Fase 4)
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
├── infra/                       # Capa 3: adaptadores entre componentes y backend (F10+)
│   └── repos/                   # Factory createFirestoreRepo + repos por entidad
│       ├── baseRepo.ts          # Factory genérico con optimistic update
│       ├── baseRepo.test.ts     # Tests del factory (Vitest)
│       ├── tasksRepo.ts
│       ├── notesRepo.ts         # + saveContent (content-split: content solo en Firestore)
│       ├── projectsRepo.ts
│       ├── objectivesRepo.ts
│       ├── habitsRepo.ts
│       └── inboxRepo.ts         # + orquestación convertToNote/Task/Project
│
├── hooks/
│   ├── useAuth.ts
│   ├── useAutoUpdate.ts         # Tauri/Capacitor updater (Fase 5.1/5.2+)
│   ├── useStoreInit.ts          # Inicializa persisters + delTable pre/post (F11)
│   ├── useStoreHydration.ts     # Context + Provider, retorna { isHydrating } (F11)
│   ├── useNote.ts               # Carga content desde Firestore (getDoc one-shot)
│   ├── useNoteSave.ts           # Autosave debounced → notesRepo.saveContent (F10)
│   ├── useNoteSearch.ts         # Orama FTS para notas
│   ├── useHybridSearch.ts       # Búsqueda híbrida Orama BM25 + embeddings cosine (F3)
│   ├── useBacklinks.ts          # Join in-memory links + notes para títulos frescos
│   ├── useInbox.ts              # CRUD via inboxRepo + convertToNote/Task/Project + usePendingInboxCount
│   ├── useTasks.ts              # Delega persistencia a tasksRepo (F10)
│   ├── useProjects.ts           # Delega persistencia a projectsRepo (F10)
│   ├── useObjectives.ts         # Delega persistencia a objectivesRepo (F10)
│   ├── useHabits.ts             # Delega persistencia a habitsRepo (F10) + helpers de fecha
│   ├── useQuickCapture.ts       # Context + Provider para Alt+N
│   ├── useCommandPalette.ts     # Context + Provider para Ctrl+K (Fase 3)
│   ├── useGlobalSearch.ts       # Orama index unificado multi-store (Fase 3)
│   ├── useGraph.ts              # Datos del grafo + filtros (Fase 4)
│   ├── useSimilarNotes.ts       # Cosine similarity embeddings (Fase 4)
│   ├── useResurfacing.ts        # FSRS state + reviewNote() (Fase 4)
│   ├── useDailyDigest.ts        # Digest client-side: review + hubs (Fase 4)
│   ├── useTheme.ts              # Dark mode / paleta (F6)
│   ├── useMediaQuery.ts         # Responsive helpers (F1)
│   ├── useOnlineStatus.ts       # Detecta conectividad (PWA/offline)
│   ├── useInstallPrompt.ts      # PWA install prompt
│   ├── useCloseToTray.ts        # Close-to-tray handler (Fase 5.1)
│   └── useShareIntent.ts        # Share Intent listener → Quick Capture (Fase 5.2)
│
├── lib/
│   ├── firebase.ts              # Config Firebase
│   ├── tinybase.ts              # createCustomPersister factory (merge: true)
│   ├── orama.ts                 # NOTES_SCHEMA + GLOBAL_SCHEMA + helpers
│   ├── formatDate.ts            # Fecha relativa, startOfDay, isSameDay
│   ├── embeddings.ts            # cosineSimilarity + fetchEmbedding/All (Fase 4)
│   ├── fsrs.ts                  # Wrapper ts-fsrs: scheduleReview, serialize/deserialize (Fase 4)
│   ├── tauri.ts                 # isTauri() helper + showMainWindow/hideCurrentWindow (Fase 5.1)
│   ├── tauriAuth.ts             # signInWithTauri: OAuth Desktop flow PKCE (Fase 5.1)
│   ├── capacitor.ts             # isCapacitor() helper via Capacitor.isNativePlatform() (Fase 5.2)
│   ├── capacitorAuth.ts         # initCapacitorAuth + signInWithCapacitor: SocialLogin → signInWithCredential (Fase 5.2)
│   └── editor/
│       ├── syncLinks.ts         # Diff + write links bidireccionales client-side
│       ├── extractLinks.ts      # Parser de [[wikilinks]] del contenido
│       └── serialize.ts         # TipTap JSON ↔ Markdown
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
    │   │   └── processInboxItem.ts   # onDocumentCreated → Claude Haiku tool use (Fase 3 + 3.1)
    │   ├── notes/
    │   │   └── autoTagNote.ts        # onDocumentWritten → Claude Haiku tool use (Fase 3 + 3.1)
    │   ├── lib/
    │   │   └── schemas.ts            # JSON Schemas compartidos para tool use (Fase 3.1)
    │   ├── embeddings/
    │   │   └── generateEmbedding.ts  # onDocumentWritten → OpenAI text-embedding-3-small (Fase 4)
    │   └── search/
    │       └── embedQuery.ts         # CF callable: embed de query para búsqueda híbrida (F3)
    ├── package.json             # CommonJS, Node 20, firebase-functions ^7.2.5
    └── tsconfig.json

# Multi-plataforma (Fase 5)
capacitor.config.ts              # appId, appName, webDir, server.androidScheme: 'https', plugins
android/                         # Generado por `npx cap add android` (Gradle project)
├── app/src/main/
│   ├── AndroidManifest.xml      # intent-filter ACTION_SEND text/*, launchMode singleTask
│   ├── java/.../MainActivity.java  # implements ModifiedMainActivityForSocialLoginPlugin
│   └── res/                     # drawable/ (ícono VectorDrawable, splash), values/ (strings, colors)
└── variables.gradle             # minSdk 24, compileSdk 36, targetSdk 36

src-tauri/                       # Tauri v2 desktop app (Fase 5.1)
├── src/
│   ├── lib.rs                   # Plugins: tray, global-shortcut, autostart, window-state, single-instance
│   └── tray.rs                  # System tray menu: Abrir, Captura rápida, Autostart, Salir
├── Cargo.toml
└── tauri.conf.json              # Bundle MSI+NSIS, identifier com.secondmind.app

extension/                       # Chrome Extension MV3 (Fase 5.0)
├── src/                         # Popup + content script + background
└── manifest.json                # chrome.identity + firestore/lite
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
Claude Haiku procesa via tool use (classify_inbox + INBOX_CLASSIFICATION_SCHEMA):
  - Schema enforcement garantiza JSON válido con valores de enum
  - Escribe campos flat: aiSuggestedTitle, aiSuggestedType, aiSuggestedTags,
    aiSuggestedArea, aiSummary, aiPriority, aiProcessed: true
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
Al guardar (debounce 2s via useNoteSave → notesRepo.saveContent desde F10):
  1. setPartialRow sync a TinyBase con metadata (sin content — el content vive solo en Firestore)
  2. await updateDoc async a Firestore con content + metadata (merge: true)
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
  - Genera aiTags + aiSummary con Claude Haiku via tool use (tag_note + NOTE_TAGGING_SCHEMA)
  - Marca aiProcessed: true
    │
    ▼
Cloud Function generateEmbedding se dispara (onDocumentWritten)
  - Guard: if (!contentPlain.trim()) return + comparar contentHash con existente
  - Genera vector 1536 dims con OpenAI text-embedding-3-small
  - Guarda en embeddings/{noteId} con contentHash SHA-256
    │
    ▼
Editor sidebar muestra:
  5. SimilarNotesPanel — top 5 notas por cosine similarity de embeddings
  6. ReviewBanner — si la nota tiene FSRS activo y está due
```

### Flujo 3: Procesamiento AI del inbox

```
Cloud Function: processInboxItem (onDocumentCreated)
    │
    ▼
Leer rawContent del inbox item
    │
    ▼
Llamar Claude Haiku con tool use:
  ┌─────────────────────────────────────────┐
  │ System: Eres un asistente de            │
  │ productividad personal. Analizas        │
  │ capturas rápidas y sugieres cómo        │
  │ clasificarlas. Áreas: Proyectos,        │
  │ Conocimiento, Finanzas, Salud,          │
  │ Pareja, Hábitos.                        │
  │                                         │
  │ Tool: classify_inbox                    │
  │ Schema: INBOX_CLASSIFICATION_SCHEMA     │
  │ tool_choice: { type: 'tool' } (forced)  │
  │                                         │
  │ User: Clasifica esta captura:           │
  │ "{rawContent}"                          │
  └─────────────────────────────────────────┘
    │
    ▼
Resultado extraído de toolBlock.input (objeto directo, no string)
  - Schema enforcement: enum/required garantizan valores válidos
  - No hay JSON.parse, no hay stripJsonFence, no hay fallbacks null
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
Dashboard carga → useDailyDigest (client-side, no Cloud Function)
    │
    ▼
Lee todas las notas del store TinyBase:
  1. Filtrar notas con fsrsDue <= endOfToday
     → ordenar por urgencia (más atrasadas primero) → max 3
  2. Si hay espacio (< 5 items): buscar notas hub
     (linkCount >= 3, excluir ya incluidas)
     → orden determinístico con hash diario
     → agregar hasta llenar 5
    │
    ▼
Dashboard muestra DailyDigest card:
  - Items review: icono CalendarClock, "Revisar hoy"
  - Items hub: icono Network, "Hub: N conexiones"
  - Click → navega al editor (ReviewBanner visible si FSRS activo)
    │
    ▼
En el editor, el usuario revisa la nota:
  - "La recuerdo bien" (Rating.Good) → próxima revisión se aleja
  - "Necesito repasarla" (Rating.Again) → próxima revisión se acerca
  - Persistencia: setPartialRow local-first → persister sync a Firestore
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

// Factory persister bidireccional Firestore ↔ TinyBase
// - onSnapshot listener para Firestore → TinyBase (auto-load)
// - setPersisted diff-based (F12): consume el param `changes` nativo
//   de TinyBase v8 y emite setDoc(merge: true) solo para rows tocadas
//   (write amplification O(cambios), no O(N))
// - Promise.allSettled evita que un setDoc fallido aborte los paralelos
// - onIgnoredError (6º arg) recibe rejects sin retry automático —
//   eventual consistency: la próxima transacción sobre la row reemite
// - merge: true es CRÍTICO — sin él, el persister borra campos
//   escritos fuera del store (ej: content de notas, campos AI de CFs)
// - Limitación TinyBase v8: `changes` NO incluye row IDs eliminados;
//   los deletes se propagan via repos con deleteDoc directo, no aquí
export function createFirestorePersister({ store, collectionPath, tableName }) {
  // createCustomPersister con 6 args: getPersisted, setPersisted (diff-based),
  // addPersisterListener, delPersisterListener, onIgnoredError, ...
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

### Constraints de TinyBase que impactan el diseño

TinyBase solo almacena primitivos (`string | number | boolean`). Dos consecuencias de diseño que cualquier nueva entidad debe respetar:

- **Content largo → directo a Firestore, fuera del store.** El campo `content` (TipTap JSON) se lee/escribe directo de Firestore via `useNote` (getDoc one-shot) y `useNoteSave` (updateDoc debounced). No vive en TinyBase por tamaño + compatibilidad del schema de primitivos.
- **Arrays de IDs → JSON strings.** `projectIds`, `tagIds`, `outgoingLinkIds` y similares se serializan con `stringifyIds([...ids, newId])` al escribir y se deserializan con `parseIds(row.projectIds)` al leer. Helpers en [`src/lib/tinybase.ts`](../src/lib/tinybase.ts). `stringifyIds` NO es idempotente — nunca pasar una string ya serializada.

> **`useNoteSave` es el único punto que escribe `content`** a Firestore. Nuevas features que manipulen notas no deben tocar `content` por fuera de este flujo.

Patrones operativos (optimistic updates, orden `setRow` sync → `setDoc` async, creación de entidades via repo factory, hidratación con `useStoreHydration`) viven centralizados en [`CLAUDE.md`](../CLAUDE.md) "Gotchas universales" + [`Spec/ESTADO-ACTUAL.md`](../Spec/ESTADO-ACTUAL.md). Ver pointer de sección 13 para el mapa completo.

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

Extensiones custom (planeadas, Fase 5+):
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
  id: 'string',
  title: 'string',
  contentPlain: 'string',
  noteType: 'string',
  paraType: 'string',
  linkCount: 'number',
  updatedAt: 'number',
  isArchived: 'boolean',
};
```

**Index global unificado** (Fase 3) — usado por `useGlobalSearch` en Command Palette:

```typescript
const GLOBAL_SCHEMA = {
  id: 'string',
  _type: 'string', // 'note' | 'task' | 'project'
  title: 'string',
  body: 'string',
  updatedAt: 'number',
  isArchived: 'boolean',
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

### Fase 3.1: Schema Enforcement ✅

- [x] Tool use con `tool_choice` forced + JSON Schema en ambas CFs
- [x] `schemas.ts` compartido con `INBOX_CLASSIFICATION_SCHEMA` + `NOTE_TAGGING_SCHEMA`
- [x] Eliminado `stripJsonFence`, fallbacks null, `parseJson.ts`

### Fase 4: Grafo + Resurfacing ✅

- [x] Cloud Function `generateEmbedding` (OpenAI text-embedding-3-small, guard por contentHash)
- [x] Reagraph: knowledge graph interactivo (force-directed WebGL, colores por paraType, tamaños por linkCount)
- [x] Filtros del grafo (paraType + noteType + minLinks, AND, panel colapsable)
- [x] "Notas similares" sidebar (cosine similarity, top 5, threshold 0.5, cache useRef)
- [x] ts-fsrs: resurfacing (opt-in, 2 ratings Again/Good, campos flat en notesStore)
- [x] Daily Digest en dashboard (client-side, review FSRS + hubs por hash diario)

### Fase 5: Multi-plataforma ✅

- [x] PWA optimizada (service worker, offline, `vite-plugin-pwa` + Workbox)
- [x] Chrome Extension MV3 (web clipper, `chrome.identity`, `firestore/lite`)
- [x] Tauri v2 desktop wrapper (system tray, `Ctrl+Shift+Space` global, autostart, OAuth Desktop flow PKCE)
- [x] Capacitor 8 Android (Google Sign-In nativo, Share Intent desde cualquier app)

### Iteraciones post-F5.2

Post-F5.2 el proyecto siguió iterando con features de pulido (UX, editor, theme) y refactors arquitectónicos (repos layer, store isolation, persister diff-based). Para no duplicar inventario, la lista vive en [`Spec/ESTADO-ACTUAL.md`](../Spec/ESTADO-ACTUAL.md) con pointers a cada `Spec/features/SPEC-feature-N-*.md`.

Snapshot no exhaustivo: responsive UX (F1), editor polish con `@` menciones y slash commands (F2), búsqueda híbrida Orama + embeddings (F3), progressive summarization L0-L3 (F4), bubble menu (F5), theme system con paleta oklch (F6), capture multi-monitor Tauri (F7), Tauri auto-updater (F8), Capacitor auto-update Android (F9), **capa de repos en `src/infra/repos/` (F10)**, **store isolation + gating correcto (F11)**, **persister diff-based con `changes` nativo de TinyBase v8 (F12)**.

---

## 10. Decisiones de diseño clave

### D1: ¿Por qué notas y tareas en la misma app?

Porque separar ejecución y conocimiento es el error que cometen la mayoría de tools. El poder está en vincular una nota a un proyecto, y que al abrir el proyecto veas el conocimiento relevante. Notion lo intenta pero con friction — aquí es nativo.

### D2: ¿Por qué no usar Firestore offline persistence nativa?

Porque es limitada: no soporta queries complejas offline, tiene un límite de cache, y no ofrece reactividad granular. TinyBase como capa intermedia da instantaneidad + control total del cache.

### D3: ¿Por qué Claude Haiku y no modelos locales para inbox?

Porque Haiku cuesta ~$1/1M tokens input y produce resultados consistentes sin GPU. Para procesamiento batch de inbox, la calidad/costo es imbatible. Modelos locales son plan B si los costos escalan (improbable para uso personal — ~100 items/mes ≈ $0.04/mes).

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

### D11: ¿Por qué tool use en vez de prompt "Responde SOLO JSON"?

Tool use con `tool_choice: { type: 'tool' }` fuerza a Claude a devolver un objeto que cumple el `input_schema`. Es schema enforcement a nivel de decodificador — no depende de que el modelo "obedezca" el prompt. Elimina `stripJsonFence`, nulls en campos con `enum`, y wrapping en markdown. Los schemas se definen una sola vez en `schemas.ts` y se reusan en ambas CFs.

### D12: ¿Por qué Reagraph y no Sigma.js para el grafo?

Reagraph ofrece API declarativa (`<GraphCanvas nodes edges />`) que encaja con React. Para <500 nodos, el rendimiento WebGL es más que suficiente. Sigma.js requiere setup imperativo + Graphology como data layer — más potente pero más complejo. Si el grafo supera ~1000 nodos, migrar. Smoke test confirmó compatibilidad con React 19 + Vite sin issues.

### D13: ¿Por qué Daily Digest client-side y no Cloud Function scheduled?

Los datos ya están en TinyBase al cargar el dashboard. Computar 3-5 notas del digest es O(n) trivial. Una CF scheduled agregaría cron + colección `digest/{date}` + sync, y el digest sería stale si el usuario revisa una nota entre el cron y la apertura. Client-side siempre fresh.

### D14: ¿Por qué embeddings en Firestore directo y no en TinyBase?

Cada embedding es 1536 floats (~6KB). Con 500 notas = ~3MB permanente en TinyBase. Los embeddings solo se usan al abrir el editor ("Notas similares") — no justifica tenerlos en memoria siempre. Carga on-demand con `getDocs` + cache en `useRef`.

### D15: ¿Por qué solo 2 ratings FSRS (Again/Good) en vez de 4?

SecondMind no es Anki. El objetivo es re-exponer notas olvidadas, no optimizar memorización. Again + Good reducen la decisión a un click significativo. ts-fsrs funciona perfectamente con un subconjunto de ratings.

### D16: ¿Por qué Tauri en vez de Electron para desktop?

Tauri genera binarios de ~5MB (vs ~150MB de Electron), usa el WebView del sistema (no Chromium embebido), y expone APIs nativas de Rust (global shortcuts, system tray, autostart). Para una app single-user, el tradeoff de no tener control total del WebView es aceptable.

### D17: ¿Por qué OAuth Desktop flow en Tauri en vez de `signInWithPopup`?

`signInWithPopup` usa `window.open` + `postMessage`. Tauri WebView2 abre `window.open` en el browser del sistema (proceso distinto), y el popup no puede `postMessage` de vuelta. Además `tauri://localhost` no es un origen autorizable en Firebase. La solución es OAuth 2.0 Desktop flow: PKCE + HTTP listener local + redirect.

### D18: ¿Por qué Capacitor 8 en vez de 7?

Node 24 ✅, Android Studio Otter ✅, edge-to-edge default en Android 15+, plugins Capgo v8 activos. Cap 7 habría requerido downgrade del ecosistema sin beneficio.

### D19: ¿Por qué `@capgo/capacitor-social-login` en vez de `@codetrix-studio/capacitor-google-auth`?

`codetrix-studio` está abandonado (máx Cap 6, sin mantenedor activo). `@capgo/capacitor-social-login` es su sucesor oficial con soporte Cap 8, Credential Manager en Android 14+, y `idToken` compatible con `signInWithCredential`.

### D20: ¿Por qué reusar QuickCaptureProvider para share intent en vez de ruta `/share`?

En Capacitor la app completa ya está cargada con TinyBase hidratado. A diferencia de Tauri `/capture` (ventana efímera que no hidrata el store) o la extension (popup sin store), pre-llenar el modal existente reutiliza el write-path de `Alt+N` sin ruta nueva.

### D21: ¿Por qué `server.androidScheme: 'https'` en Capacitor?

Firebase Auth requiere origen HTTPS. Capacitor sirve desde `https://localhost` en el WebView. Sin esto, `signInWithCredential` falla por origen no autorizado.

### D22: ¿Por qué VectorDrawable manual en vez de `@capacitor/assets generate`?

El generador procesa PNGs para adaptive icon format (insets de 16.7%) y distorsiona logos con diseño específico. Copiar los `<path d="">` del SVG a `android:pathData` produce un match exacto con el PWA.

### D23: ¿Por qué `pendingMetaRef` en QuickCaptureProvider en vez de extender `save(content, source, sourceUrl)`?

Cambiar la firma de `save()` requería actualizar todos los callers (QuickCapture.tsx pasa `trimmed` directo). `useRef` stashea meta desde `open()`, `save()` lo consume y resetea. API estable, lógica concentrada.

> **Decisiones post-F5.2:** Las decisiones arquitectónicas introducidas por features iterativas (factory repo centralizado, orden `destroy() → delTable()` en cleanup, `changes` nativo de TinyBase v8 para persister diff-based, eventual consistency con `onIgnoredError` y `Promise.allSettled`) viven en los SPECs correspondientes: [`SPEC-feature-10-repos-layer.md`](../Spec/features/SPEC-feature-10-repos-layer.md), [`SPEC-feature-11-store-isolation-gating.md`](../Spec/features/SPEC-feature-11-store-isolation-gating.md), [`SPEC-feature-12-persister-diff-based.md`](../Spec/features/SPEC-feature-12-persister-diff-based.md). Mantener el canon histórico junto al código que las originó evita duplicar contenido aquí.

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

| Riesgo                            | Probabilidad | Impacto  | Mitigación                                                       |
| --------------------------------- | ------------ | -------- | ---------------------------------------------------------------- |
| TinyBase no escala a >5K notas    | Baja         | Alto     | Content ya va directo a Firestore; migrar metadata si necesario  |
| Costos de Claude/OpenAI escalan   | Baja         | Bajo     | Batch API (-50%), o migrar a modelos locales                     |
| Orama rebuild lento con >1K notas | Media        | Bajo     | Migrar a sync incremental (update/remove por row)                |
| Tauri mobile no madura            | ~~Media~~    | ~~Bajo~~ | ✅ Resuelto: Capacitor 8 para mobile Android (Fase 5.2)          |
| Reagraph lento con >1000 nodos    | Baja         | Medio    | Migrar a Sigma.js + Graphology (más potente para grafos grandes) |
| Over-engineering antes de validar | Alta         | Alto     | MVP en 4 semanas o menos. Si no lo uso diario, pivotar.          |

---

## 13. Gotchas técnicos

Este doc es arquitectónico/teórico. Los gotchas operativos viven centralizados según la jerarquía del proyecto:

- **Universales** (aplican a cualquier sesión sin importar dominio) → [`CLAUDE.md`](../CLAUDE.md) sección "Gotchas universales".
- **Por dominio** (aplican a >1 feature del mismo dominio) → [`Spec/ESTADO-ACTUAL.md`](../Spec/ESTADO-ACTUAL.md) sección "Arquitectura y gotchas por dominio".
- **Por feature** (historia + decisiones específicas) → [`Spec/features/`](../Spec/features/) y [`Spec/SPEC-fase-*.md`](../Spec/).

Ejemplos prácticos de dónde buscar:

| Dónde vive         | Qué tipo de gotcha                                                                                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md`        | Tailwind v4, ESLint flat config, optimistic updates via repo factory, Vite `resolve.dedupe`, patrones universales de Base-UI, loading states                                     |
| `ESTADO-ACTUAL.md` | `merge: true` persister, embeddings no en TinyBase, CFs con guards `contentHash`/`aiProcessed`, patrones Tauri/Capacitor/Chrome Extension, router order, empty state con filtros |
| SPECs por feature  | Trade-offs originales de F10 repos, F11 store isolation, F12 persister diff-based, OAuth Desktop flow F5.1, etc.                                                                 |

Regla operativa: "nunca duplicar entre niveles". Si un gotcha aparece en más de un nivel, eliminarlo del más específico al escalar.

---

> **Estado actual**: SecondMind está desplegado en web (PWA), desktop Windows (Tauri), Chrome Extension, y Android (Capacitor). Post-F5.2 el proyecto continuó con features de pulido (UX responsive, editor polish, theme system, auto-updaters) y refactors arquitectónicos (capa de repos en `src/infra/repos/`, store isolation, persister diff-based). Para el estado vivo actualizado y features en curso, ver [`Spec/ESTADO-ACTUAL.md`](../Spec/ESTADO-ACTUAL.md).
