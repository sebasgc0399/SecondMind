# SPEC — SecondMind · Fase 2: Ejecución — Tareas + Proyectos + Objetivos + Hábitos

> Alcance: El usuario puede crear/gestionar tareas con vistas temporales, organizar proyectos con progreso, definir objetivos de alto nivel, y trackear hábitos diarios — todo conectado entre sí y con las notas de Fase 1
> Dependencias: Fase 1 (MVP) completada
> Estimado: 3-4 semanas (solo dev)
> Stack relevante: React 19 + TypeScript + TinyBase v8 + Firebase Firestore + Tailwind v4 + shadcn/ui + React Router

---

## Objetivo

Al terminar esta fase, el usuario abre SecondMind y tiene un sistema completo de ejecución: crea tareas con fecha y prioridad, las agrupa en proyectos con status kanban, define objetivos que miden progreso via proyectos vinculados, y registra 14 hábitos diarios con vista semanal. Las tareas y proyectos se conectan bidireccionalmente con las notas de Fase 1 — el conocimiento y la acción conviven en la misma app. El dashboard muestra tareas de hoy, proyectos activos, y progreso de hábitos.

---

## Features

### F1: TinyBase stores — Tasks, Projects, Objectives, Habits + Types

**Qué:** Crear los 4 stores nuevos con schemas, persisters y types. Mismo patrón que F2 de Fase 1 (factory `createFirestorePersister`).

**Criterio de done:**

- [ ] `tasksStore` creado con schema completo de Task
- [ ] `projectsStore` creado con schema completo de Project
- [ ] `objectivesStore` creado con schema completo de Objective
- [ ] `habitsStore` creado con schema de HabitEntry (un doc por día)
- [ ] Los 4 stores tienen persister custom a Firestore
- [ ] Los 4 stores están disponibles via Provider en `main.tsx`
- [ ] Interfaces TypeScript definidas para las 4 entidades
- [ ] Al recargar la app, los datos se recuperan de Firestore

**Archivos a crear:**

- `src/types/task.ts` — Interface Task con TaskStatus, TaskPriority
- `src/types/project.ts` — Interface Project con ProjectStatus
- `src/types/objective.ts` — Interface Objective con ObjectiveStatus
- `src/types/habit.ts` — Interface HabitEntry (date + 14 booleans + progress)
- `src/stores/tasksStore.ts` — Store + schema
- `src/stores/projectsStore.ts` — Store + schema
- `src/stores/objectivesStore.ts` — Store + schema
- `src/stores/habitsStore.ts` — Store + schema

**Archivos a modificar:**

- `src/hooks/useStoreInit.ts` — Init 7 persisters (3 existentes + 4 nuevos)
- `src/main.tsx` — Agregar 4 stores al Provider `storesById`

**Notas de implementación:**

Schemas basados en doc 01:

```typescript
interface Task {
  id: string;
  name: string;
  status: TaskStatus; // 'inbox' | 'in-progress' | 'waiting' | 'delegated' | 'completed'
  priority: TaskPriority; // 'low' | 'medium' | 'high' | 'urgent'
  dueDate: number; // unix ms, 0 = sin fecha
  projectId: string; // '' = sin proyecto
  areaId: string;
  objectiveId: string;
  noteIds: string; // JSON array
  description: string;
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
  completedAt: number; // 0 = no completada
}

interface Project {
  id: string;
  name: string;
  status: ProjectStatus; // 'inbox' | 'not-started' | 'in-progress' | 'on-hold' | 'completed'
  priority: ProjectPriority; // 'low' | 'medium' | 'high' | 'urgent'
  areaId: string;
  objectiveId: string;
  taskIds: string; // JSON array
  noteIds: string; // JSON array
  startDate: number;
  deadline: number;
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
}

interface Objective {
  id: string;
  name: string;
  status: ObjectiveStatus; // 'not-started' | 'in-progress' | 'completed'
  deadline: number;
  areaId: string;
  projectIds: string; // JSON array
  taskIds: string; // JSON array
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
}

// Un doc por día, ID = 'YYYY-MM-DD'
interface HabitEntry {
  id: string; // '2026-04-11'
  date: number; // unix ms del inicio del día
  ejercicio: boolean;
  codear: boolean;
  leer: boolean;
  meditar: boolean;
  comerBien: boolean;
  tomarAgua: boolean;
  planificarDia: boolean;
  madrugar: boolean;
  gratitud: boolean;
  ingles: boolean;
  pareja: boolean;
  estirar: boolean;
  tenderCama: boolean;
  noComerDulce: boolean;
  progress: number; // 0-100, calculado client-side
  createdAt: number;
  updatedAt: number;
}
```

- Arrays (noteIds, taskIds, projectIds) como JSON string con `parseIds()`/`stringifyIds()`, mismo patrón de Fase 1.
- HabitEntry usa ID determinístico (`YYYY-MM-DD`) para evitar duplicados por día.
- Los 14 hábitos están hardcoded en el schema. Si en el futuro se quieren hábitos custom, se refactoriza — pero para MVP con tus 14 hábitos fijos es lo más simple.

---

### F2: Rutas + Sidebar activo

**Qué:** Agregar las rutas de Fase 2 al router y activar los items del sidebar que estaban disabled.

**Criterio de done:**

- [ ] Rutas creadas: `/tasks`, `/projects`, `/projects/:projectId`, `/objectives`, `/habits`
- [ ] Los items del sidebar (Tareas, Proyectos, Objetivos, Hábitos) ya no están disabled
- [ ] Cada ruta muestra un placeholder con título (se reemplazan en F3-F7)
- [ ] Active state funciona correctamente para cada ruta

**Archivos a crear:**

- `src/app/tasks/page.tsx` — Placeholder
- `src/app/projects/page.tsx` — Placeholder
- `src/app/projects/[projectId]/page.tsx` — Placeholder
- `src/app/objectives/page.tsx` — Placeholder
- `src/app/habits/page.tsx` — Placeholder

**Archivos a modificar:**

- `src/app/router.tsx` — Agregar 5 rutas nuevas
- `src/components/layout/Sidebar.tsx` — Activar items: agregar `to` a Tareas, Proyectos, Objetivos, Hábitos

---

### F3: Tareas — CRUD + Vistas temporales

**Qué:** Vista `/tasks` con tabs (Hoy, Pronto, Completadas), creación inline, checkbox para completar, prioridad visual. Es la pantalla que el usuario ve cada mañana.

**Criterio de done:**

- [ ] Tab "Hoy" muestra tareas con `dueDate` = hoy, agrupadas por fecha (Hoy, Mañana si aplica)
- [ ] Tab "Pronto" muestra tareas con `dueDate` en los próximos 7 días
- [ ] Tab "Completadas" muestra las últimas 20 tareas completadas
- [ ] "+ Nueva tarea" crea inline: campo de texto + Enter, asigna fecha=hoy, status=in-progress
- [ ] Click checkbox completa la tarea (optimistic: strikethrough + fade out tras 1s)
- [ ] Cada task card muestra: nombre, prioridad badge (color), proyecto link (si tiene), fecha relativa
- [ ] Click en task card expande inline: descripción editable, selector de proyecto, selector de prioridad, selector de fecha
- [ ] Prioridad visual: rojo=urgente, naranja=alta, amarillo=media, verde=baja
- [ ] Click en proyecto badge navega a `/projects/:projectId`
- [ ] Empty states por tab: "Nada para hoy 🎉", "Sin tareas próximas", "Aún no completaste tareas"
- [ ] Skeleton loading

**Archivos a crear:**

- `src/app/tasks/page.tsx` — Página con tabs y lista
- `src/components/tasks/TaskCard.tsx` — Card de tarea individual con expand
- `src/components/tasks/TaskInlineCreate.tsx` — Input de creación inline
- `src/hooks/useTasks.ts` — CRUD: create, complete, update, filtros por tab

**Notas de implementación:**

- Tabs con estado local (no persiste en URL — simplicidad MVP).
- Complete = `setPartialRow('tasks', id, { status: 'completed', completedAt: Date.now() })`. Optimistic via TinyBase.
- La creación inline solo pide nombre. Prioridad=medium, status=in-progress, dueDate=hoy como defaults. Se editan después expandiendo.
- El expand inline es un `details`/`summary` nativo o un toggle state — no un modal. Mantiene contexto de la lista.
- Selector de proyecto: dropdown con proyectos del `projectsStore`. En F3 puede ser un `<select>` simple; se mejora visualmente después.
- Selector de fecha: `<input type="date">` nativo. Sin date picker custom en MVP.
- NO incluir: drag to reorder, swipe mobile, filtro por área, búsqueda. Simplicidad.

---

### F4: Proyectos — Lista con status

**Qué:** Vista `/projects` con lista de proyectos agrupados por status. Creación via modal simple.

**Criterio de done:**

- [ ] La ruta `/projects` muestra todos los proyectos no archivados
- [ ] Proyectos agrupados por status: In Progress, Not Started, On Hold (Completed ocultos por defecto)
- [ ] Cada project card muestra: nombre, prioridad badge, count de tareas pendientes, área
- [ ] "+ Nuevo proyecto" abre modal con: nombre, área (select), prioridad (select). Crea y navega al detalle
- [ ] Click en project card navega a `/projects/:projectId`
- [ ] Empty state: "Sin proyectos aún" + CTA crear
- [ ] Skeleton loading

**Archivos a crear:**

- `src/app/projects/page.tsx` — Página con lista agrupada
- `src/components/projects/ProjectCard.tsx` — Card de proyecto
- `src/components/projects/ProjectCreateModal.tsx` — Modal de creación
- `src/hooks/useProjects.ts` — CRUD: create, update status/priority, list por status

**Notas de implementación:**

- Lista agrupada, NO kanban en MVP. El kanban con drag requiere una librería extra (dnd-kit) y es complejidad innecesaria para un solo dev. Si lo quieres después, es una mejora incremental.
- El count de tareas pendientes se calcula filtrando `tasksStore` por `projectId` y `status !== 'completed'`.
- Área se muestra como texto — no necesita un `areasStore` completo en Fase 2. Un map hardcoded `{ 'proyectos': '🚀 Proyectos', 'salud': '💪 Salud', ... }` basta para MVP. Las áreas como entidad CRUD son post-MVP.

---

### F5: Detalle de proyecto — Tareas + Notas + Progreso

**Qué:** Vista `/projects/:projectId` que muestra todo lo relacionado al proyecto: tareas vinculadas, notas vinculadas, progreso, y acciones de status.

**Criterio de done:**

- [ ] Header con nombre del proyecto, status dropdown, prioridad dropdown
- [ ] Sección "Tareas" con lista de tareas del proyecto + "+ Nueva tarea" (crea con projectId pre-asignado)
- [ ] Barra de progreso: tareas completadas / total
- [ ] Checkbox en tareas funciona igual que en `/tasks`
- [ ] Sección "Notas vinculadas" con lista de notas que tienen este projectId en sus `projectIds`
- [ ] "+ Vincular nota" abre búsqueda de notas existentes (reusa `useNoteSearch` de F6 Fase 1)
- [ ] Click en nota navega a `/notes/:noteId`
- [ ] Breadcrumb "← Proyectos" para volver
- [ ] Si el proyecto no existe, redirect a `/projects`

**Archivos a crear:**

- `src/app/projects/[projectId]/page.tsx` — Página de detalle
- `src/components/projects/ProjectTaskList.tsx` — Lista de tareas del proyecto
- `src/components/projects/ProjectNoteList.tsx` — Lista de notas vinculadas
- `src/components/projects/NoteLinkModal.tsx` — Modal de búsqueda para vincular nota

**Notas de implementación:**

- Vincular nota = agregar `projectId` al array `projectIds` de la nota en `notesStore`. Bidireccional: también agregar `noteId` al array `noteIds` del proyecto en `projectsStore`.
- La búsqueda de notas reutiliza Orama (`useNoteSearch`) del F6 de Fase 1.
- Status dropdown: `<select>` nativo. Cambiar status = `setPartialRow('projects', id, { status, updatedAt })`.
- NO incluir: tabs Tareas/Notas/Info, timeline, deadline countdown. Simplicidad MVP.

---

### F6: Objetivos — Lista con progreso

**Qué:** Vista `/objectives` con lista de objetivos agrupados por área, mostrando progreso via proyectos vinculados.

**Criterio de done:**

- [ ] La ruta `/objectives` muestra todos los objetivos no archivados
- [ ] Objetivos agrupados por área
- [ ] Cada objective card muestra: nombre, status, deadline (fecha + "faltan X días"), proyectos vinculados con su progreso
- [ ] Barra de progreso: promedio del progreso de los proyectos vinculados (o 0% si no hay)
- [ ] "+ Nuevo objetivo" abre modal: nombre, área, deadline. Crea inline
- [ ] Click en objetivo expande: lista de proyectos vinculados, "+ Vincular proyecto"
- [ ] Click en proyecto vinculado navega a `/projects/:projectId`
- [ ] Empty state por área y global

**Archivos a crear:**

- `src/app/objectives/page.tsx` — Página con lista agrupada
- `src/components/objectives/ObjectiveCard.tsx` — Card con expand
- `src/components/objectives/ObjectiveCreateModal.tsx` — Modal de creación
- `src/hooks/useObjectives.ts` — CRUD: create, update, vincular proyecto

**Notas de implementación:**

- Progreso del objetivo = promedio del % de tareas completadas de cada proyecto vinculado. Se calcula en el render, no se persiste.
- "Faltan X días" usa `Intl.RelativeTimeFormat` (mismo helper de F8 Fase 1).
- Vincular proyecto = agregar `objectiveId` al proyecto + agregar `projectId` al objetivo. Bidireccional via `parseIds`/`stringifyIds`.
- NO incluir: tabs por quarter, filtros avanzados, countdown timer visual.

---

### F7: Habit Tracker — Grid semanal

**Qué:** Vista `/habits` con grid semanal de 14 hábitos. Toggle de hoy/ayer. Barra de progreso diario.

**Criterio de done:**

- [ ] La ruta `/habits` muestra una tabla: filas = 14 hábitos, columnas = 7 días de la semana actual
- [ ] Header muestra mes/año actual + "Hoy: X/14 (Y%)" con barra de progreso
- [ ] Celdas de hoy y ayer son clickeables (toggle ■/□). Días pasados y futuros son read-only
- [ ] Click en celda de hoy/ayer → toggle optimistic (TinyBase → Firestore async)
- [ ] Flechas ← → para navegar entre semanas
- [ ] Colores de celda: □ vacío `bg-muted`, ■ completado `bg-primary`
- [ ] Progreso recalculado al togglear (count de true / 14 \* 100)
- [ ] Empty state para semanas sin datos: grid con todas las celdas vacías
- [ ] Skeleton loading

**Archivos a crear:**

- `src/app/habits/page.tsx` — Página con grid
- `src/components/habits/HabitGrid.tsx` — Tabla semanal
- `src/components/habits/HabitRow.tsx` — Fila de un hábito
- `src/hooks/useHabits.ts` — CRUD: getWeek, toggleHabit, createEntryIfMissing

**Notas de implementación:**

- Cada día es un doc en `users/{uid}/habits/YYYY-MM-DD` con los 14 booleans.
- `useHabits(weekStart)` retorna 7 entries (uno por día). Si un día no tiene doc, lo crea al primer toggle con todos los hábitos en false.
- El ID determinístico (`YYYY-MM-DD`) evita duplicados.
- Los 14 hábitos están definidos en un array constante `HABITS` en `src/types/habit.ts`:
  ```typescript
  const HABITS = [
    { key: 'ejercicio', label: 'Ejercicio', emoji: '🏋️' },
    { key: 'codear', label: 'Codear', emoji: '💻' },
    // ... 14 total
  ] as const;
  ```
- Estilo grid inspirado en GitHub contributions (MASTER.md sección "Habit tracker grid"): celdas 28x28px con gap 2px.
- NO incluir: racha más larga, mejor semana, detalle por hábito, hábitos custom, vista mensual. Simplicidad MVP.

---

### F8: Dashboard expandido

**Qué:** Agregar al dashboard de Fase 1 (F9) las cards de Tareas de hoy, Proyectos activos, y Hábitos de hoy.

**Criterio de done:**

- [ ] Card "✅ Tareas de hoy" muestra top 5 tareas con dueDate=hoy. Checkbox funcional. Link "Ver todas →"
- [ ] Card "🚀 Proyectos activos" muestra proyectos con status=in-progress. Count de tareas pendientes. Link "Ver todos →"
- [ ] Card "☑️ Hábitos de hoy" muestra checkboxes inline de los 14 hábitos + barra de progreso. Toggles funcionales
- [ ] Grid del dashboard: 2x2 en desktop (tareas+inbox arriba, proyectos+notas abajo), stack en mobile. Hábitos ocupa full-width debajo
- [ ] Las cards existentes (Inbox, Notas recientes) se mantienen

**Archivos a crear:**

- `src/components/dashboard/TasksTodayCard.tsx` — Card de tareas de hoy
- `src/components/dashboard/ProjectsActiveCard.tsx` — Card de proyectos activos
- `src/components/dashboard/HabitsTodayCard.tsx` — Card de hábitos con checkboxes inline

**Archivos a modificar:**

- `src/app/page.tsx` — Agregar las 3 cards nuevas al grid

**Notas de implementación:**

- TasksTodayCard reutiliza `useTasks` de F3 filtrado por dueDate=hoy.
- ProjectsActiveCard reutiliza `useProjects` de F4 filtrado por status=in-progress.
- HabitsTodayCard reutiliza `useHabits` de F7 con la fecha de hoy.
- Los checkboxes de tareas y hábitos en el dashboard son funcionales (no solo lectura) — misma lógica de toggle.
- El grid cambia de 2 columnas a 3 columnas en `2xl` para aprovechar pantallas anchas: tareas+inbox+proyectos arriba, notas+hábitos abajo.

---

## Orden de implementación

1. **F1: Stores + Types** → Fundación de datos para todo. Sin stores no hay nada.
2. **F2: Rutas + Sidebar** → Habilita navegación. Depende de F1 solo conceptualmente (las rutas son placeholders).
3. **F3: Tareas** → Feature más usada diariamente. Depende de F1 (tasksStore).
4. **F4: Proyectos lista** → Contenedor de tareas. Depende de F1 (projectsStore) y F3 (count de tareas).
5. **F5: Proyecto detalle** → Conecta tareas + notas al proyecto. Depende de F3, F4, y Orama de Fase 1.
6. **F6: Objetivos** → Alto nivel, depende de F4 (progreso via proyectos vinculados).
7. **F7: Hábitos** → Independiente del resto — puede hacerse en paralelo desde F1.
8. **F8: Dashboard** → Consume datos de F3, F4, F7. Se hace al final.

---

## Estructura de archivos nuevos

```
src/
├── app/
│   ├── tasks/
│   │   └── page.tsx                    # Lista de tareas con tabs (F3)
│   ├── projects/
│   │   ├── page.tsx                    # Lista de proyectos (F4)
│   │   └── [projectId]/
│   │       └── page.tsx                # Detalle de proyecto (F5)
│   ├── objectives/
│   │   └── page.tsx                    # Lista de objetivos (F6)
│   └── habits/
│       └── page.tsx                    # Habit tracker grid (F7)
│
├── components/
│   ├── tasks/
│   │   ├── TaskCard.tsx                # Card de tarea con expand (F3)
│   │   └── TaskInlineCreate.tsx        # Input de creación inline (F3)
│   ├── projects/
│   │   ├── ProjectCard.tsx             # Card de proyecto (F4)
│   │   ├── ProjectCreateModal.tsx      # Modal de creación (F4)
│   │   ├── ProjectTaskList.tsx         # Tareas del proyecto (F5)
│   │   ├── ProjectNoteList.tsx         # Notas vinculadas (F5)
│   │   └── NoteLinkModal.tsx           # Buscar nota para vincular (F5)
│   ├── objectives/
│   │   ├── ObjectiveCard.tsx           # Card con expand (F6)
│   │   └── ObjectiveCreateModal.tsx    # Modal de creación (F6)
│   ├── habits/
│   │   ├── HabitGrid.tsx              # Tabla semanal (F7)
│   │   └── HabitRow.tsx               # Fila de un hábito (F7)
│   └── dashboard/
│       ├── TasksTodayCard.tsx          # Card tareas hoy (F8)
│       ├── ProjectsActiveCard.tsx      # Card proyectos activos (F8)
│       └── HabitsTodayCard.tsx         # Card hábitos hoy (F8)
│
├── hooks/
│   ├── useTasks.ts                     # CRUD tareas (F3)
│   ├── useProjects.ts                  # CRUD proyectos (F4)
│   ├── useObjectives.ts                # CRUD objetivos (F6)
│   └── useHabits.ts                    # CRUD hábitos (F7)
│
├── stores/
│   ├── tasksStore.ts                   # Nuevo (F1)
│   ├── projectsStore.ts               # Nuevo (F1)
│   ├── objectivesStore.ts             # Nuevo (F1)
│   └── habitsStore.ts                  # Nuevo (F1)
│
└── types/
    ├── task.ts                         # Interface Task (F1)
    ├── project.ts                      # Interface Project (F1)
    ├── objective.ts                    # Interface Objective (F1)
    └── habit.ts                        # Interface HabitEntry + HABITS const (F1)
```

---

## Definiciones técnicas

### D1: Áreas — map hardcoded, no entidad CRUD

Las áreas en Fase 2 son un map estático definido en `src/types/area.ts`:

```typescript
const AREAS = {
  proyectos: { label: 'Proyectos', emoji: '🚀' },
  conocimiento: { label: 'Conocimiento', emoji: '🧠' },
  finanzas: { label: 'Finanzas', emoji: '💵' },
  salud: { label: 'Salud y Ejercicio', emoji: '💪' },
  pareja: { label: 'Pareja', emoji: '❤️' },
  habitos: { label: 'Hábitos', emoji: '✅' },
} as const;
```

Los selects de área en tareas/proyectos/objetivos leen de este map. Si en el futuro se quieren áreas CRUD, se migra a un store — pero para 6 áreas fijas es overkill.

### D2: Kanban — NO en MVP

El doc 02 de UX muestra kanban con drag para proyectos. En MVP se hace lista agrupada por status. Razón: kanban requiere dnd-kit (~15KB), lógica de reorder, y testing de edge cases de drag. La lista agrupada da el mismo valor funcional con 10% del esfuerzo.

### D3: Vinculación bidireccional entidades

Cuando se vincula una tarea a un proyecto:

- Se escribe `projectId` en la tarea (`tasksStore`)
- Se agrega el `taskId` al array `taskIds` del proyecto (`projectsStore`)
  Ambos writes son client-side, misma transacción lógica. Si uno falla, queda inconsistente — aceptable para MVP single-user. Cloud Function de reconciliación es post-MVP.

---

## Checklist de completado

Al terminar Fase 2, TODAS estas condiciones deben ser verdaderas:

- [ ] `npm run build` compila sin errores ni warnings de TypeScript
- [ ] La app despliega correctamente en Firebase Hosting
- [ ] El usuario puede crear, editar, completar y ver tareas con fecha y prioridad
- [ ] Las tareas se filtran por Hoy / Pronto / Completadas
- [ ] El usuario puede crear proyectos con status y prioridad
- [ ] El detalle de proyecto muestra tareas vinculadas con progreso
- [ ] Las notas se pueden vincular a proyectos desde el detalle
- [ ] El usuario puede crear objetivos con deadline y vincular proyectos
- [ ] El progreso de objetivos refleja el progreso de sus proyectos
- [ ] El usuario puede togglear hábitos diarios en un grid semanal
- [ ] El dashboard muestra tareas de hoy, proyectos activos, y hábitos de hoy
- [ ] Todos los sidebar items están activos y navegan correctamente
- [ ] Los datos persisten en Firestore después de recargar
- [ ] Optimistic updates en todos los toggles (checkboxes, status changes)
- [ ] Skeleton loading en todas las vistas nuevas
- [ ] Todos los componentes usan tokens del design system (MASTER.md)

---

## Siguiente fase

**Fase 3 (AI Pipeline):** Claude Haiku procesa el inbox automáticamente (sugiere tipo, tags, resumen), InboxProcessor UI para revisar/aceptar sugerencias, auto-tagging de notas, y Command Palette (⌘K) para búsqueda global. Fase 2 completa la capa de ejecución — Fase 3 agrega inteligencia que reduce la fricción de organizar.
