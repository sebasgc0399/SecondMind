# SecondMind

Sistema de productividad y conocimiento personal construido desde código. Combina ejecución (tareas, proyectos, hábitos) con conocimiento vivo (notas atómicas Zettelkasten, links bidireccionales, grafo, AI copilot).

**Producción:** https://secondmind.web.app

---

## Qué es

SecondMind es un "segundo cerebro" digital: una app para capturar ideas sin fricción, procesarlas en notas atómicas interconectadas, y usar ese conocimiento para alimentar proyectos, decisiones y hábitos diarios.

El proyecto nace de la experiencia de usar Notion como Segundo Cerebro y detectar sus límites: las notas entran y mueren, no hay conexiones entre ideas, la captura es lenta, y el inbox se acumula porque procesarlo es tedioso. SecondMind intenta resolver eso desde código, con un stack optimizado para instantaneidad, offline-first, y AI como copiloto.

Los principios de diseño, la teoría detrás (CODE de Tiago Forte, Zettelkasten), el modelo de datos y los flujos UX están documentados en [`Docs/`](Docs/).

## Stack

- **UI:** React 19 + TypeScript strict + Vite + Tailwind CSS v4 + shadcn/ui (sobre Base UI)
- **Estado:** TinyBase v8 con custom persister Firestore
- **Editor:** TipTap (ProseMirror) con extensiones custom — wikilinks, slash commands, tags
- **Búsqueda:** Orama (FTS client-side)
- **Backend:** Firebase — Firestore + Cloud Functions v2 + Auth + Hosting
- **AI:** Claude Haiku (inbox processing) + OpenAI embeddings

## Estado actual

Las fases y su progreso se llevan en [CLAUDE.md](CLAUDE.md) y cada una tiene su SPEC en [`Spec/`](Spec/).

- **Fase 0 — Setup** ✅ Proyecto compilando, auth con Google, sync TinyBase ↔ Firestore, deploy a Firebase Hosting
- **Fase 0.1 — Toolkit** ✅ MCPs (Firebase, Context7, Playwright, Brave Search), skills de frontend/UX, hooks de formato automático (Prettier + ESLint en PostToolUse), protección de la rama main
- **Fase 1 — MVP** ✅ Primera versión usable diariamente. 9 features completas:
  - **F1 · Router:** React Router con layout (sidebar + outlet) y rutas `/`, `/inbox`, `/notes`, `/notes/:noteId`, `/settings`
  - **F2 · Stores:** TinyBase v8 con schemas de notes/links/inbox y custom persister Firestore con `merge: true`
  - **F3 · Quick Capture:** modal global con shortcut `Alt+N`, animación de confirmación, escribe al `inboxStore` sin clasificar
  - **F4 · Editor:** TipTap con StarterKit + Node custom `wikilink` + autocompletado al escribir `[[`. Auto-save con debounce de 2s. El JSON del doc va directo a Firestore; la metadata a TinyBase
  - **F5 · Links bidireccionales:** cada save sincroniza los wikilinks contra la colección `links/` con IDs determinísticos `source__target`. Filtra self-links y actualiza `incomingLinkIds`/`outgoingLinkIds` en ambas notas
  - **F6 · Lista de notas + búsqueda:** vista `/notes` con FTS client-side vía Orama (rebuild on change del `notesStore`), cards con título/snippet/badges/fecha relativa, y botón "Nueva nota"
  - **F7 · BacklinksPanel:** panel lateral en el editor que muestra las notas que apuntan a la actual, con contexto del párrafo. Toggleable, default abierto en desktop y cerrado en mobile. Resuelve títulos frescos haciendo join con `notesStore`
  - **F8 · Vista Inbox:** `/inbox` con lista de items pendientes, acciones "Convertir a nota" y "Descartar". Badge reactivo con el count en el sidebar
  - **F9 · Dashboard:** `/` con saludo contextual (mañana/tarde/noche), botón de captura rápida, card de inbox con los 3 items más recientes y card de notas recientes con las 5 últimas actualizaciones

- **Fase 2 — Ejecución** ✅ La capa de acción. 8 features completas:
  - **F1 · Stores y types:** `tasksStore`, `projectsStore`, `objectivesStore`, `habitsStore` con schemas TinyBase + persister Firestore. Types para las 4 entidades + `HABITS` const con los 14 hábitos hardcoded + `AREAS` map con las 6 áreas PARA. Alinea `TaskStatus` y agrega `ObjectiveStatus` a `common.ts`
  - **F2 · Rutas y sidebar activo:** 5 rutas nuevas (`/tasks`, `/projects`, `/projects/:projectId`, `/objectives`, `/habits`) y activación de los 4 items del sidebar que antes estaban disabled. Active state por prefix match de NavLink
  - **F3 · Tareas:** `/tasks` con tabs Hoy/Pronto/Completadas, creación inline con `Enter`, `TaskCard` con priority badge color-coded (verde/amarillo/naranja/rojo), expand inline para editar descripción/prioridad/proyecto/fecha, y checkbox optimistic vía TinyBase. Tab "Hoy" incluye vencidas en sección separada; tab "Pronto" agrupa por día con `Intl.DateTimeFormat`
  - **F4 · Proyectos:** `/projects` con lista agrupada por status (En progreso → No empezados → En pausa; completados ocultos). `ProjectCard` con count reactivo de tareas pendientes calculado cross-store (`useTable('tasks')` + `useMemo`). Modal de creación con área + prioridad que navega al detalle tras crear
  - **F5 · Detalle de proyecto:** `/projects/:projectId` con header (nombre + selects de status/prioridad), barra de progreso completadas/total, sección Tareas que reusa `TaskCard` con `projectId` pre-asignado, y sección Notas vinculadas con `NoteLinkModal` que reusa `useNoteSearch` de Orama. Vinculación bidireccional client-side `note.projectIds ↔ project.noteIds`
  - **F6 · Objetivos:** `/objectives` con lista agrupada por área. `ObjectiveCard` con progreso agregado (promedio del % de tareas completadas de cada proyecto vinculado), deadline formateado ("faltan N días" / "hoy" / "vencido hace N días"), y expand inline con `<select>` "+ Vincular proyecto..." que dispara el link bidireccional `objective.projectIds ↔ project.objectiveId`
  - **F7 · Habit tracker:** `/habits` con grid semanal 14×7 (14 hábitos × 7 días, lunes inicia la semana). Navegación ← → entre semanas, toggle de hoy/ayer clickeable, días pasados/futuros read-only. Barra de progreso de hoy referida al día real aunque se navegue a otra semana. IDs determinísticos `YYYY-MM-DD` como `rowId` y `docId`, con docs creados implícitamente en el primer toggle
  - **F8 · Dashboard expandido:** reestructura `/` con 5 cards en grid 2×2 + hábitos full-width — `TasksTodayCard` (top 5 tareas de hoy con checkbox funcional), `InboxCard` existente, `ProjectsActiveCard` (proyectos in-progress con count reactivo), `RecentNotesCard` existente, y `HabitsTodayCard` (14 pills toggleables con barra de progreso)

**Ya se puede usar a diario:** capturar ideas con `Alt+N`, escribir notas atómicas con wikilinks y backlinks, buscar instantáneamente, procesar el inbox manualmente, organizar tareas con fecha y prioridad en proyectos con progreso, definir objetivos de alto nivel con deadline y proyectos vinculados, trackear 14 hábitos diarios en el grid semanal, y ver todo junto en el dashboard.

- **Fase 3 — AI Pipeline:** próxima. Claude Haiku procesando el inbox automáticamente (título/tags/tipo/resumen sugeridos), `InboxProcessor` UI para revisar y aceptar sugerencias, auto-tagging de notas nuevas, y `Command Palette` (⌘K) para búsqueda y navegación global

## Setup local

Requisitos:

- Node.js 20 o superior
- Un proyecto Firebase propio con Auth (Google sign-in) y Firestore habilitados

Pasos:

```bash
# Clonar e instalar
git clone https://github.com/sebasgc0399/SecondMind.git
cd SecondMind
npm install

# Configurar variables de entorno
cp .env.example .env.local
# Editar .env.local con las credenciales de tu proyecto Firebase

# Desplegar las security rules de Firestore (primera vez)
npx firebase login
npx firebase use --add   # seleccionar tu proyecto
npm run deploy:rules

# Correr en desarrollo
npm run dev
```

## Comandos

```bash
npm run dev           # Servidor de desarrollo (Vite)
npm run build         # Build de producción (tsc + vite build)
npm run lint          # ESLint sobre src/
npm run preview       # Preview del build local
npm run deploy        # Build + deploy a Firebase Hosting
npm run deploy:rules  # Deploy de Firestore security rules
```

## Documentación

Toda la documentación técnica y de diseño vive en [`Docs/`](Docs/):

- [`00-fundamentos-segundo-cerebro.md`](Docs/00-fundamentos-segundo-cerebro.md) — principios teóricos (CODE, Zettelkasten, 10 principios de diseño)
- [`01-arquitectura-hibrida-progresiva.md`](Docs/01-arquitectura-hibrida-progresiva.md) — stack completo, modelo de datos Firestore, flujos clave, fases, decisiones de diseño
- [`02-flujos-ux-y-pantallas.md`](Docs/02-flujos-ux-y-pantallas.md) — 14 pantallas con wireframes, 5 flujos de usuario, shortcuts, responsive
- [`03-convenciones-y-patrones.md`](Docs/03-convenciones-y-patrones.md) — naming, componentes React, TinyBase, TypeScript, Tailwind, errores, Git

Las SPECs por fase están en [`Spec/`](Spec/).
