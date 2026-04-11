# SPEC — SecondMind · Fase 2: Ejecución — Tareas + Proyectos + Objetivos + Hábitos (Completada)

> Registro de lo implementado en la capa de ejecución.
> Completada: Abril 2026

---

## Objetivo

La capa de ejecución del sistema. El usuario crea tareas con fecha y prioridad, las agrupa en proyectos con progreso derivado de las tareas completadas, define objetivos de alto nivel con deadline y progreso agregado de los proyectos vinculados, y trackea 14 hábitos diarios en un grid semanal con toggle de hoy/ayer. Todo conectado bidireccionalmente con las notas de Fase 1 — tareas pueden referenciar notas, proyectos vinculan notas existentes vía búsqueda Orama, y objetivos agrupan proyectos. El dashboard de Fase 1 se expande con 5 cards que consolidan tareas de hoy, inbox, proyectos activos, notas recientes y hábitos del día.

---

## Features implementadas

### F1: TinyBase stores + types — fundación de datos

Crea 4 stores (`tasksStore`, `projectsStore`, `objectivesStore`, `habitsStore`) con `createStore().setTablesSchema` clonando el patrón de F2 de Fase 1. Types para las 4 entidades en `src/types/{task,project,objective,habit}.ts` + `HABITS` const con 14 hábitos hardcoded (`{ key, label, emoji }`) + `AREAS` map con 6 áreas PARA en `src/types/area.ts`. Actualiza `TaskStatus` en `common.ts` (drop `'todo'`, add `'delegated'` — alinea con SPEC original de Fase 2) y agrega `ObjectiveStatus`. `useStoreInit` extendido con 4 persisters nuevos (7 en total), y `main.tsx` agrega los 4 stores a `storesById` del `Provider` (notesStore sigue siendo el default). Decisión del schema: `projectId`/`areaId`/`objectiveId` son **singulares** en Task (una tarea pertenece a UN proyecto), mientras que `taskIds`/`noteIds` son JSON arrays serializados en Project/Objective. `HabitEntry` usa ID determinístico `YYYY-MM-DD` como rowId — el día ES el ID, sin UUIDs.

### F2: Rutas + sidebar activo

Agrega 5 rutas al `createBrowserRouter` como children del Layout: `/tasks`, `/projects`, `/projects/:projectId`, `/objectives`, `/habits`. Cada una con un placeholder minimal (el detalle de proyecto usa `useParams` para validar el route param). El sidebar tenía 4 items con `disabled=true` — la modificación solo agrega `to: '/...'` al array `navItems`, y el render condicional preexistente los convierte automáticamente en `<NavLink>` con active state por prefix match (sin `end`). `Dashboard` mantiene `end: true` para no capturar todas las rutas. El item "Proyectos" queda activo también en `/projects/:projectId` por el prefix matching natural de NavLink.

### F3: Tareas — CRUD + vistas temporales

`useTasks` clona el patrón de `useInbox` de Fase 1: `useTable('tasks', 'tasks')` reactivo + grace period 200ms + parse con `useMemo` + actions (`createTask`, `updateTask`, `completeTask`) con dual write `setDoc(merge: true)` + `tasksStore.setRow/setPartialRow`. `completeTask` es un toggle — destildar una tarea completada la vuelve a `in-progress`. `TasksPage` con tabs Hoy/Pronto/Completadas en `useState` local (no URL state, decisión MVP). Filtro con `useMemo`: tab **"Hoy"** incluye vencidas en sección separada `⚠️ Vencidas` + sección `📅 Hoy`; tab **"Pronto"** agrupa tareas de los próximos 7 días por día con `Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'short' })`; tab **"Completadas"** limita a 20 más recientes ordenadas por `completedAt` desc. `TaskCard` es el componente master de tarea — se reutiliza sin modificaciones en F5 (detalle de proyecto) y F8 (dashboard). `TaskInlineCreate` con handlers `Enter`/`Escape`. Priority dot color-coded (verde/amarillo/naranja/rojo) via `PRIORITY_STYLES` map — duplicado intencionalmente en F4/F8 (CLAUDE.md: "three similar lines beat premature abstraction"). Expand inline con `useState` local (no modal) para editar descripción + selects nativos de prioridad/proyecto/fecha. Agrega `startOfDay(ms)` e `isSameDay(a, b)` a `src/lib/formatDate.ts`.

### F4: Proyectos — lista con status + modal

`useProjects` clonado directamente de `useTasks`. `ProjectsPage` con grupos por status en orden `in-progress → not-started → on-hold` (completed ocultos por default, decisión D2 del SPEC original — kanban excluido por overhead vs valor en MVP). Cross-store task count reactivo: `useTable('tasks', 'tasks')` + `useMemo` que construye `Record<projectId, number>` filtrando `status !== 'completed'`. `ProjectCard` es un `<Link>` wrap completo a `/projects/:id` con nombre + priority badge + área (emoji + label del map `AREAS`) + count de tareas pendientes (con singular/plural correcto: "1 tarea pendiente" / "N tareas pendientes"). `ProjectCreateModal` clona la shell del `QuickCapture` de Fase 1 (base-ui `Dialog.Root` controlled, Backdrop + Popup + Title, animations con `data-starting-style`/`data-ending-style`). Form con input nombre + select área + select prioridad + `autoFocus`, reset del form via `useEffect([open])` al cerrar, navega a `/projects/:id` tras crear. **Workaround del deprecation de `React.FormEvent`**: inline arrow `onSubmit={(event) => { event.preventDefault(); void submit(); }}` — evita importar el type deprecated y permite que TypeScript infiera desde el prop de `<form>`.

### F5: Detalle de proyecto — tareas + notas vinculadas + progreso

Reemplaza el placeholder F2 en `src/app/projects/[projectId]/page.tsx`. Layout: back link `← Proyectos` + `<h1>` con el nombre + selects de status/prioridad que disparan `updateProject`, barra de progreso (completadas/total con `div + width: X%` inline Tailwind), sección Tareas reusando `TaskCard` filtrado por `task.projectId === projectId`, y sección Notas vinculadas con `ProjectNoteList` + `NoteLinkModal`. `handleCreateTask` hace doble op: `createTask(name)` seguido de `updateTask(taskId, { projectId })` — el projectId se pre-asigna a la tarea sin tocar la API de `useTasks`. `ProjectNoteList` renderiza los backlinks via `useTable('notes')` + `parseIds(row.projectIds).includes(projectId)` — Orama no sirve acá porque su schema no incluye `projectIds`. Cada item es un `<Link>` al editor de la nota + botón `×` para unlink con `stopPropagation`. `NoteLinkModal` clona la shell del `ProjectCreateModal` pero con `useNoteSearch` dentro (el hook Orama de F6 de Fase 1), filtra los resultados por `excludeNoteIds` para no ofrecer las ya vinculadas, click en una nota dispara `onPick` y cierra. Vinculación bidireccional client-side en el page: `handleLinkNote` hace `updateDoc(Firestore)` + `setPartialRow(TinyBase)` sobre la nota para agregar el `projectId` a su array `projectIds`, y llama `updateProject(id, { noteIds: [...project.noteIds, noteId] })` para el otro lado. `handleUnlinkNote` es el inverso. Dos writes separados sin transacción — D3 del SPEC original acepta la inconsistencia en MVP single-user. Redirect a `/projects` si el proyecto no existe, con **grace dedicado de 1500ms** (no el `isInitializing` del hook de 200ms): bug encontrado en testing — la hidratación de Firestore en un full-reload directo por URL tarda más que 200ms y el redirect disparaba prematuramente.

### F6: Objetivos — lista con progreso agregado

`useObjectives` clonado del patrón de `useProjects`, sin select de priority (el schema `Objective` no la tiene). `ObjectivesPage` con grupos por área siguiendo `AREA_ORDER` del map `AREAS` (proyectos, conocimiento, finanzas, salud, pareja, habitos). Cross-store triple: `useTable('tasks')` para construir `tasksByProjectId: Record<string, {total, completed}>`, `useProjects()` para resolver nombres de proyectos vinculados, y `useObjectives()` para el listado de objetivos. Helper `computeProgress(projectIds)` = promedio del `% completadas` de cada proyecto vinculado (`Math.round` del promedio de porcentajes, no del total agregado). `ObjectiveCard` con expand inline que muestra los proyectos vinculados con mini-progress por proyecto (`N%`) + un `<select>` "+ Vincular proyecto..." con los disponibles (resetea a `""` después del link, pattern nativo sin state extra). Deadline formatting helper local en el archivo: "30 jun 2026 · faltan 80 días" / "· mañana" / "· hoy" / "· vencido hace N días" / "Sin deadline". `ObjectiveCreateModal` sin select de prioridad, con input `type="date"` opcional para deadline. **Fuente de verdad para el render**: `projects.filter(p => p.objectiveId === objective.id)` — NO `objective.projectIds.map(...)`. Evita drift visual si el usuario reasigna un proyecto a otro objetivo (la relación Project↔Objective es 1:N por el schema: `Project.objectiveId` singular, `Objective.projectIds` plural — el lado singular es autoritativo). Vinculación bidireccional en el page con `handleLinkProject` / `handleUnlinkProject`.

### F7: Habit tracker — grid semanal

`useHabits(weekStart: Date)` toma `weekStart` como parámetro (memoizado en el page con `useMemo(() => getWeekStart(new Date()), [])`) y devuelve 7 entries (uno por día de la semana mostrada, synthesized con todos los booleans en `false` si la row no existe en el store). Helpers exportados del hook para reuso en F8: `formatDateKey(date)` → `'YYYY-MM-DD'`, `addDays(date, n)`, `getWeekStart(date)` — lunes inicia la semana (convención LATAM/europea, si `getDay() === 0` retrocede 6 días). `HabitsPage` con state local `weekStart`, navegación `← →` entre semanas, barra de progreso de **hoy real** (no del día/semana mostrada) leída con `useTable('habits', 'habits')` directo para ser reactiva aunque el usuario esté viendo otra semana. `HabitGrid` con `<table>` semántica: `thead` con 7 columnas (labels de día vía `Intl.DateTimeFormat('es', { weekday: 'narrow' })` — que en español narrow devuelve **L M X J V S D** porque "X" es miércoles, no "M" duplicada) + fecha del día. `tbody` con una fila por hábito vía `HabitRow`. `HabitRow` con label (emoji + nombre) + 7 celdas cuadradas de 28×28px — cada una es un `<button>` con colores: completado `bg-primary`, vacío editable `bg-muted` (hoy/ayer), pasado read-only `bg-muted opacity-60 disabled`, futuro `bg-transparent border-dashed disabled`. Edit window = `Set<{todayKey, yesterdayKey}>` calculado al mount. ID determinístico `YYYY-MM-DD` tanto como `rowId` de TinyBase como `docId` de Firestore — los docs se crean implícitamente al primer toggle vía `setPartialRow`, sin un create explícito.

### F8: Dashboard expandido

Reestructura `src/app/page.tsx` con `max-w-4xl → max-w-5xl` para acomodar 5 cards. Grid `lg:grid-cols-2` con orden `[TasksTodayCard][InboxCard]` + `[ProjectsActiveCard][RecentNotesCard]` + `HabitsTodayCard` full-width abajo. `TasksTodayCard` filtra `dueDate === hoy && status !== 'completed'`, top 5, cada item con checkbox funcional (`completeTask` optimistic, la tarea desaparece del card post-filtro) + priority dot color-coded + `<Link>` a `/tasks`. `ProjectsActiveCard` filtra `status === 'in-progress' && !isArchived`, cross-store task counts idéntico al patrón de F4. Read-only: click en un proyecto navega al detalle. `HabitsTodayCard` llama `useHabits(getWeekStart(today))` (memoizado), busca `todayEntry = weekEntries.find(e => e.id === todayKey)`, renderiza los 14 hábitos como pills `flex-wrap` toggleables (emoji + label, completado `bg-primary`, vacío `bg-muted`). Header con contador `X/14 (Y%)` + barra de progreso. Link "Ver semana →" a `/habits`. **Bug encontrado y arreglado durante testing**: race condition en `useHabits.toggleHabit`. Dos clicks rápidos a hábitos distintos se pisaban porque el flujo era `await setDoc() → setRow(nextRow)` con el row completo — el click 2 leía `existingRow` **stale** (antes de que resolviera el `setDoc` del click 1), construía su propio `nextRow` con solo su hábito, y cuando ambas promises resolvían, el segundo `setRow` pisaba el primero. **Fix**: invertir el orden (`setPartialRow` local **PRIMERO** sync, `setDoc` Firestore **DESPUÉS** async), y cambiar de `setRow` (full replace) a `setPartialRow` (solo el campo flipado + `progress` recalculado + `updatedAt`). `setPartialRow` es commutative entre campos distintos, `setRow` no.

---

## Decisiones técnicas que cambiaron vs lo planeado

| Planeado                                                                                       | Implementado                                                                                                       | Razón                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TaskStatus = 'inbox' \| 'todo' \| 'in-progress' \| 'waiting' \| 'completed'` (en `common.ts`) | Alineado al SPEC: `'inbox' \| 'in-progress' \| 'waiting' \| 'delegated' \| 'completed'`                            | `common.ts` de Fase 1 tenía un placeholder con `'todo'` que nunca se consumió. F1 alineó al SPEC (drop `'todo'`, add `'delegated'`) para evitar confusión y mantener consistencia                                                                          |
| Redirect en `ProjectDetailPage` usa `isInitializing` del hook (200ms) como gate                | Grace dedicado `redirectGraceExpired` local de 1500ms                                                              | Bug encontrado en testing de F5. El grace de 200ms del hook es para evitar skeleton flash, no para esperar hidratación completa de Firestore. En full-reload directo por URL la row del proyecto tarda >200ms en aparecer y el redirect disparaba antes    |
| `useHabits.toggleHabit` con `setDoc(await) → setRow(nextRow)` y row completo                   | `setPartialRow` local **PRIMERO** + `setDoc` Firestore **DESPUÉS**, y solo el campo flipado + progress + updatedAt | Bug de race encontrado en testing de F8. Dos clicks rápidos se pisaban porque el click 2 leía `existingRow` stale. La inversión + `setPartialRow` (commutative entre campos distintos) lo resuelve y reduce bandwidth de Firestore                         |
| `PRIORITY_STYLES` / `PRIORITY_LABELS` extraídos a un helper compartido                         | Duplicados en `TaskCard`, `ProjectCard`, `TasksTodayCard`                                                          | CLAUDE.md: "three similar lines beat premature abstraction". 8 líneas de mapa trivial × 3 usos no justifica extraer — cuando aparezca el 4to uso se evalúa                                                                                                 |
| `handleSubmit` tipado con `React.FormEvent<HTMLFormElement>`                                   | Inline arrow `onSubmit={(event) => { event.preventDefault(); void submit(); }}`                                    | `React.FormEvent` está deprecated en los types de React 19. La inline arrow permite que TypeScript infiera el tipo desde el prop de `<form>` sin necesidad de importar el type deprecated                                                                  |
| Vincular proyecto al objetivo via modal (análogo a `NoteLinkModal` de F5)                      | `<select>` nativo con "+ Vincular proyecto..." como placeholder, dentro del expand del `ObjectiveCard`             | Modal es overkill para pocos proyectos. El select nativo es compacto, funciona inline con el expand, no requiere state extra (resetea a `""` post-link), y ahorra un componente                                                                            |
| Render de proyectos vinculados a un objetivo via `objective.projectIds.map(...)`               | `projects.filter(p => p.objectiveId === objective.id)` como fuente de verdad                                       | La relación Objective↔Project es 1:N por el schema (`Project.objectiveId` es singular). Si el usuario reasigna un proyecto a otro objetivo, `project.objectiveId` es autoritativo; `objective.projectIds` puede driftar. Usar el singular elimina el drift |
| Grid dashboard con 3 columnas en `2xl` (del SPEC F8)                                           | Solo 2×2 en `lg` + hábitos full-width                                                                              | El 3-col en `2xl` del SPEC era opcional. Quedó fuera de MVP — no cambia la funcionalidad y requiere ajustes visuales que se validan post-launch con uso real                                                                                               |
| Label del grid de hábitos "L M M J V S D"                                                      | "L M X J V S D" (X = miércoles en español narrow)                                                                  | El SPEC escribió "L M M J V S D" por convención informal. `Intl.DateTimeFormat('es', { weekday: 'narrow' })` devuelve "X" para miércoles (la M duplicada es ambigua en `narrow`). Se usa el resultado de Intl — canónico, cero hardcode del array          |

---

## Archivos creados — por feature

**F1 — Stores y types:**

- `src/stores/tasksStore.ts`, `src/stores/projectsStore.ts`, `src/stores/objectivesStore.ts`, `src/stores/habitsStore.ts`
- `src/types/task.ts`, `src/types/project.ts`, `src/types/objective.ts`, `src/types/habit.ts` (incluye `HABITS` const + `HabitKey`), `src/types/area.ts` (incluye `AREAS` map + `AreaKey`)
- `src/types/common.ts` — actualizado con `TaskStatus` alineado y `ObjectiveStatus` nuevo
- `src/hooks/useStoreInit.ts` — extendido con 4 persisters nuevos
- `src/main.tsx` — extendido con los 4 stores en `storesById`

**F2 — Rutas y sidebar:**

- `src/app/tasks/page.tsx`, `src/app/projects/page.tsx`, `src/app/projects/[projectId]/page.tsx`, `src/app/objectives/page.tsx`, `src/app/habits/page.tsx` (placeholders mínimos, reemplazados en F3–F7)
- `src/app/router.tsx` — 5 imports + 5 entries como children del Layout
- `src/components/layout/Sidebar.tsx` — `to` agregado a los 4 items del array `navItems`

**F3 — Tareas:**

- `src/hooks/useTasks.ts`
- `src/components/tasks/TaskCard.tsx`, `src/components/tasks/TaskInlineCreate.tsx`
- `src/app/tasks/page.tsx` — reemplazo del placeholder con la página real
- `src/lib/formatDate.ts` — agrega `startOfDay(ms)` e `isSameDay(a, b)`

**F4 — Proyectos lista:**

- `src/hooks/useProjects.ts`
- `src/components/projects/ProjectCard.tsx`, `src/components/projects/ProjectCreateModal.tsx`
- `src/app/projects/page.tsx` — reemplazo del placeholder

**F5 — Detalle de proyecto:**

- `src/components/projects/ProjectNoteList.tsx`, `src/components/projects/NoteLinkModal.tsx`
- `src/app/projects/[projectId]/page.tsx` — reemplazo del placeholder, con handlers de link/unlink bidireccional, redirect grace local de 1500ms, cross-store con `useTable('notes')` para los linked notes

**F6 — Objetivos:**

- `src/hooks/useObjectives.ts`
- `src/components/objectives/ObjectiveCard.tsx`, `src/components/objectives/ObjectiveCreateModal.tsx`
- `src/app/objectives/page.tsx` — reemplazo del placeholder, con grupos por área + `computeProgress` agregado cross-store

**F7 — Habit tracker:**

- `src/hooks/useHabits.ts` — exporta también `formatDateKey`, `addDays`, `getWeekStart`
- `src/components/habits/HabitGrid.tsx`, `src/components/habits/HabitRow.tsx`
- `src/app/habits/page.tsx` — reemplazo del placeholder

**F8 — Dashboard expandido:**

- `src/components/dashboard/TasksTodayCard.tsx`, `src/components/dashboard/ProjectsActiveCard.tsx`, `src/components/dashboard/HabitsTodayCard.tsx`
- `src/app/page.tsx` — reestructurado con los 5 cards + `max-w-5xl`
- `src/hooks/useHabits.ts` — fix del race condition en `toggleHabit` (`setPartialRow` local-first + `setDoc` async-after)

---

## Checklist de completado

- [x] `npm run build` compila sin errores ni warnings de TypeScript
- [x] La app despliega correctamente en Firebase Hosting
- [x] El usuario puede crear, editar, completar y ver tareas con fecha y prioridad
- [x] Las tareas se filtran por Hoy / Pronto / Completadas
- [x] El usuario puede crear proyectos con status y prioridad
- [x] El detalle de proyecto muestra tareas vinculadas con barra de progreso
- [x] Las notas se pueden vincular y desvincular a proyectos desde el detalle
- [x] El usuario puede crear objetivos con deadline y vincular proyectos
- [x] El progreso de objetivos refleja el promedio del progreso de sus proyectos vinculados
- [x] El usuario puede togglear hábitos diarios en un grid semanal con navegación entre semanas
- [x] El dashboard muestra tareas de hoy, proyectos activos, y hábitos de hoy
- [x] Todos los sidebar items están activos y navegan correctamente
- [x] Los datos persisten en Firestore después de recargar
- [x] Optimistic updates en todos los toggles (checkboxes, status changes)
- [x] Skeleton loading con grace period 200ms en todas las vistas nuevas
- [x] Todos los componentes usan tokens del design system
- [x] Commits limpios con Conventional Commits en español

---

## Gotchas descubiertos

Conocimiento nuevo que salió de la implementación y que Fase 3+ deben respetar:

1. **Optimistic updates requieren local-first + Firestore-after**. El pattern correcto para toggles/updates frecuentes es `setPartialRow` local (sync) **antes** del `await setDoc` (async). Invertir el orden causa races en clicks rápidos a campos distintos porque el click N+1 lee `existingRow` stale mientras el `setDoc` del click N todavía no resolvió. Bug encontrado en `useHabits.toggleHabit` durante F8 y arreglado. Los demás hooks CRUD de Fase 2 (`useTasks`, `useProjects`, `useObjectives`) mantienen el orden inverso (`setDoc → setPartialRow`) porque hacen updates de un solo campo donde la race es improbable — pero deberían revisarse si aparecen síntomas similares

2. **`isInitializing` del hook (200ms) no es suficiente para decisiones de redirect por existencia de row**. El grace de 200ms está diseñado para evitar skeleton flash, no para esperar hidratación completa de Firestore. En un full-reload directo por URL (ej. `/projects/:id`), la row del recurso tarda >200ms en aparecer en el store. Para gates de navegación tipo "¿el recurso existe? → redirect" usar un grace dedicado más largo (1500ms) en el page. Pattern implementado en `ProjectDetailPage` con el flag `redirectGraceExpired`

3. **Vinculaciones 1:N — usar el lado singular como fuente de verdad** para el render. `project.objectiveId === objective.id` es más robusto que `objective.projectIds.includes(projectId)` porque evita drift visual cuando el usuario reasigna un recurso y los dos arrays no se sincronizaron en el mismo instante. El lado "uno" del 1:N es autoritativo

4. **ID determinístico en hábitos** — `YYYY-MM-DD` como `rowId` en TinyBase Y `docId` en Firestore. Los docs se crean implícitamente al primer toggle vía `setPartialRow` sin necesidad de un create explícito. Pattern reutilizable para cualquier entidad time-indexed (ej: un hipotético `dailyDigest` de Fase 4)

5. **`Intl.DateTimeFormat('es', { weekday: 'narrow' })` devuelve "X" para miércoles**, no "M". La convención "L M M J V S D" es informal (M duplicada es ambigua); la canónica en español narrow es "L M X J V S D". Usar el resultado de Intl directamente y no hardcodear el array de labels

6. **`React.FormEvent` está deprecated** en los types de React 19. Para forms simples, poner el handler inline en `onSubmit={(event) => { event.preventDefault(); void submit(); }}` — TypeScript infiere el tipo desde el prop de `<form>` sin necesidad de importar el type deprecated. Pattern en `ProjectCreateModal` y `ObjectiveCreateModal`

7. **Base-UI Dialog vs Radix data attributes**: base-ui usa `data-starting-style` y `data-ending-style` para animaciones de enter/exit, **no** `data-state` como Radix. Las clases `animate-in`/`animate-out` de `tw-animate-css` no aplican. Ya documentado en memoria `feedback_baseui_data_attributes` — pattern respetado en F4/F6 al clonar la shell del modal desde `QuickCapture`

---

## Dependencias agregadas

```
(ninguna)
```

Fase 2 no agregó dependencias nuevas — todo se construyó sobre el stack existente (TinyBase v8, base-ui, lucide-react, react-router, `Intl` nativo, Orama ya presente de Fase 1).

---

## Siguiente fase

Continuar con **Fase 3 — AI Pipeline:** Claude Haiku procesando el inbox automáticamente (título/tags/tipo/resumen sugeridos), `InboxProcessor` UI para revisar y aceptar las sugerencias, auto-tagging de notas nuevas, y `Command Palette` (⌘K) para búsqueda y navegación global. El SPEC vive en `Spec/SPEC-fase-3-ai-pipeline.md`. Fase 2 completó la capa de ejecución (acción); Fase 3 agrega inteligencia que reduce la fricción de organizar lo capturado.
