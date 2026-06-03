# 🎨 SecondMind — Flujos UX y Pantallas

> Documento de diseño UX. Define pantallas, navegación, flujos e interacciones.
> Fuente: `01-arquitectura-hibrida-progresiva.md`
> Este documento guía la implementación de UI — NO es el SPEC técnico.

---

## 1. Mapa de navegación

### Estructura general (Desktop)

```
┌──────────┬───────────────────────────────────────────┐
│          │                                           │
│  SIDEBAR │           CONTENT AREA                    │
│          │                                           │
│  ┌────┐  │  ┌─────────────────────────────────────┐  │
│  │ SM │  │  │                                     │  │
│  └────┘  │  │   Contenido dinámico de cada         │  │
│          │  │   pantalla (Dashboard, Editor,        │  │
│  ────────│  │   Listas, Graph, etc.)               │  │
│          │  │                                     │  │
│  □ Dash  │  │                                     │  │
│  □ Inbox │  │                                     │  │
│  □ Notas │  │                                     │  │
│  □ Tareas│  │                                     │  │
│  □ Proy  │  │                                     │  │
│  □ Objs  │  │                                     │  │
│  □ Hábit │  │                                     │  │
│          │  │                                     │  │
│  ────────│  └─────────────────────────────────────┘  │
│          │                                           │
│  □ Config│                                           │
│  ○ User  │                                           │
│          │                                           │
└──────────┴───────────────────────────────────────────┘

Overlays globales (accesibles desde cualquier pantalla):
  Alt+N → Quick Capture modal
  ⌘K    → Command Palette modal
```

### Estructura general (Mobile)

```
┌──────────────────────────┐
│  Header: Título + ⋮      │
├──────────────────────────┤
│                          │
│                          │
│   Contenido dinámico     │
│                          │
│                          │
│                          │
│                          │
│                          │
├──────────────────────────┤
│  ◇ Dash │ ◇ Notas │ ◇ Tareas │ ◇ Inbox │
└──────────────────────────┘

  FAB "+" flotante → Quick Capture
  Secciones secundarias (Proyectos, Objetivos, Hábitos,
  Grafo, Settings) → NavigationDrawer (hamburger), fuera de la bottom nav (F43)
```

### Navegación por plataforma

| Plataforma          | Patrón                              | Detalles                                                              |
| ------------------- | ----------------------------------- | --------------------------------------------------------------------- |
| Desktop (≥1024px)   | Sidebar fija (240px) + content area | Colapsable a iconos (64px) con ⌘/Ctrl+B; ocultable a TopBar (F31/F32) |
| Tablet (768-1023px) | Sidebar colapsada a iconos (64px)   | Inline, sin overlay                                                   |
| Mobile (≤767px)     | Bottom nav (4 items) + FAB          | NavigationDrawer para secciones secundarias                           |

---

## 2. Pantallas

> **Nota sobre los marcadores `Fase:`** — son históricos: indican en qué fase nació cada pantalla, no un estado pendiente. Todo lo listado (fases 0-5.2 + features F1-F50) está implementado y en prod. Etiquetas como `[Fase 1.1]` o `[MVP]` quedaron del diseño original.

---

### 2.1 Dashboard

**Ruta:** `/`
**Acceso:** Sidebar → Dashboard (item por defecto al abrir la app)
**Propósito:** Vista rápida del día — qué hacer, qué revisar, qué explorar
**Fase:** MVP

#### Layout

```
┌──────────────────────────────────────────────────┐
│  Buenos días, Sebastian          [⌘K] [+ Captura]│
├──────────────────────────────────────────────────┤
│                                                  │
│  ┌─────────────────────┐  ┌───────────────────┐  │
│  │ ✅ Tareas de hoy    │  │ 📬 Inbox (3)      │  │
│  │                     │  │                   │  │
│  │ □ Revisar PR #42    │  │ "Idea sobre..."   │  │
│  │ □ Escribir tests    │  │ "Link de artí..." │  │
│  │ ■ Llamar al banco   │  │ "Reunión con..."  │  │
│  │                     │  │                   │  │
│  │ [Ver todas →]       │  │ [Procesar →]      │  │
│  └─────────────────────┘  └───────────────────┘  │
│                                                  │
│  ┌─────────────────────┐  ┌───────────────────┐  │
│  │ 🚀 Proyectos activos│  │ 💡 Daily Digest   │  │
│  │                     │  │    [Fase 1.1]     │  │
│  │ ⭐ Cielo Estrellado │  │                   │  │
│  │   3 tareas pend.    │  │ "La fricción..."  │  │
│  │ 🏠 Inmobiliaria     │  │  ↳ 4 conexiones   │  │
│  │   SPEC en progreso  │  │ "Capture < 5s..." │  │
│  │                     │  │  ↳ 2 conexiones   │  │
│  │ [Ver todos →]       │  │                   │  │
│  └─────────────────────┘  └───────────────────┘  │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │ ☑️ Hábitos de hoy         7/14 (50%)     │    │
│  │ ■ Ejercicio  ■ Codear  □ Leer  □ Meditar │    │
│  │ ■ Comer bien □ Agua  ■ Planificar  ...   │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
└──────────────────────────────────────────────────┘
```

#### Elementos

| Elemento          | Tipo              | Comportamiento                                          |
| ----------------- | ----------------- | ------------------------------------------------------- |
| Saludo            | H1 dinámico       | "Buenos días/tardes/noches" + nombre                    |
| Tareas de hoy     | Card con lista    | Top 5 tareas con fecha = hoy. Click → editor tarea      |
| Inbox badge       | Card con contador | Últimos 3 items. Click → Inbox completo                 |
| Proyectos activos | Card con lista    | Proyectos status = In Progress. Click → detalle         |
| Daily Digest      | Card con notas    | 2-3 notas resurfaceadas por FSRS (Fase 4, implementado) |
| Hábitos de hoy    | Card inline       | Checkboxes directamente clickeables. Barra de progreso  |
| Botón captura     | Icon button       | Abre Quick Capture modal                                |
| Command palette   | Icon button       | Abre ⌘K                                                 |

#### Estados

| Estado             | Qué se muestra                                                                                                                                                                                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vacío (primer uso) | Onboarding (F49): `WelcomeModal` de 1 paso (auto-open one-shot a cuenta vacía) + `OnboardingChecklist` de 4 hitos reactivos en el dashboard — ① API key Anthropic (BYOK), ② primera nota, ③ inbox procesado por IA, ④ primera tarea — con barra de progreso y descarte persistente |
| Cargando           | Skeleton en cada card (mantener layout)                                                                                                                                                                                                                                            |
| Con datos          | Layout completo como wireframe                                                                                                                                                                                                                                                     |
| Error              | Toast: "Error cargando datos" + retry. Datos cacheados si hay                                                                                                                                                                                                                      |
| Offline            | Datos del último sync + badge "Offline" en header                                                                                                                                                                                                                                  |

#### Interacciones

- Click en tarea → Navega a editor de tarea
- Click checkbox tarea → Toggle completada (inline, sin navegar)
- Click checkbox hábito → Toggle hábito (inline, optimistic update)
- Click "Procesar →" en inbox → Navega a Inbox Processor
- Click "Ver todas/todos →" → Navega a la sección correspondiente
- Click en nota del digest → Navega al editor de nota

---

### 2.2 Quick Capture (Modal global)

**Ruta:** Overlay (no tiene ruta propia)
**Acceso:** Alt+N desde cualquier pantalla / FAB "+" en mobile / botón en header
**Propósito:** Capturar una idea en menos de 3 segundos
**Fase:** MVP

#### Layout

```
┌──────────────────────────────────────┐
│                                      │
│    ┌──────────────────────────────┐  │
│    │ 📝 Captura rápida        ✕  │  │
│    ├──────────────────────────────┤  │
│    │                              │  │
│    │ [Escribe una idea, link,    ]│  │
│    │ [tarea, o lo que sea...     ]│  │
│    │                              │  │
│    ├──────────────────────────────┤  │
│    │              Enter ↵ guardar │  │
│    └──────────────────────────────┘  │
│                                      │
│        (backdrop oscuro)             │
└──────────────────────────────────────┘
```

#### Elementos

| Elemento     | Tipo              | Comportamiento                                                              |
| ------------ | ----------------- | --------------------------------------------------------------------------- |
| Textarea     | Autosize textarea | Enfocado automáticamente al abrir. Crece con contenido. Min 1 línea, max 10 |
| Botón cerrar | ✕ icon            | Cierra sin guardar (también Escape)                                         |
| Hint "Enter" | Texto sutil       | Indica que Enter guarda                                                     |

#### Estados

| Estado            | Qué se muestra                                        |
| ----------------- | ----------------------------------------------------- |
| Abierto (default) | Textarea vacío, enfocado, listo para escribir         |
| Escribiendo       | Texto en textarea, hint de Enter visible              |
| Guardando         | Textarea se deshabilita brevemente, check ✓ aparece   |
| Guardado          | Modal se cierra automáticamente tras 300ms con ✓      |
| Error             | Toast debajo: "No se pudo guardar" + retry automático |
| Offline           | Guarda local (TinyBase) + badge "Se sincronizará"     |

#### Interacciones

- Abrir → Textarea enfocado inmediatamente
- Enter → Guarda y cierra (si hay texto)
- Shift+Enter → Nueva línea (no guarda)
- Escape → Cierra sin guardar
- Click backdrop → Cierra sin guardar
- Si hay texto sin guardar al cerrar → NO preguntar confirmación (es captura rápida, la fricción mata)

#### Decisión de diseño

El modal NO tiene selector de tipo (nota/tarea/proyecto), NO tiene tags, NO tiene campo de proyecto. Todo va al Inbox sin clasificar. La clasificación la hace la AI después o el usuario en el Inbox Processor. Esto es lo que garantiza captura < 3 segundos.

---

### 2.3 Inbox

**Ruta:** `/inbox`
**Acceso:** Sidebar → Inbox / Dashboard → badge Inbox
**Propósito:** Ver y procesar capturas sin clasificar
**Fase:** MVP (lista simple) → Fase 3 (sugerencias AI) → F26 (buckets de confianza)

> **Inbox híbrido (F26).** Coexisten dos modos: (a) **vista de buckets de confianza** en `/inbox` — "Alta confianza" (≥0.85) con aceptar en lote ("Aceptar N items") y "Revisar" para los de menor confianza, con Aceptar/Editar/Nota/Descartar por tarjeta; (b) **modo "Procesar"** = wizard secuencial (§2.4). El usuario elige: lote para alta confianza, wizard para revisión detallada. Sin API key BYOK configurada, los items muestran un empty state que invita a configurarla (F48).

#### Layout

```
┌──────────────────────────────────────────────────┐
│  📬 Inbox                    3 items  [Procesar] │
├──────────────────────────────────────────────────┤
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │ "Investigar TipTap extensions para         │  │
│  │  wikilinks, vi un repo interesante"        │  │
│  │                                            │  │
│  │  📎 quick-capture · hace 2h                │  │
│  │                                            │  │
│  │  🤖 AI sugiere: Nota → Área: Proyectos    │  │
│  │     Tags: #tiptap #editor                  │  │
│  │                                            │  │
│  │  [✓ Aceptar]  [✏️ Editar]  [✕ Descartar]  │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │ "Comprar proteína y creatina"              │  │
│  │                                            │  │
│  │  📎 quick-capture · hace 5h                │  │
│  │                                            │  │
│  │  🤖 AI sugiere: Tarea → Prioridad: Media   │  │
│  │     Área: Salud                            │  │
│  │                                            │  │
│  │  [✓ Aceptar]  [✏️ Editar]  [✕ Descartar]  │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │ "https://article-about-zettelkasten.com"   │  │
│  │                                            │  │
│  │  📎 web-clip · hace 1d                     │  │
│  │                                            │  │
│  │  ⏳ Procesando con AI...                    │  │
│  │                                            │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
└──────────────────────────────────────────────────┘
```

#### Elementos

| Elemento         | Tipo                   | Comportamiento                                                              |
| ---------------- | ---------------------- | --------------------------------------------------------------------------- |
| Header           | H1 + contador          | Muestra cantidad de items pendientes                                        |
| Botón "Procesar" | Button primary         | Abre Inbox Processor (vista one-by-one)                                     |
| Item card        | Card expandible        | Muestra contenido crudo + sugerencia AI                                     |
| Fuente           | Badge                  | De dónde vino (quick-capture, web-clip, voice)                              |
| Sugerencia AI    | Sección dentro de card | Tipo sugerido, tags, área. Visible cuando aiProcessed = true                |
| Acciones         | 3 botones              | Aceptar (crea con sugerencia), Editar (modifica antes), Descartar (elimina) |

#### Estados

| Estado             | Qué se muestra                                                    |
| ------------------ | ----------------------------------------------------------------- |
| Vacío              | Ilustración + "Inbox limpio 🎉" + "Usa Alt+N para capturar ideas" |
| Cargando           | Skeleton cards (3)                                                |
| Con datos (sin AI) | Cards con contenido crudo, sin sugerencias [MVP]                  |
| Con datos (con AI) | Cards con contenido + sugerencias AI [Fase 3]                     |
| Item procesándose  | Spinner + "Procesando con AI..." en el item                       |
| Error              | Toast + retry por item                                            |
| Offline            | Items locales visibles, badge "AI offline — procesar manualmente" |

#### Interacciones

- Click "Aceptar" → Crea nota/tarea/proyecto con la sugerencia AI → item desaparece con animación
- Click "Editar" → Abre mini-formulario inline: título editable, tipo (dropdown), tags, área
- Click "Descartar" → Confirmación breve ("¿Seguro?") → elimina
- Click "Procesar" → Navega a Inbox Processor (vista enfocada one-by-one)
- Swipe left en mobile → Descartar
- Swipe right en mobile → Aceptar

---

### 2.4 Inbox Processor (Vista enfocada)

**Ruta:** `/inbox/process`
**Acceso:** Inbox → botón "Procesar" / Dashboard → "Procesar →"
**Propósito:** Procesar items del inbox uno por uno sin distracciones
**Fase:** Fase 3

#### Layout

```
┌──────────────────────────────────────────────────┐
│  Procesando Inbox            2 de 5   [✕ Salir]  │
├──────────────────────────────────────────────────┤
│                                                  │
│           ┌────────────────────────────┐         │
│           │                            │         │
│           │  "Investigar TipTap        │         │
│           │   extensions para          │         │
│           │   wikilinks, vi un repo    │         │
│           │   interesante"             │         │
│           │                            │         │
│           │  📎 quick-capture · hace 2h│         │
│           │                            │         │
│           └────────────────────────────┘         │
│                                                  │
│           🤖 Sugerencia de Claude:               │
│                                                  │
│           Tipo:    [📝 Nota      ▼]              │
│           Título:  [Extensiones TipTap para     ]│
│                    [wikilinks                   ]│
│           Área:    [🚀 Proyectos ▼]              │
│           Tags:    [tiptap] [editor] [+ tag]     │
│           Resumen: "Investigar cómo crear..."    │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ ← Atrás  │  │ Descartar│  │ ✓ Crear nota │   │
│  └──────────┘  └──────────┘  └──────────────┘   │
│                                                  │
│            ●  ●  ○  ○  ○  (progreso)             │
│                                                  │
└──────────────────────────────────────────────────┘
```

#### Elementos

| Elemento           | Tipo             | Comportamiento                                     |
| ------------------ | ---------------- | -------------------------------------------------- |
| Contador           | Texto            | "N de M" — progreso del batch                      |
| Contenido original | Card readonly    | El texto crudo tal como se capturó                 |
| Campos editables   | Form             | Tipo, Título, Área, Tags — pre-llenados por AI     |
| Tipo dropdown      | Select           | Nota / Tarea / Proyecto / Referencia / Descartar   |
| Tags               | Tag input        | Chips editables, autocompletado de tags existentes |
| Botón "Crear"      | Button primary   | Crea la entidad y pasa al siguiente item           |
| Botón "Descartar"  | Button secondary | Elimina y pasa al siguiente                        |
| Dots de progreso   | Indicador        | Muestra cuántos items faltan                       |

#### Estados

| Estado         | Qué se muestra                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| Procesando     | Item actual con campos editables                                                                       |
| Último item    | Misma vista, botón dice "Crear y terminar"                                                             |
| Completado     | "¡Inbox limpio! 🎉" + resumen: "Creaste 3 notas, 1 tarea, descartaste 1" + botón "Volver al Dashboard" |
| Error al crear | Toast + retry sin perder los datos editados                                                            |

#### Interacciones

- Modificar cualquier campo → Actualiza la sugerencia en tiempo real
- Click "Crear" → Crea entidad, animación slide-left, siguiente item aparece
- Click "Descartar" → Elimina, siguiente item
- Click "Atrás" → Vuelve al item anterior (ya procesado, permite deshacer)
- Keyboard: Tab entre campos, Enter en último campo = Crear
- Escape → Confirma salir ("Quedan N items. ¿Salir?")

---

### 2.5 Lista de Notas

**Ruta:** `/notes`
**Acceso:** Sidebar → Notas
**Propósito:** Ver, buscar y filtrar todas las notas. Punto de entrada al conocimiento.
**Fase:** MVP

#### Layout

```
┌──────────────────────────────────────────────────┐
│  📝 Notas                         [+ Nueva nota] │
├──────────────────────────────────────────────────┤
│  [🔍 Buscar notas...                           ] │
├──────────────────────────────────────────────────┤
│                                                  │
│  Filtros: [Todas ▼] [Tipo ▼] [Área ▼] [Tags ▼]  │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │ La fricción mata los hábitos más que la    │  │
│  │ falta de motivación                        │  │
│  │                                            │  │
│  │ 🏷️ permanent · 🚀 Proyectos · 🔗 4 links  │  │
│  │ Hace 2 días                                │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │ TinyBase persister pattern para Firestore  │  │
│  │                                            │  │
│  │ 🏷️ literature · 🚀 Proyectos · 🔗 2 links │  │
│  │ Hace 5 días                                │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │ Idea: command palette con fuzzy search     │  │
│  │                                            │  │
│  │ 🏷️ fleeting · 🧠 Conocimiento · 🔗 0 links│  │
│  │ Hace 1 semana                              │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ... (scroll infinito)                           │
│                                                  │
│  ┌──────────────────────────┐                    │
│  │ 🕸️ Ver como grafo        │                    │
│  └──────────────────────────┘                    │
│                                                  │
└──────────────────────────────────────────────────┘
```

#### Elementos

| Elemento    | Tipo             | Comportamiento                                                                |
| ----------- | ---------------- | ----------------------------------------------------------------------------- |
| Búsqueda    | Input con icono  | Powered by Orama. Busca en título + contenido. Resultados instant (<50ms)     |
| Filtros     | Dropdowns        | PARA type, note type (fleeting/literature/permanent), área, tags. Combinables |
| Note card   | Card clickeable  | Título, metadata (tipo, área, link count), fecha relativa                     |
| Link count  | Badge            | Número de conexiones bidireccionales                                          |
| Botón grafo | Button secondary | Navega a `/notes/graph`                                                       |
| Nueva nota  | Button primary   | Crea nota vacía y navega al editor                                            |

#### Estados

| Estado                  | Qué se muestra                                                              |
| ----------------------- | --------------------------------------------------------------------------- |
| Vacío                   | "Aún no tienes notas" + "Captura tu primera idea con Alt+N o crea una nota" |
| Cargando                | 5 skeleton cards                                                            |
| Con datos               | Lista de cards con scroll infinito                                          |
| Búsqueda sin resultados | "Sin resultados para '[query]'" + sugerencia de quitar filtros              |
| Error                   | Toast con retry                                                             |
| Offline                 | Notas cacheadas del TinyBase store                                          |

#### Interacciones

- Click en card → Navega a `/notes/{id}` (editor)
- Escribir en búsqueda → Filtrado instant vía Orama
- Click filtro → Aplica/remueve filtro, actualiza lista
- Click "Nueva nota" → Crea doc vacío, navega a editor
- Click "Ver como grafo" → Navega a graph view
- Long press en mobile → Menú contextual (archivar, favorito, eliminar)

---

### 2.6 Editor de Nota

**Ruta:** `/notes/{noteId}`
**Acceso:** Lista de notas → click en nota / Backlink click / Graph node click
**Propósito:** Escribir y editar una nota atómica con links bidireccionales
**Fase:** MVP

#### Layout

```
┌──────────────────────────────────────────────────────────┐
│  ← Notas    ⭐ Favorito   📋 PARA: [Resource ▼]  ⋮ Más  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────────────────────┬──────────────────────┐  │
│  │                             │                      │  │
│  │  EDITOR                     │  SIDEBAR (toggleable)│  │
│  │                             │                      │  │
│  │  La fricción mata los       │  ── Backlinks (4) ── │  │
│  │  hábitos más que la falta   │                      │  │
│  │  de motivación              │  ◇ Captura < 5s es   │  │
│  │  ─────────────────────      │    lo más importante │  │
│  │                             │  ◇ Notas atómicas    │  │
│  │  La investigación de BJ     │    mejoran con uso   │  │
│  │  Fogg demuestra que los     │  ◇ Sistemas de       │  │
│  │  hábitos fallan no por      │    productividad     │  │
│  │  motivación, sino por       │  ◇ Lecciones del SC  │  │
│  │  @diseño de entorno.        │    en Notion         │  │
│  │                             │                      │  │
│  │  La clave es hacer el       │  ── Info ────────── │  │
│  │  comportamiento deseado     │                      │  │
│  │  lo más fácil posible.      │  Tipo: permanent     │  │
│  │  Ver también @atomic        │  Área: 🧠 Conocim.   │  │
│  │  habits loop.               │  Tags: #hábitos      │  │
│  │                             │        #productivid. │  │
│  │                             │  Creada: 10/04/26    │  │
│  │  #hábitos #productividad    │  Links: 4 ↔ 2       │  │
│  │                             │  Destilación: L1     │  │
│  │                             │                      │  │
│  └─────────────────────────────┴──────────────────────┘  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

#### Elementos

| Elemento             | Tipo               | Comportamiento                                                     |
| -------------------- | ------------------ | ------------------------------------------------------------------ |
| Breadcrumb "← Notas" | Link               | Vuelve a lista de notas                                            |
| Favorito ⭐          | Toggle icon        | Marca/desmarca favorito                                            |
| PARA select          | Dropdown           | project / area / resource / archive                                |
| Menú "⋮ Más"         | Dropdown menu      | Archivar, Eliminar, Exportar MD, Ver historial                     |
| Editor TipTap        | Rich text editor   | Título es la primera línea (H1 auto). Body con Markdown shortcuts  |
| `@mención`           | Custom node TipTap | Al escribir `@` aparece autocompletado de notas existentes         |
| `#tag`               | Custom mark TipTap | Al escribir `#` aparece autocompletado de tags existentes          |
| Sidebar - Backlinks  | Lista de links     | Notas que apuntan a esta nota. Click → navega a esa nota           |
| Sidebar - Info       | Metadata panel     | Tipo, área, tags, fechas, conteo de links, nivel de destilación    |
| Sidebar - Similares  | Panel (Fase 4)     | `SimilarNotesPanel`: top notas por cosine similarity de embeddings |

#### Estados

| Estado           | Qué se muestra                                                                          |
| ---------------- | --------------------------------------------------------------------------------------- |
| Nota nueva       | Editor vacío con placeholder "Escribe una idea..." Cursor en título                     |
| Editando         | Editor con contenido. Auto-save cada 2s de inactividad                                  |
| Guardando        | Indicador sutil "Guardando..." en header (desaparece en 500ms)                          |
| Guardado         | Indicador "✓ Guardado" (desaparece en 1s)                                               |
| Error al guardar | Banner rojo "No se pudo guardar" + retry. Datos NO se pierden (TinyBase local)          |
| Offline          | Edición normal. Badge "Offline — se sincronizará". Guardar funciona local               |
| Sin backlinks    | Sidebar muestra "Sin backlinks aún" + tip: "Linkea esta nota desde otra usando @título" |

#### Interacciones

- Escribir → Auto-save con debounce (2s sin cambios → guarda)
- Escribir `@` → Popup de autocompletado con notas existentes, filtrado por texto
- Seleccionar nota en popup → Inserta wikilink como nodo clickeable
- Click en wikilink → Navega a esa nota
- Escribir `#` → Popup de autocompletado con tags existentes
- Click en backlink (sidebar) → Navega a la nota que linkea
- Escribir `/` → Slash command menu (heading, lista, código, divider, imagen)
- ⌘+S → Forzar guardado inmediato
- Click sidebar toggle → Muestra/oculta sidebar de backlinks+info

#### Autocompletado de wikilinks (detalle)

```
Escribo: La captura debe ser @rá

┌─────────────────────────────┐
│ 🔍 rá                       │
│                             │
│ La fricción mata los hábitos│  ← fuzzy match
│ Captura rápida < 5 segundos │  ← match directo
│ + Crear "rá..." como nueva  │  ← crear nota nueva
│                             │
└─────────────────────────────┘

↑↓ navegar, Enter seleccionar, Escape cerrar
```

#### Split-pane multinota (F46, desktop ≥1024)

Dos notas lado a lado en `/notes/:noteId` vía query `?split=noteId` (bookmarkeable, refresh-safe). Atajo `Cmd/Ctrl+\` togglea el panel derecho; el picker reusa la búsqueda Orama. El ratio persiste en `preferences.splitPaneLayout`. Durante el split, los paneles laterales (Backlinks/Similares) se auto-colapsan.

> **Nota:** el empty state de "IA sin key" (BYOK no configurado) vive en `/inbox`, **no** en el editor — el auto-tagging es invisible por diseño (F48.F7).

---

### 2.7 Graph View

**Ruta:** `/notes/graph`
**Acceso:** Lista de notas → "Ver como grafo" / Sidebar → "Grafo" (sección Conocimiento)
**Propósito:** Visualizar el knowledge graph — descubrir conexiones y clusters
**Fase:** Fase 4 — implementado con **Reagraph** (WebGL). Sigma.js + Graphology es roadmap v2 (no implementado).

#### Layout

```
┌──────────────────────────────────────────────────┐
│  🕸️ Knowledge Graph           [Filtros] [⛶ Full] │
├──────────────────────────────────────────────────┤
│                                                  │
│         ○ Nota A                                 │
│        / \                                       │
│       /   \         ○ Nota F                     │
│      ○     ○───────/                             │
│    Nota B  Nota C  /                             │
│      \     |      /                              │
│       \    |     /                               │
│        ○ Nota D ○                                │
│        |                                         │
│        ○ Nota E                                  │
│                                                  │
│                                                  │
│  ┌──────────────────────┐                        │
│  │ Nota D               │ ← panel al click nodo  │
│  │ "TinyBase patterns"  │                        │
│  │ 🔗 5 links · perm.   │                        │
│  │ [Abrir nota →]       │                        │
│  └──────────────────────┘                        │
│                                                  │
└──────────────────────────────────────────────────┘

Filtros (panel expandible):
┌───────────────────────────┐
│ Área: [Todas ▼]           │
│ Tipo: ○ Todas ● Permanent │
│ Links: [Min: 1] [Max: ∞]  │
│ Fecha: [Desde] [Hasta]    │
│ [Resetear filtros]        │
└───────────────────────────┘
```

#### Elementos

| Elemento         | Tipo              | Comportamiento                                                                      |
| ---------------- | ----------------- | ----------------------------------------------------------------------------------- |
| Canvas del grafo | Reagraph (WebGL)  | Nodos = notas, Edges = links. Force-directed layout (graphology-layout-forceatlas2) |
| Nodos            | Círculos          | Tamaño proporcional a linkCount. Color por área. Label = título truncado            |
| Edges            | Líneas            | Grosor por strength (si AI). Color sutil                                            |
| Panel de nodo    | Card flotante     | Aparece al click en nodo: título, tipo, link count, botón abrir                     |
| Filtros          | Panel desplegable | Filtrar nodos por área, tipo, rango de links, fecha                                 |
| Fullscreen       | Toggle            | Expande grafo a pantalla completa                                                   |

#### Estados

| Estado              | Qué se muestra                                                         |
| ------------------- | ---------------------------------------------------------------------- |
| Vacío (<3 notas)    | Mensaje: "El grafo cobra vida con más notas y conexiones" + crear nota |
| Cargando            | Spinner centrado sobre canvas                                          |
| Con datos           | Grafo interactivo con force layout                                     |
| Muchos nodos (>500) | Advertencia de rendimiento + sugerencia de filtrar                     |
| Error               | Toast + retry                                                          |
| Offline             | Grafo con datos cacheados                                              |

#### Interacciones

- Drag nodo → Mueve nodo (physics pause en ese nodo)
- Click nodo → Muestra panel de detalle
- Double-click nodo → Navega directo al editor de la nota
- Scroll → Zoom in/out
- Drag canvas → Pan
- Hover nodo → Highlight nodo + vecinos directos, dim el resto
- Click filtro → Filtra nodos visibles, re-layout
- Pinch en mobile → Zoom

---

### 2.8 Lista de Tareas

**Ruta:** `/tasks`
**Acceso:** Sidebar → Tareas
**Propósito:** Ver y gestionar tareas con vistas temporales
**Fase:** Fase 2

#### Layout

```
┌──────────────────────────────────────────────────┐
│  ✅ Tareas                        [+ Nueva tarea] │
├──────────────────────────────────────────────────┤
│  [Hoy] [Pronto] [Esperando] [Completadas]        │
├──────────────────────────────────────────────────┤
│                                                  │
│  HOY — Viernes 10 de Abril                       │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │ □ Revisar PR #42                           │  │
│  │   🔴 Urgente · ⭐ Cielo Estrellado · hoy    │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │ □ Escribir tests de integración            │  │
│  │   🟡 Media · ⭐ Cielo Estrellado · hoy      │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │ □ Comprar proteína                         │  │
│  │   🟢 Baja · 💪 Salud · hoy                  │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  MAÑANA                                          │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │ □ Enviar propuesta inmobiliaria            │  │
│  │   🟠 Alta · 🏠 Inmobiliaria · mañana       │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
└──────────────────────────────────────────────────┘
```

#### Elementos

| Elemento      | Tipo             | Comportamiento                                                     |
| ------------- | ---------------- | ------------------------------------------------------------------ |
| Tabs          | Tab group        | Hoy, Pronto (próx 7 días), Esperando, Completadas                  |
| Task card     | Card             | Checkbox + nombre + prioridad + proyecto + fecha                   |
| Checkbox      | Toggle           | Marca completada con animación (strikethrough + slide out tras 1s) |
| Prioridad     | Badge color      | Rojo=urgente, Naranja=alta, Amarillo=media, Verde=baja             |
| Proyecto link | Badge clickeable | Navega al proyecto                                                 |
| Agrupación    | Section headers  | Agrupadas por fecha en vista "Hoy" y "Pronto"                      |

#### Estados

| Estado                  | Qué se muestra                                        |
| ----------------------- | ----------------------------------------------------- |
| Vacío (tab Hoy)         | "Nada para hoy 🎉" + "Crea una tarea o revisa Pronto" |
| Vacío (tab Completadas) | "Aún no completas tareas — ¡a darle!"                 |
| Cargando                | Skeleton cards                                        |
| Con datos               | Lista agrupada por fecha                              |
| Error                   | Toast con retry                                       |
| Offline                 | Tareas cacheadas, checkbox funciona local             |

#### Interacciones

- Click checkbox → Completa tarea (optimistic, se mueve a Completadas tras 1s)
- Click en tarea → Expande inline: descripción, notas vinculadas, botón editar
- Click "Nueva tarea" → Inline creation: campo de texto + Enter crea + asigna fecha=hoy
- Drag en desktop → Reordenar prioridad visual
- Swipe right mobile → Completar
- Swipe left mobile → Posponer (picker de fecha)

---

### 2.9 Lista de Proyectos

**Ruta:** `/projects`
**Acceso:** Sidebar → Proyectos
**Propósito:** Ver todos los proyectos con su estado y progreso
**Fase:** Fase 2

#### Layout

```
┌──────────────────────────────────────────────────┐
│  🚀 Proyectos                  [+ Nuevo proyecto] │
├──────────────────────────────────────────────────┤
│  [Board] [Lista]                                 │
├──────────────────────────────────────────────────┤
│                                                  │
│  Vista Board (Kanban):                           │
│                                                  │
│  Not Started   In Progress    On Hold   Done     │
│  ┌──────────┐  ┌──────────┐  ┌───────┐          │
│  │ 💰 App   │  │ ⭐ Cielo │  │📚 Aula│          │
│  │ Gastos v2│  │ Estrella.│  │ Code  │          │
│  │          │  │ 3 tareas │  │       │          │
│  │ 🟡 Media │  │ 🔴 Urgent│  │🟢 Baja│          │
│  └──────────┘  ├──────────┤  └───────┘          │
│  ┌──────────┐  │ 🏠 Inmob.│                      │
│  │ 🔗 Wompi │  │ Tía      │                      │
│  │ Webhook  │  │ 2 tareas │                      │
│  │ 🟡 Media │  │ 🟠 Alta  │                      │
│  └──────────┘  └──────────┘                      │
│                                                  │
└──────────────────────────────────────────────────┘
```

#### Elementos

| Elemento        | Tipo            | Comportamiento                                      |
| --------------- | --------------- | --------------------------------------------------- |
| Vista toggle    | Tabs            | Board (kanban) / Lista (tabla)                      |
| Columnas kanban | Drag containers | Not Started, In Progress, On Hold, Completed        |
| Project card    | Card draggable  | Nombre, prioridad badge, count de tareas pendientes |
| Nuevo proyecto  | Button          | Abre form: nombre, área, prioridad, objetivo        |

#### Estados

| Estado    | Qué se muestra                                                   |
| --------- | ---------------------------------------------------------------- |
| Vacío     | "Sin proyectos aún" + CTA crear + importar de Notion (si aplica) |
| Cargando  | Skeleton columns                                                 |
| Con datos | Kanban o lista según vista                                       |
| Error     | Toast + retry                                                    |
| Offline   | Datos cacheados, drag funciona local                             |

#### Interacciones

- Drag card entre columnas → Cambia status
- Click card → Navega a `/projects/{id}` (detalle)
- Click "Nueva" → Form modal o inline
- Toggle Board/Lista → Cambia vista (persiste preferencia)

---

### 2.10 Detalle de Proyecto

**Ruta:** `/projects/{projectId}`
**Acceso:** Lista de proyectos → click en card
**Propósito:** Ver todo lo relacionado a un proyecto: tareas, notas, progreso
**Fase:** Fase 2

#### Layout

```
┌──────────────────────────────────────────────────┐
│  ← Proyectos   ⭐ Cielo Estrellado    [⋮ Más]    │
│  Status: [In Progress ▼]  Prioridad: [🔴 Urgent]│
├──────────────────────────────────────────────────┤
│                                                  │
│  [Tareas] [Notas] [Info]                         │
│                                                  │
│  ── Tareas (5) ──────────────── [+ Nueva tarea]  │
│                                                  │
│  □ Implementar wikilinks TipTap     🟠 Alta      │
│  □ Setup TinyBase + Firestore       🟡 Media     │
│  □ Diseñar schema de links          🟡 Media     │
│  ■ Crear proyecto Vite              🟢 Baja      │
│  ■ Definir stack                    🟢 Baja      │
│                                                  │
│  Progreso: ████████░░░░░░░░░ 40% (2/5)           │
│                                                  │
│  ── Notas vinculadas (3) ──────── [+ Vincular]   │
│                                                  │
│  ◇ TinyBase persister pattern                    │
│  ◇ TipTap wikilinks architecture                 │
│  ◇ Orama vs FlexSearch comparison                │
│                                                  │
└──────────────────────────────────────────────────┘
```

#### Interacciones

- Click en tarea → Expande inline con detalle
- Click checkbox → Completa tarea, progress bar se actualiza
- Click nota → Navega al editor de nota
- Click "Vincular" nota → Modal con búsqueda de notas existentes
- Crear tarea → Inline creation, auto-vinculada al proyecto
- Cambiar status/prioridad → Dropdowns en header

---

### 2.11 Objetivos

**Ruta:** `/objectives`
**Acceso:** Sidebar → Objetivos
**Propósito:** Ver metas de alto nivel y su progreso via proyectos vinculados
**Fase:** Fase 2

#### Layout

```
┌──────────────────────────────────────────────────┐
│  🎯 Objetivos                  [+ Nuevo objetivo] │
├──────────────────────────────────────────────────┤
│  [Por Área] [Por Quarter] [Todos]                │
├──────────────────────────────────────────────────┤
│                                                  │
│  🚀 PROYECTOS                                    │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │ Lanzar SecondMind MVP                      │  │
│  │ En progreso · Deadline: Jun 2026           │  │
│  │ Proyectos: Cielo Estrellado (40%)          │  │
│  │ ████████░░░░░░░░░ 40%                      │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  💪 SALUD Y EJERCICIO                            │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │ Pelear primer combate amateur de boxeo     │  │
│  │ No empezado · Deadline: Dic 2026           │  │
│  │ Proyectos: (ninguno aún)                   │  │
│  │ ░░░░░░░░░░░░░░░░░ 0%                      │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
└──────────────────────────────────────────────────┘
```

#### Interacciones

- Click objetivo → Expande: proyectos vinculados, tareas, countdown
- Click proyecto dentro de objetivo → Navega a detalle de proyecto
- Tabs cambian agrupación (por área, por trimestre, lista plana)

---

### 2.12 Habit Tracker

**Ruta:** `/habits`
**Acceso:** Sidebar → Hábitos
**Propósito:** Registrar y visualizar hábitos diarios
**Fase:** Fase 2

#### Layout

```
┌──────────────────────────────────────────────────┐
│  ☑️ Hábitos                      Abril 2026      │
├──────────────────────────────────────────────────┤
│                                                  │
│  Hoy: 7/14 (50%)  ████████░░░░░░░░░             │
│                                                  │
│  ┌──────────────────────────────────────┐        │
│  │ Hábito         L  M  M  J  V  S  D  │        │
│  │ ─────────────────────────────────────│        │
│  │ Ejercicio      ■  ■  □  ■  □  ·  ·  │        │
│  │ Codear         ■  ■  ■  ■  □  ·  ·  │        │
│  │ Leer           □  ■  □  □  □  ·  ·  │        │
│  │ Meditar        ■  □  ■  ■  □  ·  ·  │        │
│  │ Comer bien     ■  ■  ■  □  □  ·  ·  │        │
│  │ Tomar agua     ■  ■  ■  ■  ■  ·  ·  │        │
│  │ Planificar     ■  ■  ■  ■  □  ·  ·  │        │
│  │ Madrugar       □  ■  ■  □  □  ·  ·  │        │
│  │ Gratitud       ■  ■  □  ■  □  ·  ·  │        │
│  │ Inglés         □  □  ■  □  □  ·  ·  │        │
│  │ Pareja         ■  □  □  ■  □  ·  ·  │        │
│  │ Estirar        □  ■  ■  □  □  ·  ·  │        │
│  │ Tender cama    ■  ■  ■  ■  ■  ·  ·  │        │
│  │ No dulce       ■  ■  □  ■  □  ·  ·  │        │
│  └──────────────────────────────────────┘        │
│                                                  │
│  Racha más larga: Tomar agua (12 días)           │
│  Mejor semana: Semana 14 (78%)                   │
│                                                  │
└──────────────────────────────────────────────────┘

■ = completado  □ = no completado  · = futuro
```

#### Interacciones

- Click en □ de hoy → Toggle a ■ (solo se pueden editar hoy y ayer)
- Swipe horizontal / flechas → Navegar semanas
- Click en hábito (nombre) → Detalle con racha, % mensual, gráfico
- Long press en hábito → Editar nombre / eliminar

---

### 2.13 Command Palette

**Ruta:** Overlay (no tiene ruta propia)
**Acceso:** ⌘+K desde cualquier pantalla
**Propósito:** Búsqueda y navegación global ultra-rápida
**Fase:** Fase 3

#### Layout

```
┌──────────────────────────────────────┐
│                                      │
│   ┌──────────────────────────────┐   │
│   │ 🔍 [Buscar notas, tareas,  ]│   │
│   │    [proyectos, comandos...  ]│   │
│   ├──────────────────────────────┤   │
│   │                              │   │
│   │  Recientes                   │   │
│   │  📝 La fricción mata los...  │   │
│   │  ✅ Revisar PR #42           │   │
│   │  📝 TinyBase patterns        │   │
│   │                              │   │
│   │  Acciones                    │   │
│   │  ➕ Nueva nota               │   │
│   │  ➕ Nueva tarea              │   │
│   │  📬 Ir a Inbox              │   │
│   │  🕸️ Abrir grafo             │   │
│   │                              │   │
│   └──────────────────────────────┘   │
│                                      │
│        (backdrop oscuro)             │
└──────────────────────────────────────┘
```

#### Interacciones

- Escribir → Resultados instant (Orama FTS) agrupados por tipo: Notas, Tareas, Proyectos, Acciones
- ↑↓ → Navegar resultados
- Enter → Abrir item seleccionado o ejecutar acción
- Escape → Cerrar
- Prefijos especiales: `>` para acciones, `#` para tags, `@` para áreas

---

### 2.14 Settings

**Ruta:** `/settings`
**Acceso:** Sidebar → Settings (ícono gear) / Command palette → "Settings"
**Propósito:** Apariencia, visibilidad del menú, papelera, API keys de IA (BYOK), info de la app
**Fase:** MVP → F48 (Proveedores de IA)

#### Secciones

| Sección                  | Contenido                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------ |
| Apariencia               | Modo de color: Claro / Automático / Oscuro (`ThemeSelector`)                         |
| Visibilidad del menú     | Mostrar/ocultar sidebar — solo desktop ≥1024 (`SidebarVisibilitySelector`)           |
| Papelera de notas        | Días en papelera antes del hard-delete (ancla `#trash`, `TrashAutoPurgeSelector`)    |
| Proveedores de IA (BYOK) | API key Anthropic propia — habilita inbox AI + auto-tagging (ancla `#api-keys`, F48) |
| Info de la app           | Versión y plataforma (`AppInfoSection`)                                              |

> Las secciones del diseño original (Cuenta, Áreas, Tags, Hábitos, Datos/export) no se implementaron como tales; áreas/tags/hábitos se gestionan en sus propias vistas.

---

### 2.15 Login

**Ruta:** `/login` (top-level, fuera del Layout)
**Acceso:** Redirect automático cuando no hay sesión
**Propósito:** Autenticación + gate de acceso a la beta cerrada
**Fase:** F47 (rediseño Linear-style) + F50 (allowlist)

Hero centrado (logo `favicon.svg` + "SecondMind" + tagline "Tu segundo cerebro digital", radial glow indigo) sobre `LoginCard` con `@base-ui/react/tabs` balanceadas 50/50:

- **Iniciar sesión / Crear cuenta** (tabs): email + password con validación client-side; errores mapeados a español (`authErrors.ts`). El sign-up dispara `sendEmailVerification`.
- **Google** (`GoogleSignInButton`): branching por plataforma (Capacitor → Tauri → `signInWithPopup`).
- **Reset password**: switch inline `mode: 'tabs' | 'reset'`.
- **Gate de beta (allowlist, F50 + SPEC-51):** gate **post-auth unificado** (email/pw + Google) vía `checkMyAccess` autenticado en `useAuth` — se crea la sesión, se consulta el acceso (el server lee el email del token), y si no está invitado → `signOut` + mensaje genérico (cuenta inerte vía rules). El error sobrevive el re-montaje de `LoginCard` (store reactivo). Cerró el oráculo de enumeración del viejo `checkAllowlist`.
- **Signup gate (F47 → SPEC-53 Modelo C):** `SignupGate` lee `config/app.signupsEnabled` y muestra el form o "Registro deshabilitado". El capacity ya NO se mide acá — se enforce en la aprobación (`processAccessRequest` approve, contando la `allowlist/`). SPEC-53 eliminó el counter `userCount` y el viejo `SignupCapacityGate`.

---

### 2.16 Verificación de email

**Ruta:** `/verify-email` (top-level) + banner global persistente
**Acceso:** Redirect de usuarios email/password no verificados; banner en el Layout
**Propósito:** Forzar verificación de email (las rules exigen `email_verified` server-side)
**Fase:** F47

`EmailVerificationBanner` debajo del `UpdateBanner` cuando `user && !user.emailVerified`: reenviar (cooldown 60s en sessionStorage) + dismiss. Refresca el estado con `focus`/`visibilitychange` → `refreshUser()`. Gotcha: `user.reload()` NO refresca el ID token → tras verificar hay que re-login para que las rules dejen de ver `email_verified=false`.

---

### 2.17 Captura desktop (ventana Tauri)

**Ruta:** `/capture` (top-level, ventana frameless de Tauri)
**Acceso:** Atajo global `Ctrl+Shift+Space` — abre la ventana centrada en el monitor del cursor
**Propósito:** Capturar una idea sin abrir la app completa
**Fase:** Fase 5.1 / F7

Textarea minimal con header "Captura rápida": Enter guarda (`inboxRepo.createFromCapture` con source `desktop-capture` → repo factory, optimistic + retry vía `saveInboxQueue`), check ✓ y la ventana se cierra a los 600ms; Esc cierra. Surface distinta del modal web Quick Capture (§2.2): ventana efímera que no hidrata TinyBase, pero igual escribe a través de la capa de repos (no `setDoc` crudo).

---

## 3. Flujos de usuario

---

### Flujo 1: Captura rápida (< 3 segundos)

**Trigger:** Idea, link, o pensamiento que capturar
**Actor:** Usuario desde cualquier pantalla
**Resultado:** Item guardado en Inbox, procesado por AI en background

```
Cualquier pantalla
    │
    ├── Alt+N (desktop / web)
    ├── Ctrl+Shift+Space (ventana de captura Tauri desktop)
    ├── FAB "+" (mobile)
    └── Botón "+" en header (con sidebar oculta / TopBar)
         │
         ▼
    Quick Capture modal
    (textarea enfocado)
         │
         ▼
    Escribe texto
         │
         ▼
    Enter
         │
    ┌────┴────┐
    │ LOCAL   │ TinyBase guarda (instant, 0ms)
    └────┬────┘
         │
    ┌────┴─────┐
    │ CLOUD    │ Persiste a Firestore (async, invisible)
    └────┬─────┘
         │
    ┌────┴─────┐
    │ AI       │ Cloud Function procesa con Claude Haiku
    └────┬─────┘  (sugiere título, tipo, tags, notas relacionadas)
         │
         ▼
    Modal se cierra con ✓
    Item aparece en Inbox con badge 🤖
```

**Tiempo percibido por el usuario:** < 2 segundos (todo después de Enter es invisible)

---

### Flujo 2: Procesar inbox con AI

**Trigger:** Inbox tiene items pendientes
**Actor:** Usuario (rutina diaria o cuando tiene tiempo)
**Resultado:** Items convertidos en notas/tareas/proyectos clasificados

```
Inbox (/inbox) — items procesados por IA (badge en sidebar/dashboard)
    │
    │  El usuario elige el modo (F26 — ambos coexisten):
    │
    ├── BUCKETS (fast path) — en /inbox
    │     "Alta confianza" (≥0.85) → [Aceptar N items] en lote
    │     "Revisar" (menor confianza) → por tarjeta: Aceptar / Editar / Nota / Descartar
    │
    └── WIZARD (detailed) — /inbox/process
          "Procesando Inbox · X de N", campos editables pre-llenados por IA
          → "Crear y siguiente" / "Descartar" por item
    │
    ▼
Items convertidos en notas / tareas / proyectos
(sin API key BYOK configurada → empty state que invita a configurarla, F48)
```

---

### Flujo 3: Escribir nota atómica con wikilinks

**Trigger:** Idea procesada o conocimiento nuevo para documentar
**Actor:** Usuario
**Resultado:** Nota atómica creada con links bidireccionales

```
Lista de notas → "+ Nueva nota"
    │
    ▼
Editor de nota (vacío)
  Cursor en título
    │
    ▼
Escribe título-idea:
  "La fricción mata los hábitos"
    │
    ▼
Tab → body del editor
    │
    ▼
Escribe contenido libre con Markdown
    │
    ▼
Escribe @  →  popup de autocompletado
    │
    ├── Escribe para filtrar
    ├── ↑↓ para navegar
    └── Enter para seleccionar
         │
         ▼
    @diseño de entorno insertado como nodo
    │
    ▼
Continúa escribiendo... agrega #tags inline
    │
    ▼
Auto-save (cada 2s de inactividad)
    │
    ┌────┴────┐
    │ LOCAL   │ TinyBase actualiza store
    └────┬────┘
         │
    ┌────┴─────┐
    │ LINKS    │ extractLinks() detecta nuevas menciones @
    └────┬─────┘
         │
    ┌────┴─────────┐
    │ SYNC LINKS   │ syncLinksFromEditor() actualiza links/ y
    └────┬─────────┘  incomingLinkIds (client-side)
         │
         ▼
    Sidebar "Backlinks" se actualiza en tiempo real
    en la nota actual y en las notas linkeadas
```

---

### Flujo 4: Rutina diaria

**Trigger:** Inicio del día
**Actor:** Usuario
**Resultado:** Día planificado, inbox procesado, hábitos registrados

```
Abrir SecondMind (mañana)
    │
    ▼
Dashboard
    │
    ├── 1. Ver "Tareas de hoy" → elegir top 3
    │
    ├── 2. ¿Inbox tiene items? → Procesar (Flujo 2)
    │
    ├── 3. Daily Digest (Fase 4)
    │      Ver 2-3 notas resurfaceadas
    │      Click → revisar → refinar (Progressive Summarization)
    │
    └── 4. Hábitos → check "Planificar el día" ✓
    │
    ▼
Durante el día:
    │
    ├── Ejecutar tareas → check ✓ en Dashboard o /tasks
    ├── Idea surge → Alt+N → captura rápida
    ├── Aprendizaje → crear nota atómica (Flujo 3)
    └── Hábitos → check conforme se completan
    │
    ▼
Final del día:
    │
    └── Revisar hábitos restantes → completar checks
```

---

### Flujo 5: Explorar conocimiento (graph)

**Trigger:** Buscar conexiones, inspiración, o redescubrir notas olvidadas
**Actor:** Usuario
**Resultado:** Descubrir relaciones no obvias entre ideas

```
Sidebar → Notas → "Ver como grafo"
    │
    ▼
Graph View
    Grafo completo renderizado
    │
    ├── Zoom/pan para explorar
    │
    ├── Identificar clusters (nodos agrupados)
    │   "Ah, estas notas de productividad
    │    y hábitos están muy conectadas"
    │
    ├── Hover nodo → highlight vecinos
    │   Ver qué notas están conectadas
    │
    ├── Click nodo → panel con detalle
    │   │
    │   └── "Abrir nota →" → navega al editor
    │       │
    │       ├── Leer nota → refinar
    │       ├── Agregar mención @ a otra nota
    │       └── ← volver al grafo
    │
    └── Filtrar por área/tipo → subgrafo
        "Solo notas permanent de Proyectos"
```

---

### Flujo 6: Configurar IA propia (BYOK)

```
Settings → "Proveedores de IA" → pegar API key de Anthropic
    │
    ▼
Valida contra Anthropic → cifra (AES-256-GCM) → guarda en userSecrets/
    │
    ▼
Inbox AI + auto-tagging habilitados. Sin key → IA de generación deshabilitada
con empty states (D2, sin fallback al secret del proyecto). Detalle en Docs/01 § Flujo 5.
```

---

### Flujo 7: Acceso a la beta (allowlist gate)

```
Login (email/pw)               Login (Google)
    │                             │
 createUser → gate POST-auth    auth → gate POST-auth
    └──────────────┬──────────────┘
                   ▼
   checkMyAccess() autenticado (lee email del token, gate unificado en useAuth)
                   │
 no invitado → signOut + msg genérico (cuenta inerte vía rules)
                   ▼
   invitado → las rules confirman exists(allowlist/{token.email}) en cada read/write
   (defensa en profundidad: UI + callable + rules)
```

---

### Flujo 8: Onboarding (usuario nuevo)

```
Primer login → cuenta vacía
    │
    ▼
WelcomeModal (1 paso, auto-open one-shot) → "Empezar"
    │
    ▼
OnboardingChecklist en el dashboard — 4 hitos reactivos:
  ① API key BYOK → ② primera nota → ③ inbox procesado por IA → ④ primera tarea
    │
    ▼
4/4 → estado de logro + "Cerrar" manual (sin auto-ocultar)
```

---

## 4. Componentes globales

---

### 4.1 Sidebar

**Dónde aparece:** Todas las pantallas (desktop y tablet)
**Propósito:** Navegación principal

```
┌──────────────┐
│  ┌────────┐  │
│  │   SM   │  │  Logo/nombre
│  └────────┘  │
│              │
│  ────────────│
│              │
│  ◇ Dashboard │  Items de navegación
│  ◇ Inbox (3) │  Badge con contador si hay items
│  ◇ Notas     │
│  ◇ Tareas    │
│  ◇ Proyectos │
│  ◇ Objetivos │
│  ◇ Hábitos   │
│              │
│  ────────────│
│              │
│  ⚙ Settings  │
│  ○ Sebastian │  Avatar + nombre
│              │
└──────────────┘

Colapsada (64px):
┌────┐
│ SM │
│────│
│ ◇  │  Solo iconos
│ 📬 │  Badge numérico
│ 📝 │
│ ✅ │
│ 🚀 │
│ 🎯 │
│ ☑️ │
│────│
│ ⚙  │
│ ○  │
└────┘
```

**Comportamiento:**

- **Nav agrupado en 2 secciones (F34):** Ejecución (Dashboard, Inbox, Tareas, Proyectos, Objetivos, Hábitos) y Conocimiento (Notas, Grafo). Arriba, un trigger "Buscar" abre el Command Palette.
- Desktop: fija, 240px. ⌘/Ctrl+B para toggle collapse (64px iconos).
- **Hidden Sidebar Mode (F31/F32/F35):** en desktop el sidebar puede ocultarse y swappear a un `<TopBar />` alterno (logo + Buscar + captura) con animación. Preferencia `sidebarHidden`.
- Tablet: colapsada a iconos (64px), inline sin overlay.
- Mobile: no visible (reemplazada por bottom nav + NavigationDrawer).
- Item activo: highlighted con fondo sutil + indicador izquierdo. Inbox badge: número si hay items pendientes.

---

### 4.2 Bottom Nav (Mobile)

**Dónde aparece:** Mobile (<768px), fija en la parte inferior

```
┌──────────────────────────────────────┐
│   ◇        ◇         ◇        ◇      │
│  Dash     Notas    Tareas    Inbox   │
└──────────────────────────────────────┘
```

- 4 items (F43 — se eliminó el slot "Más" + MoreDrawer)
- Secciones secundarias (Proyectos, Objetivos, Hábitos, Grafo, Settings) → NavigationDrawer (hamburger del header mobile)
- Item activo: icono filled + color primario + label visible
- Inbox: badge numérico

---

### 4.3 Toast / Notificaciones

**Dónde aparece:** Cualquier pantalla, esquina inferior derecha (desktop) / top (mobile)

Tipos:

- **Success**: ✓ verde, auto-dismiss 3s. "Nota creada", "Tarea completada"
- **Error**: ✕ rojo, persiste hasta dismiss o retry. "Error al guardar"
- **Info**: ℹ azul, auto-dismiss 5s. "Sincronizando...", "3 items en inbox"
- **Offline**: 📡 amarillo, persiste mientras offline. "Modo offline — cambios se sincronizarán"

---

### 4.4 Empty States

Patrón consistente para todas las listas vacías:

```
┌──────────────────────────────────┐
│                                  │
│         [Ilustración/Icono]      │
│                                  │
│    Título breve y amigable       │
│    Descripción de qué hacer      │
│                                  │
│    [CTA: Acción principal]       │
│                                  │
└──────────────────────────────────┘
```

Cada sección tiene su propio copy. Nunca mostrar una lista vacía sin contexto.

---

### 4.5 Chrome global persistente

Banners y controles montados en el Layout, transversales a todas las pantallas autenticadas:

- **UpdateBanner (F36):** ofrece recargar cuando hay una versión nueva (PWA `registerType: 'prompt'`).
- **EmailVerificationBanner (F47):** cuando `user && !user.emailVerified` (ver §2.16).
- **Capacity gate "Beta llena" (F47):** en la LoginPage, según `config/app`.
- **PendingSyncIndicator / chip offline (F42):** estado de la retry queue (pendientes/errores) en el header mobile y el sidebar/TopBar.

---

## 5. Shortcuts y atajos

| Shortcut         | Acción                                   | Contexto                 |
| ---------------- | ---------------------------------------- | ------------------------ |
| ⌘K               | Command Palette                          | Global                   |
| Alt+N            | Quick Capture                            | Global                   |
| ⌘/Ctrl+B         | Toggle sidebar (colapsar/ocultar)        | Global (desktop)         |
| ⌘/Ctrl+\         | Toggle split-pane multinota              | Editor / Notas (desktop) |
| Ctrl+Shift+Space | Captura global (abre ventana `/capture`) | Tauri desktop            |
| ⌘+S              | Forzar guardado                          | Editor de nota           |
| ⌘+Enter          | Guardar y cerrar                         | Modales                  |
| Escape           | Cerrar modal/palette                     | Modales                  |
| `@`              | Autocompletado wikilinks                 | Editor de nota           |
| `/`              | Slash commands                           | Editor de nota           |
| `#`              | Autocompletado tags                      | Editor de nota           |

---

## 6. Responsive breakpoints

| Breakpoint | Rango      | Cambios principales                                                                       |
| ---------- | ---------- | ----------------------------------------------------------------------------------------- |
| Mobile     | ≤767px     | Bottom nav (4), FAB, stacked layouts, NavigationDrawer, swipe gestures                    |
| Tablet     | 768-1023px | Sidebar colapsada a iconos, 2 columnas donde aplique, touch-friendly                      |
| Desktop    | ≥1024px    | Sidebar fija (o TopBar si oculta), split-pane multinota, hover states, keyboard shortcuts |

### Reglas responsive globales

- **Viewports de referencia para QA:** 375 (mobile) / 768 (tablet) / 1280 (desktop). El breakpoint desktop (≥1024) activa hidden sidebar y split-pane.
- Sidebar de backlinks en editor: visible en desktop, toggle/drawer en tablet, bottom sheet en mobile
- Graph view: mismo canvas, controles adaptados (pinch zoom mobile vs scroll desktop)
- Kanban de proyectos: scroll horizontal en mobile, columnas completas en desktop
- Habit tracker grid: scroll horizontal en mobile, tabla completa en desktop
- Command palette: full-width en mobile, centrada 600px max en desktop

---
