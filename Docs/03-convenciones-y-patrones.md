# 📐 SecondMind — Convenciones y Patrones

> Reglas de código para mantener consistencia en el proyecto.
> Fuente: `01-arquitectura-hibrida-progresiva.md`
> Stack: React 19 + TypeScript strict + Vite + Tailwind CSS + TinyBase + Firebase + TipTap + Tauri (desktop) + Capacitor (Android)
> Escala: Solo developer
> Última actualización: Abril 2026

---

## 1. Estructura de carpetas

```
src/
├── app/                         # Rutas y layouts (React Router)
│   ├── layout.tsx               # Layout raíz (sidebar + content area)
│   ├── page.tsx                 # Dashboard (ruta /)
│   ├── inbox/
│   │   ├── page.tsx             # Lista de inbox
│   │   └── process/
│   │       └── page.tsx         # Inbox Processor (one-by-one)
│   ├── notes/
│   │   ├── page.tsx             # Lista de notas
│   │   ├── [noteId]/
│   │   │   └── page.tsx         # Editor de nota
│   │   └── graph/
│   │       └── page.tsx         # Knowledge graph
│   ├── tasks/
│   ├── projects/
│   │   └── [projectId]/
│   │       └── page.tsx
│   ├── objectives/
│   ├── habits/
│   └── settings/
│
├── components/
│   ├── ui/                      # shadcn/ui (no tocar, auto-generados)
│   ├── editor/                  # TipTap: editor + extensiones + menus
│   ├── graph/                   # Reagraph: knowledge graph WebGL
│   ├── capture/                 # Quick Capture modal, Inbox Processor
│   ├── dashboard/               # Cards del dashboard
│   └── layout/                  # Sidebar, CommandPalette, Breadcrumbs
│
├── stores/                      # TinyBase stores (1 archivo por entidad)
├── hooks/                       # Custom hooks (1 archivo por hook)
├── lib/                         # Configs y utilidades
│   ├── firebase.ts              # Config Firebase (singleton)
│   ├── tinybase.ts              # Config TinyBase + persisters
│   ├── orama.ts                 # Config búsqueda
│   ├── editor/                  # Serialización TipTap, extractLinks
│   ├── embeddings.ts            # cosineSimilarity + fetchEmbedding/All
│   ├── fsrs.ts                  # Wrapper ts-fsrs: scheduleReview, serialize/deserialize
│   ├── tauri.ts                 # isTauri() + showMainWindow/hideCurrentWindow
│   ├── tauriAuth.ts             # signInWithTauri: OAuth Desktop flow PKCE
│   ├── capacitor.ts             # isCapacitor() via Capacitor.isNativePlatform()
│   └── capacitorAuth.ts         # initCapacitorAuth + signInWithCapacitor
├── types/                       # Interfaces TypeScript (1 archivo por entidad)
│
├── functions/                   # Cloud Functions v2 (deploy separado)
│   ├── src/
│   │   ├── inbox/               # processInboxItem
│   │   ├── notes/               # autoTagNote
│   │   └── embeddings/          # generateEmbedding
│   └── package.json
│
# Multi-plataforma (raíz del proyecto)
capacitor.config.ts              # Capacitor 8: appId, androidScheme, plugins
android/                         # Proyecto Gradle Android (generado por cap add android)
src-tauri/                       # Tauri v2: Rust backend, tray, global shortcuts
extension/                       # Chrome Extension MV3: web clipper
```

### Reglas de organización

**Componentes agrupados por feature, no por tipo.**

```
✅ components/editor/Editor.tsx
✅ components/editor/extensions/wikilink.ts
✅ components/editor/menus/SlashMenu.tsx

❌ components/buttons/EditorButton.tsx
❌ components/modals/EditorModal.tsx
```

**Un componente por archivo. El archivo se llama como el componente.**

```
✅ components/capture/QuickCapture.tsx → export default function QuickCapture()
❌ components/capture/index.tsx → export function QuickCapture()
```

**`ui/` es intocable.** Los componentes de shadcn/ui se generan con CLI y no se editan manualmente. Si necesitas customizar, crea un wrapper en la carpeta feature correspondiente.

---

## 2. Naming conventions

### Archivos y carpetas

| Tipo             | Convención              | Ejemplo                               |
| ---------------- | ----------------------- | ------------------------------------- |
| Componente React | PascalCase.tsx          | `NoteCard.tsx`, `QuickCapture.tsx`    |
| Hook custom      | use[Entidad][Acción].ts | `useNoteSearch.ts`, `useBacklinks.ts` |
| Store TinyBase   | [entidad]Store.ts       | `notesStore.ts`, `linksStore.ts`      |
| Tipo/Interface   | [entidad].ts            | `note.ts`, `inbox.ts`                 |
| Utilidad/helper  | camelCase.ts            | `extractLinks.ts`, `serialize.ts`     |
| Cloud Function   | camelCase.ts            | `processInboxItem.ts`                 |
| Página/ruta      | page.tsx (siempre)      | `app/notes/page.tsx`                  |

### Variables y funciones

| Tipo                 | Convención        | Ejemplo                                 |
| -------------------- | ----------------- | --------------------------------------- |
| Componente           | PascalCase        | `function NoteCard()`                   |
| Hook                 | use + PascalCase  | `function useBacklinks(noteId: string)` |
| Handler de evento    | handle + Acción   | `handleSave()`, `handleCapture()`       |
| Booleano             | is/has/can/should | `isArchived`, `hasBacklinks`, `canEdit` |
| Constante global     | UPPER_SNAKE_CASE  | `MAX_INBOX_ITEMS`, `DEBOUNCE_MS`        |
| Firestore collection | camelCase plural  | `notes`, `inboxItems`, `noteLinks`      |

### Entidades del dominio

Las entidades del proyecto usan estos nombres consistentemente en todo el código:

| Entidad          | Singular    | Plural       | ID                        |
| ---------------- | ----------- | ------------ | ------------------------- |
| Nota             | `note`      | `notes`      | `noteId`                  |
| Link entre notas | `noteLink`  | `noteLinks`  | `linkId`                  |
| Tarea            | `task`      | `tasks`      | `taskId`                  |
| Proyecto         | `project`   | `projects`   | `projectId`               |
| Objetivo         | `objective` | `objectives` | `objectiveId`             |
| Área             | `area`      | `areas`      | `areaId`                  |
| Item de inbox    | `inboxItem` | `inboxItems` | `itemId`                  |
| Tag/Tema         | `tag`       | `tags`       | `tagId`                   |
| Hábito           | `habit`     | `habits`     | `habitId`                 |
| Embedding        | `embedding` | `embeddings` | `noteId` (mismo que nota) |

**Nunca abreviar entidades.** `proj`, `obj`, `tsk` → prohibido.

---

## 3. Componentes React

### Anatomía de un componente

```tsx
// ─── 1. Imports ─────────────────────────────────
import { useState } from 'react'; // React
import { useCell } from 'tinybase/ui-react'; // Libs externas
import { Button } from '@/components/ui/button'; // UI components
import { useBacklinks } from '@/hooks/useBacklinks'; // Hooks custom
import type { Note } from '@/types/note'; // Types

// ─── 2. Types ───────────────────────────────────
interface NoteCardProps {
  noteId: string;
  onSelect?: (noteId: string) => void;
}

// ─── 3. Componente ──────────────────────────────
export default function NoteCard({ noteId, onSelect }: NoteCardProps) {
  const title = useCell('notes', noteId, 'title');
  const linkCount = useCell('notes', noteId, 'linkCount');

  return (
    <div
      className="rounded-lg border p-4 cursor-pointer hover:bg-muted"
      onClick={() => onSelect?.(noteId)}
    >
      <h3 className="font-medium">{title}</h3>
      <span className="text-sm text-muted-foreground">{linkCount} conexiones</span>
    </div>
  );
}
```

### Reglas

**Export default siempre.** Cada componente usa `export default function`. Facilita lazy loading y naming consistente en React DevTools.

```tsx
✅ export default function NoteCard() {}
❌ export const NoteCard = () => {}
❌ export function NoteCard() {}  // sin default
```

**Props como interface, no type.** Las props se definen como `interface` con nombre `[Componente]Props`, en el mismo archivo.

```tsx
✅ interface NoteCardProps { noteId: string; }
❌ type NoteCardProps = { noteId: string; }
```

**Lógica en hooks, no en componentes.** Si un componente tiene más de 10 líneas de lógica (fetch, transformaciones, side effects), extraer a un hook custom.

```tsx
// ✅ Lógica en hook
function NoteEditor({ noteId }: NoteEditorProps) {
  const { note, save, isLoading } = useNote(noteId);
  // Solo renderizado aquí
}

// ❌ Lógica en componente
function NoteEditor({ noteId }: NoteEditorProps) {
  const [note, setNote] = useState(null);
  useEffect(() => {
    /* fetch */
  }, [noteId]);
  const save = async () => {
    /* 15 líneas de lógica */
  };
  // Mezclando lógica y renderizado
}
```

**Componente nuevo cuando cambia la responsabilidad, no cuando cambia el tamaño.** Un componente de 200 líneas que hace una sola cosa está bien. Un componente de 50 líneas que hace tres cosas necesita split.

---

## 4. State management — TinyBase

### Cuándo usar qué

| Situación                         | Usar                     | Ejemplo                                       |
| --------------------------------- | ------------------------ | --------------------------------------------- |
| UI local (toggle, modal open)     | `useState`               | `const [isOpen, setIsOpen] = useState(false)` |
| Datos persistidos (notas, tareas) | TinyBase store           | `useCell('notes', noteId, 'title')`           |
| Datos derivados del store         | TinyBase `useResultRow`  | Notas filtradas por área                      |
| Estado de formularios             | `useState` local         | Campos editables en Inbox Processor           |
| Búsqueda                          | Orama index + `useState` | Query del search input                        |

### Patrones de TinyBase

**Un store por dominio lógico.** No un mega-store con todo.

```typescript
// ✅ Stores separados
const notesStore = createStore(); // notas + metadata
const linksStore = createStore(); // links bidireccionales
const tasksStore = createStore(); // tareas
const inboxStore = createStore(); // inbox items

// ❌ Un solo store
const appStore = createStore(); // todo junto
```

**Acceder datos con hooks de TinyBase, nunca con getters directos en componentes.**

```tsx
// ✅ Hook reactivo — re-renderiza cuando cambia
const title = useCell('notes', noteId, 'title');

// ❌ Getter directo — no es reactivo, no re-renderiza
const title = notesStore.getCell('notes', noteId, 'title');
```

**Content de notas (TipTap JSON) fuera de TinyBase en MVP.**
TinyBase guarda metadata (título, flags, counters). El `content` completo se lee/escribe directo de Firestore al abrir/cerrar el editor. Esto mantiene el store ligero.

```typescript
// Store de TinyBase: solo metadata
notesStore.setTablesSchema({
  notes: {
    title: { type: 'string' },
    paraType: { type: 'string' },
    noteType: { type: 'string' },
    linkCount: { type: 'number' },
    isFavorite: { type: 'boolean' },
    isArchived: { type: 'boolean' },
    // NO incluir: content, contentPlain (muy pesado)
  },
});

// Content se carga solo en el editor
const useNoteContent = (noteId: string) => {
  // Firestore directo, no TinyBase
};
```

---

## 5. TypeScript

### Reglas de tipado

**`interface` para shapes de objetos. `type` para unions, intersections y aliases.**

```typescript
// ✅ Interface para shapes
interface Note {
  id: string;
  title: string;
  paraType: ParaType;
}

// ✅ Type para unions
type ParaType = 'project' | 'area' | 'resource' | 'archive';
type NoteType = 'fleeting' | 'literature' | 'permanent';
type Priority = 'low' | 'medium' | 'high' | 'urgent';

// ❌ Type para shapes
type Note = { id: string; title: string };
```

**Nunca `any`. Usar `unknown` + type guard si el tipo es incierto.**

```typescript
// ✅
function parseAiResult(raw: unknown): AiResult {
  if (!isAiResult(raw)) throw new Error('Invalid AI result');
  return raw;
}

// ❌
function parseAiResult(raw: any): AiResult {
  return raw as AiResult;
}
```

**Ubicación de tipos:**

| Tipo                                   | Ubicación                    |
| -------------------------------------- | ---------------------------- |
| Props de componente                    | Mismo archivo del componente |
| Entidad de dominio (Note, Task, etc.)  | `types/[entidad].ts`         |
| Response de Cloud Function             | `types/api.ts`               |
| Tipos compartidos (ParaType, Priority) | `types/common.ts`            |

---

## 6. Estilos — Tailwind CSS

### Reglas

**Mobile-first siempre.** Estilos base son mobile, breakpoints agregan complejidad.

```tsx
// ✅ Mobile-first
<div className="flex flex-col md:flex-row lg:gap-6">

// ❌ Desktop-first
<div className="flex flex-row max-md:flex-col">
```

**Orden de clases: layout → spacing → sizing → visual → interactive → responsive.**

```tsx
// ✅ Orden consistente
<div className="flex items-center gap-2 p-4 w-full rounded-lg border bg-card hover:bg-muted md:w-1/2">

// ❌ Sin orden
<div className="hover:bg-muted rounded-lg flex w-full p-4 border md:w-1/2 items-center bg-card gap-2">
```

**Usar variables de shadcn/ui para colores, no colores hardcodeados.**

```tsx
// ✅ Variables semánticas
className = 'text-foreground bg-background border-border text-muted-foreground';

// ❌ Colores directos
className = 'text-gray-900 bg-white border-gray-200 text-gray-500';
```

**No crear clases custom con `@apply`.** Si se repite un patrón, extraer a componente.

```tsx
// ✅ Componente reutilizable
function Card({ children, className }: CardProps) {
  return <div className={cn("rounded-lg border p-4", className)}>{children}</div>;
}

// ❌ @apply en CSS
.card { @apply rounded-lg border p-4; }
```

---

## 7. Manejo de errores

### Patrones por capa

| Capa                  | Patrón                              | Ejemplo                                                       |
| --------------------- | ----------------------------------- | ------------------------------------------------------------- |
| Componente            | Error boundary por sección          | `<ErrorBoundary fallback={<SectionError />}>`                 |
| Hook con datos        | Return `{ data, error, isLoading }` | `const { notes, error } = useNotes()`                         |
| TinyBase persister    | Listener de error + toast           | `persister.addStatusListener(...)`                            |
| Cloud Function        | Structured error + HTTP code        | `{ error: { code: 'INBOX_PROCESS_FAILED', message: '...' } }` |
| Operaciones Firestore | try-catch + retry 1x                | Guardar nota, crear link                                      |

### Reglas

**Los errores de UI se muestran como toast. Los errores críticos se muestran inline.**

```tsx
// Toast para errores recuperables
toast.error('No se pudo guardar. Reintentando...');

// Inline para errores que bloquean la vista
if (error)
  return (
    <div className="p-4 text-destructive">
      Error cargando notas. <button onClick={retry}>Reintentar</button>
    </div>
  );
```

**Los datos nunca se pierden.** TinyBase guarda localmente primero. Si Firestore falla, el dato sigue en el store local y se sincroniza después.

**Nunca `console.log` en producción.** Usar un helper:

```typescript
// lib/logger.ts
export const logger = {
  error: (msg: string, ctx?: unknown) => {
    if (import.meta.env.DEV) console.error(msg, ctx);
    // En prod: enviar a servicio de logging si aplica
  },
  warn: (msg: string) => {
    if (import.meta.env.DEV) console.warn(msg);
  },
};
```

---

## 8. Async y data fetching

### Reglas

**TinyBase es la fuente de verdad para el UI.** Los componentes leen del store local, nunca directamente de Firestore. El persister se encarga del sync.

```tsx
// ✅ Leer del store (instantáneo, reactivo)
const title = useCell('notes', noteId, 'title');

// ❌ Leer de Firestore (latencia, no reactivo)
const doc = await getDoc(doc(db, `users/${uid}/notes/${noteId}`));
```

**Excepción: embeddings.** Los vectores de 1536 floats se cargan on-demand desde Firestore con `getDocs` + cache en `useRef`. Son demasiado grandes para TinyBase.

**Loading states: skeleton siempre, spinner nunca.** Los skeletons mantienen el layout y reducen el "salto" visual.

```tsx
// ✅ Skeleton que respeta el layout
if (isLoading) return <NoteCardSkeleton />;

// ❌ Spinner centrado
if (isLoading) return <Spinner />;
```

**Optimistic updates para acciones inmediatas.** Toggle de checkbox, favorito, archivar — actualizan TinyBase primero, Firestore se sincroniza después.

```tsx
// ✅ Optimistic: UI se actualiza instant
function handleToggleFavorite(noteId: string) {
  const current = notesStore.getCell('notes', noteId, 'isFavorite');
  notesStore.setCell('notes', noteId, 'isFavorite', !current);
  // TinyBase persister sincroniza a Firestore automáticamente
}
```

**Debounce en auto-save del editor: 2 segundos.**

```typescript
const AUTOSAVE_DEBOUNCE_MS = 2000;
```

---

## 9. Git y commits

### Conventional Commits

```
tipo(alcance): descripción en español, imperativo, <72 chars

Tipos:
  feat     → Nueva funcionalidad
  fix      → Corrección de bug
  docs     → Solo documentación
  style    → Formato (no afecta lógica)
  refactor → Reestructuración sin cambio funcional
  test     → Agregar o corregir tests
  chore    → Mantenimiento (deps, config, scripts)
```

**Ejemplos reales del proyecto:**

```
feat(editor): agregar extensión wikilinks con autocompletado
feat(inbox): implementar procesamiento AI con Claude Haiku
fix(tinybase): corregir sync duplicado en persister Firestore
refactor(stores): separar notesStore en metadata y content
docs(arch): actualizar esquema de links bidireccionales
chore(deps): actualizar tiptap a v2.x
```

### Ramas

```
main              → Producción (deploy automático a Firebase Hosting)
feat/[feature]    → Features nuevas
fix/[bug]         → Correcciones
```

**Ejemplos:**

```
feat/wikilinks-editor
feat/inbox-ai-processing
feat/graph-view
fix/tinybase-offline-sync
fix/backlinks-count
```

### Reglas

**Commits atómicos.** Un commit = un cambio lógico. Si el mensaje necesita "y", son dos commits.

```
✅ feat(editor): agregar slash commands
✅ feat(editor): agregar autocompletado de tags

❌ feat(editor): agregar slash commands y autocompletado de tags
```

**Commit cuando funciona, no cuando termina el día.** No commitear código roto.

---

## 10. Imports

### Orden (enforced por ESLint)

```typescript
// 1. React
import { useState, useEffect } from 'react';

// 2. Librerías externas
import { useEditor } from '@tiptap/react';
import { useCell, useRowIds } from 'tinybase/ui-react';
import { search } from '@orama/orama';

// 3. Componentes internos
import { Button } from '@/components/ui/button';
import NoteCard from '@/components/editor/NoteCard';

// 4. Hooks custom
import { useBacklinks } from '@/hooks/useBacklinks';
import { useNoteSearch } from '@/hooks/useNoteSearch';

// 5. Libs/utils
import { extractLinks } from '@/lib/editor/extractLinks';
import { logger } from '@/lib/logger';

// 6. Types
import type { Note } from '@/types/note';
import type { NoteLink } from '@/types/link';
```

### Reglas

**Imports absolutos con `@/` alias.** Configurado en `vite.config.ts` y `tsconfig.json`.

```typescript
// ✅ Absoluto
import NoteCard from '@/components/editor/NoteCard';

// ❌ Relativo profundo
import NoteCard from '../../../components/editor/NoteCard';
```

**No barrel exports (`index.ts`).** Cada import apunta al archivo exacto. Barrel exports causan tree-shaking problems y circular dependencies.

```typescript
// ✅ Import directo
import { useBacklinks } from '@/hooks/useBacklinks';

// ❌ Barrel
import { useBacklinks } from '@/hooks'; // via index.ts
```

---

## 11. Cloud Functions v2

### Naming

```typescript
// Función: verbo + entidad
processInboxItem.ts
generateEmbedding.ts
autoTagNote.ts

// Export: on + Trigger + Entidad
export const onInboxItemCreated = onDocumentCreated(...)
export const onNoteWritten = onDocumentWritten(...)
```

### Patrón de Cloud Function

```typescript
// functions/src/inbox/processInboxItem.ts
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/logger';

export const onInboxItemCreated = onDocumentCreated(
  'users/{userId}/inbox/{itemId}',
  async (event) => {
    const { userId, itemId } = event.params;
    const data = event.data?.data();

    if (!data) {
      logger.warn('Inbox item vacío', { userId, itemId });
      return;
    }

    try {
      const aiResult = await processWithClaude(data.rawContent);
      await event.data.ref.update({ aiProcessed: true, aiResult });
      logger.info('Inbox procesado', { userId, itemId });
    } catch (error) {
      logger.error('Error procesando inbox', { userId, itemId, error });
      await event.data.ref.update({ aiProcessed: false });
    }
  },
);
```

### Reglas

**Cada función en su propio archivo.** Un archivo = un trigger = una responsabilidad.

**Siempre loggear con contexto.** El `userId` y el `entityId` van en cada log.

**Timeout y retry configurados explícitamente.** No dejar defaults.

```typescript
export const onInboxItemCreated = onDocumentCreated(
  {
    document: 'users/{userId}/inbox/{itemId}',
    timeoutSeconds: 60,
    retry: false, // No reintentar — procesamiento no es idempotente
  },
  async (event) => {
    /* ... */
  },
);
```

---

## 12. Firestore

### Paths

```
users/{userId}/notes/{noteId}
users/{userId}/links/{sourceId__targetId}
users/{userId}/tasks/{taskId}
users/{userId}/projects/{projectId}
users/{userId}/objectives/{objectiveId}
users/{userId}/areas/{areaId}
users/{userId}/inbox/{itemId}
users/{userId}/tags/{tagId}
users/{userId}/habits/{YYYY-MM-DD}
users/{userId}/embeddings/{noteId}
```

### Reglas de Firestore Security Rules

**Patrón base: solo el dueño lee/escribe sus datos.**

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null
                         && request.auth.uid == userId;
    }
  }
}
```

### Reglas de escritura

**IDs generados con `crypto.randomUUID()` por defecto.** Excepciones con IDs determinísticos: `links/{sourceId__targetId}` (dedup trivial), `habits/{YYYY-MM-DD}` (día = ID), `embeddings/{noteId}` (mismo ID que la nota).

**Timestamps con `serverTimestamp()` para `createdAt` y `updatedAt`.**

```typescript
import { serverTimestamp } from 'firebase/firestore';

const newNote = {
  title: 'Mi nota',
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
};
```

**Denormalización explícita.** Si un campo se cachea para evitar reads extra, documentar cómo se mantiene en sync. Nota: los títulos de links (`sourceTitle`/`targetTitle`) ya no se cachean en el doc — se resuelven in-memory con join en `useBacklinks` → `useTable('notes')`.

---

## 13. TipTap — Editor

### Extensiones custom

```
extensions/
├── wikilink.ts        # [[wikilinks]] — Node type
├── slash-command.ts   # / commands — Suggestion plugin
└── tag.ts             # #tag inline — Mark type
```

### Reglas

**WikiLinks son Nodes, no Marks.** Un Node tiene `attrs` (noteId, noteTitle) y se renderiza como bloque inline. Un Mark es solo decoración visual.

```typescript
// wikilink Node attrs
{
  type: 'wikilink',
  attrs: {
    noteId: string,      // ID de la nota linkeada
    noteTitle: string,   // Cache del título (para display sin fetch)
  }
}
```

**El contenido se serializa como JSON (ProseMirror doc).** Para búsqueda, se genera `contentPlain` con `editor.getText()`.

**extractLinks() se ejecuta en cada save.** Parsea el doc JSON, extrae todos los wikilink nodes, y retorna un array de `{ targetId, context }` para sincronizar con la colección `links/`.

---

## 14. Herramientas del proyecto

### Configuración base

| Herramienta | Config                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------ |
| TypeScript  | `strict: true`, `noUncheckedIndexedAccess: true`                                                       |
| Vite        | Path alias `@/` → `src/`                                                                               |
| ESLint      | Flat config (`eslint.config.js`, NO `.eslintrc.cjs`) + `@typescript-eslint/recommended` + import order |
| Prettier    | Single quotes, trailing commas, 100 char width                                                         |
| Tailwind    | CSS-first: `@theme` en `src/index.css`. No existe `tailwind.config.ts`                                 |

### Scripts en package.json

```json
{
  "dev": "vite",
  "build": "tsc && vite build",
  "preview": "vite preview",
  "lint": "eslint src/",
  "deploy": "firebase deploy --only hosting",
  "deploy:functions": "firebase deploy --only functions",
  "tauri": "tauri",
  "tauri:dev": "tauri dev",
  "tauri:build": "tauri build",
  "cap:sync": "npm run build && npx cap sync",
  "cap:run": "npx cap run android",
  "cap:build": "cd android && ./gradlew.bat assembleDebug"
}
```

> **Nota Windows:** `npx cap run android` falla por `gradlew` sin `.bat`. Usar `cap:build` + `adb install -r android/app/build/outputs/apk/debug/app-debug.apk` + `adb shell am start -n com.secondmind.app/.MainActivity`.

---

## 15. Multi-plataforma — Patrones

### Platform detection helpers

Cada plataforma tiene su helper en `src/lib/`. El orden de evaluación en auth es: `isCapacitor()` → `isTauri()` → web (default).

```typescript
// src/lib/capacitor.ts — SDK oficial, más robusto que window check
import { Capacitor } from '@capacitor/core';
export function isCapacitor(): boolean {
  return Capacitor.isNativePlatform();
}

// src/lib/tauri.ts — internals check (no hay SDK helper equivalente)
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
```

### Auth branching

El hook `useAuth.ts` usa un `if/else if/else` con platform detection. Cada plataforma tiene su propio módulo de auth (`capacitorAuth.ts`, `tauriAuth.ts`, web usa `signInWithPopup` directo).

```typescript
// src/hooks/useAuth.ts — patrón de branching
if (isCapacitor()) {
  await signInWithCapacitor(auth); // SocialLogin → idToken → signInWithCredential
} else if (isTauri()) {
  await signInWithTauri(auth); // OAuth PKCE → HTTP listener → signInWithCredential
} else {
  await signInWithPopup(auth, provider); // Web standard
}
```

### Write paths por plataforma

| Plataforma                 | Write path                        | Razón                                |
| -------------------------- | --------------------------------- | ------------------------------------ |
| Web (Alt+N)                | TinyBase → persister → Firestore  | App completa cargada con store       |
| Capacitor (Share Intent)   | TinyBase via QuickCaptureProvider | App completa cargada — reusar modal  |
| Tauri (`Ctrl+Shift+Space`) | `setDoc` directo a Firestore      | Ventana efímera, no hidrata TinyBase |
| Chrome Extension           | `setDoc` via `firestore/lite`     | Popup sin store                      |

### Imports condicionales

Los imports de SDKs nativos (`@capacitor/core`, `@tauri-apps/api`) deben ser dinámicos para no pesar en el bundle web:

```typescript
// ✅ Import dinámico — solo se carga en la plataforma correcta
const { SocialLogin } = await import('@capgo/capacitor-social-login');

// ❌ Import estático — infla el bundle web
import { SocialLogin } from '@capgo/capacitor-social-login';
```

---

> Este documento se actualiza conforme el proyecto evoluciona. Si una regla genera más fricción que valor, se elimina.
