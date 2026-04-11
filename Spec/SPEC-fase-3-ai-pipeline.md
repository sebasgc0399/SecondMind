# SPEC — SecondMind · Fase 3: AI Pipeline — Inbox AI + InboxProcessor + Command Palette

> Alcance: El inbox se procesa automáticamente con Claude Haiku (sugiere tipo, título, tags, área), el usuario revisa/acepta/edita sugerencias en una vista enfocada one-by-one, y un Command Palette (⌘K) permite buscar notas, tareas y proyectos globalmente
> Dependencias: Fase 2 (Ejecución) completada
> Estimado: 2-3 semanas (solo dev)
> Stack relevante: React 19 + TypeScript + Firebase Cloud Functions v2 + Anthropic API (Claude Haiku) + TinyBase v8 + Orama + Tailwind v4 + shadcn/ui + @base-ui/react

---

## Objetivo

Al terminar esta fase, el usuario captura una idea con Alt+N y en segundos la AI sugiere qué hacer con ella: "esto es una tarea de prioridad alta para tu proyecto Cielo Estrellado" o "esto es una nota sobre productividad, tags: #zettelkasten #captura". El usuario revisa las sugerencias en una vista enfocada (one-by-one), acepta con un click, edita si quiere, o descarta. Además, ⌘K abre un buscador global que encuentra notas, tareas y proyectos instantáneamente. La fricción de organizar baja dramáticamente — la AI hace el trabajo pesado, el humano decide.

---

## Features

### F1: Cloud Function — processInboxItem

**Qué:** Cloud Function v2 que se dispara cuando se crea un nuevo item en `users/{userId}/inbox/{itemId}`. Llama a Claude Haiku con el `rawContent` y guarda las sugerencias en el campo `aiResult` del mismo documento.

**Criterio de done:**

- [ ] Cloud Function `processInboxItem` desplegada en Firebase
- [ ] Se dispara automáticamente con `onDocumentCreated('users/{userId}/inbox/{itemId}')`
- [ ] Llama a la API de Anthropic con Claude Haiku (`claude-haiku-4-5-20251001`)
- [ ] El prompt retorna JSON estructurado: `{ suggestedTitle, suggestedType, suggestedTags, suggestedArea, summary, priority }`
- [ ] El resultado se guarda en el doc como `aiResult` + `aiProcessed: true`
- [ ] Si la API falla, marca `aiProcessed: false` y loggea el error (no reintenta automáticamente)
- [ ] El timeout es 60s, retry deshabilitado (el procesamiento no es idempotente si ya escribió parcialmente)
- [ ] La API key de Anthropic se almacena como Secret de Firebase (`ANTHROPIC_API_KEY`)

**Archivos a crear:**

- `src/functions/src/inbox/processInboxItem.ts` — Cloud Function
- `src/functions/package.json` — Deps: `@anthropic-ai/sdk`, `firebase-admin`, `firebase-functions`
- `src/functions/tsconfig.json` — Config TS para Functions

**Notas de implementación:**

Prompt estructurado para Claude Haiku:

```
System: Eres un asistente de productividad personal. Analizas capturas rápidas del usuario
y sugieres cómo clasificarlas. El usuario tiene estas áreas: Proyectos, Conocimiento,
Finanzas, Salud y Ejercicio, Pareja, Hábitos.

User: Clasifica esta captura:
"{rawContent}"

Responde SOLO con JSON válido, sin markdown:
{
  "suggestedTitle": "Título conciso (max 80 chars)",
  "suggestedType": "note" | "task" | "project" | "trash",
  "suggestedTags": ["tag1", "tag2"],
  "suggestedArea": "proyectos" | "conocimiento" | "finanzas" | "salud" | "pareja" | "habitos",
  "summary": "Resumen de una línea",
  "priority": "low" | "medium" | "high" | "urgent"
}
```

- `suggestedType: "trash"` significa que la AI piensa que no vale la pena guardar (spam, duplicado, irrelevante). El usuario decide.
- `priority` solo es relevante si `suggestedType === "task"`.
- Las áreas en el prompt coinciden con las keys de `AREAS` de `src/types/area.ts`.
- El SDK de Anthropic se usa directo — no wrapper custom.
- Loggear `{ userId, itemId, suggestedType }` en cada ejecución para debugging.

---

### F2: Actualizar schema de InboxItem para aiResult

**Qué:** Extender `inboxStore` y `InboxItem` type para soportar el campo `aiResult` que la Cloud Function escribe. El persister ya sincroniza bidireccionalmente — cuando la Cloud Function escribe a Firestore, `onSnapshot` trae el cambio al store local.

**Criterio de done:**

- [ ] Interface `AiResult` definida con todos los campos del JSON de Claude
- [ ] Interface `InboxItem` extendida con `aiResult?: AiResult`
- [ ] `inboxStore` schema actualizado con campos de `aiResult` (flat, no nested — TinyBase no soporta objetos)
- [ ] Al capturar con Alt+N, el item aparece con `aiProcessed: false`
- [ ] Cuando la Cloud Function escribe el resultado, el store se actualiza reactivamente (via `onSnapshot` del persister)

**Archivos a modificar:**

- `src/types/inbox.ts` — Agregar interface `AiResult`, extender `InboxItem`
- `src/stores/inboxStore.ts` — Agregar campos flat de aiResult al schema
- `src/hooks/useInbox.ts` — Parsear los campos flat de aiResult a un objeto `AiResult` en el mapping

**Notas de implementación:**

- TinyBase no soporta objetos anidados. Los campos de `aiResult` se almacenan flat en el store:
  ```
  aiSuggestedTitle: string (default '')
  aiSuggestedType: string (default '')
  aiSuggestedTags: string (default '[]', JSON array)
  aiSuggestedArea: string (default '')
  aiSummary: string (default '')
  aiPriority: string (default '')
  ```
- El hook `useInbox` agrupa estos campos en un objeto `aiResult` al mappear las rows para consumo en componentes.
- El campo `aiProcessed` ya existe en el schema (boolean, default false).
- Cuando la Cloud Function escribe a Firestore, el `onSnapshot` del persister detecta el cambio y actualiza el store local. El merge: true del persister previene sobrescribir campos locales.

---

### F3: InboxItem card con sugerencias AI

**Qué:** Actualizar el card de inbox (`InboxItem.tsx`) para mostrar las sugerencias de la AI cuando `aiProcessed === true`. Agregar botones "Aceptar" y "Editar" además del "Descartar" y "→ Nota" existentes.

**Criterio de done:**

- [ ] Si `aiProcessed === false`, el card muestra el contenido sin sugerencias (como hoy) + indicador "⏳ Procesando..."
- [ ] Si `aiProcessed === true` y hay `aiResult`, muestra sección "🤖 Sugerencia" con: tipo, título sugerido, área, tags, resumen
- [ ] Botón "✓ Aceptar" crea la entidad sugerida (nota/tarea/proyecto) con los campos pre-llenados y marca el item como processed
- [ ] Botón "✏️ Editar" expande un formulario inline con campos editables (título, tipo dropdown, área select, tags input)
- [ ] Tras editar, el botón "✓ Crear" usa los valores editados
- [ ] Si `suggestedType === 'trash'`, mostrar badge "🗑️ Descartar sugerido" y el botón principal dice "Descartar"
- [ ] Los botones "→ Nota" y "Descartar" existentes siguen funcionando como fallback manual

**Archivos a modificar:**

- `src/components/capture/InboxItem.tsx` — Agregar sección de sugerencias AI, botones, expand editable

**Archivos a crear:**

- `src/components/capture/AiSuggestionCard.tsx` — Componente que muestra la sugerencia + formulario editable

**Notas de implementación:**

- "Aceptar" con `suggestedType === 'note'` → crea nota (mismo flow que "→ Nota" de F8 Fase 1, pero con título, area, tags pre-llenados).
- "Aceptar" con `suggestedType === 'task'` → crea tarea con nombre=suggestedTitle, priority=aiPriority, areaId=suggestedArea. Navega a `/tasks`.
- "Aceptar" con `suggestedType === 'project'` → crea proyecto con nombre=suggestedTitle, areaId=suggestedArea. Navega a `/projects/:id`.
- Tags sugeridos: en MVP se muestran como texto read-only en la sugerencia. No se guardan en un `tagsStore` (no existe aún). Se guardan en el campo `tagIds` de la nota/tarea como JSON array. Iteración futura: CRUD de tags.
- El formulario editable en "Editar" usa inputs nativos/selects, no componentes fancy. Mismo patrón que TaskCard expand.

---

### F4: Inbox Processor — Vista enfocada one-by-one

**Qué:** Nueva ruta `/inbox/process` que presenta los items pendientes uno a la vez con campos editables pre-llenados por la AI. Diseñada para procesar el inbox rápidamente sin distracciones.

**Criterio de done:**

- [ ] Ruta `/inbox/process` creada en el router
- [ ] Header muestra "Procesando Inbox · N de M" + botón "✕ Salir" que navega a `/inbox`
- [ ] Muestra un item a la vez: contenido original (read-only) + formulario con campos pre-llenados por AI
- [ ] Campos editables: Tipo (select: Nota/Tarea/Proyecto/Descartar), Título (input), Área (select), Tags (text input), Prioridad (select, visible solo si tipo=Tarea)
- [ ] Botón "✓ Crear" (o "✓ Crear y siguiente" si hay más items): crea la entidad y avanza al siguiente
- [ ] Botón "Descartar": marca como dismissed y avanza
- [ ] Botón "← Atrás": vuelve al item anterior (no deshace la creación, solo navega)
- [ ] Al terminar todos los items: pantalla "¡Inbox limpio! 🎉" con link de vuelta al dashboard
- [ ] Dots de progreso en el footer (filled/empty circles)
- [ ] Si el item no tiene `aiResult` aún, los campos están vacíos (el usuario llena manualmente)
- [ ] Botón "Procesar" en `/inbox` navega a `/inbox/process`
- [ ] Si no hay items pendientes, el botón "Procesar" está disabled

**Archivos a crear:**

- `src/app/inbox/process/page.tsx` — Página one-by-one
- `src/components/capture/InboxProcessorForm.tsx` — Formulario con campos editables

**Archivos a modificar:**

- `src/app/router.tsx` — Agregar ruta `/inbox/process` como child del Layout
- `src/app/inbox/page.tsx` — Agregar botón "Procesar" en el header

**Notas de implementación:**

- State del processor: `currentIndex` (number), navega entre items con prev/next.
- Los items se leen del hook `useInbox()` filtrados por `status === 'pending'`. Al crear/descartar, el array se acorta y el index se ajusta.
- "Crear" según tipo:
  - `note` → mismo flow que convertToNote de F8 Fase 1, pero con título, area, tags pre-llenados
  - `task` → `createTask(name)` + `updateTask(id, { priority, areaId })`
  - `project` → `createProject({ name, areaId, priority })`
  - `trash`/descartar → `dismiss(itemId)`
- Después de crear, marca el inbox item como `processed` con `processedAs`.
- "← Atrás" solo cambia el index — no deshace. Si el item anterior ya fue procesado, muestra un estado "Ya procesado ✓" read-only.
- Keyboard shortcuts dentro del processor: Enter = Crear, D = Descartar, ← = Atrás (solo si no hay focus en input).

---

### F5: Command Palette (⌘K) — Búsqueda global

**Qué:** Modal de búsqueda global accesible con ⌘K (Ctrl+K en Windows) desde cualquier pantalla. Busca notas, tareas y proyectos instantáneamente con Orama. Navegación por teclado.

**Criterio de done:**

- [ ] `Ctrl+K` (o `⌘K` en Mac) abre el modal desde cualquier ruta
- [ ] Input con placeholder "Buscar notas, tareas, proyectos..."
- [ ] Resultados agrupados por categoría: Notas, Tareas, Proyectos (con headers)
- [ ] Búsqueda FTS instantánea (< 50ms) usando Orama
- [ ] Resultados muestran: ícono de tipo + título + snippet relevante
- [ ] Navegación por teclado: ↑↓ para mover, Enter para seleccionar, Esc para cerrar
- [ ] Click o Enter navega a la entidad seleccionada (`/notes/:id`, `/tasks` con scroll, `/projects/:id`)
- [ ] Query vacío muestra "recientes" (últimas 5 entidades visitadas o editadas)
- [ ] Sin resultados: "Sin resultados para 'query'"
- [ ] El modal se cierra al navegar

**Archivos a crear:**

- `src/components/layout/CommandPalette.tsx` — Modal con input + resultados + keyboard nav
- `src/hooks/useCommandPalette.ts` — Context + Provider (mismo patrón que QuickCapture): open/close state, keyboard listener global
- `src/hooks/useGlobalSearch.ts` — Hook que busca en múltiples Orama indexes (notas + tareas + proyectos)

**Archivos a modificar:**

- `src/app/layout.tsx` — Montar `CommandPaletteProvider` + `<CommandPalette />` junto al QuickCapture
- `src/lib/orama.ts` — Extender para indexar tareas y proyectos (además de notas)

**Notas de implementación:**

- El modal usa Dialog de @base-ui/react (mismo patrón que QuickCapture).
- Posición: centrado top con offset `space-16` del MASTER.md (estilo Raycast/Linear).
- Orama: crear 3 indexes separados (notas, tareas, proyectos) o un index unificado con campo `_type`. Index unificado es más simple — un solo `search()` con resultados taggeados.
- `useGlobalSearch` hace `search(db, { term: query, limit: 15 })` y agrupa resultados por `_type`.
- Sync del index: listener en `notesStore`, `tasksStore`, `projectsStore`. Rebuild on change (mismo patrón que `useNoteSearch` de F6 Fase 1).
- Keyboard nav: tracked con `selectedIndex` state. ArrowDown/Up incrementa/decrementa. Enter dispara navigate al item seleccionado.
- La lista de "recientes" cuando el query está vacío: top 5 por `updatedAt` desc de los 3 stores combinados.
- Conflicto con shortcuts: ⌘K y Alt+N no chocan. Si el Command Palette está abierto y el usuario presiona Alt+N, no pasa nada (el QuickCapture solo abre si el CP está cerrado y viceversa).

---

### F6: Auto-tagging de notas nuevas

**Qué:** Cloud Function que se dispara cuando se crea una nota nueva y genera tags sugeridos usando Claude Haiku. Los tags se guardan en `aiTags` de la nota.

**Criterio de done:**

- [ ] Cloud Function `autoTagNote` desplegada en Firebase
- [ ] Se dispara con `onDocumentCreated('users/{userId}/notes/{noteId}')`
- [ ] Solo procesa si `aiProcessed === false` y `contentPlain` no está vacío
- [ ] Llama a Claude Haiku con el contenido de la nota
- [ ] Guarda `aiTags` (array de strings) y `aiSummary` (una línea) en el doc
- [ ] Marca `aiProcessed: true`
- [ ] Si falla, loggea y no reintenta
- [ ] No se dispara para notas creadas desde el inbox processor (ya tienen tags de la sugerencia)

**Archivos a crear:**

- `src/functions/src/notes/autoTagNote.ts` — Cloud Function

**Notas de implementación:**

Prompt para auto-tagging:

```
System: Eres un asistente que analiza notas personales y sugiere tags relevantes.
Máximo 5 tags. También genera un resumen de una línea.

User: Nota:
"{contentPlain}"

Responde SOLO con JSON válido:
{
  "tags": ["tag1", "tag2", "tag3"],
  "summary": "Resumen de una línea"
}
```

- Los `aiTags` se guardan como JSON array en el campo `aiTags` de la nota (ya existe en el schema de Fase 1).
- El `aiSummary` se guarda en el campo `aiSummary` (ya existe).
- Filtro: `if (data.aiProcessed || !data.contentPlain) return;` — evita reprocesar y notas vacías.
- Las notas creadas desde el inbox processor ya tienen tags del `aiResult` copiados a `tagIds`. La Cloud Function verifica `aiProcessed` para no sobrescribir.

---

## Orden de implementación

1. **F1: Cloud Function processInboxItem** → Backend primero. Sin esto, no hay AI.
2. **F2: Schema aiResult** → Extiende el store para recibir los datos de F1.
3. **F3: InboxItem card con sugerencias** → UI que muestra lo que F1 genera.
4. **F4: Inbox Processor** → Vista enfocada que consume F2/F3.
5. **F5: Command Palette** → Independiente del pipeline AI. Se puede hacer en paralelo desde F1.
6. **F6: Auto-tagging** → Extensión de F1 a notas. Requiere Functions ya configuradas.

---

## Estructura de archivos nuevos

```
src/
├── app/
│   └── inbox/
│       └── process/
│           └── page.tsx                    # Inbox Processor (F4)
│
├── components/
│   ├── capture/
│   │   ├── AiSuggestionCard.tsx            # Sugerencia AI en inbox card (F3)
│   │   └── InboxProcessorForm.tsx          # Form editable one-by-one (F4)
│   └── layout/
│       └── CommandPalette.tsx              # ⌘K búsqueda global (F5)
│
├── hooks/
│   ├── useCommandPalette.ts                # Context + Provider para ⌘K (F5)
│   └── useGlobalSearch.ts                  # Búsqueda multi-store Orama (F5)
│
├── lib/
│   └── orama.ts                            # Extendido: index multi-tipo (F5)
│
└── functions/
    ├── src/
    │   ├── inbox/
    │   │   └── processInboxItem.ts         # Cloud Function inbox AI (F1)
    │   └── notes/
    │       └── autoTagNote.ts              # Cloud Function auto-tag (F6)
    ├── package.json                        # Deps Functions (F1)
    └── tsconfig.json                       # Config TS Functions (F1)
```

---

## Definiciones técnicas

### D1: Claude Haiku vs modelos locales

Claude Haiku cuesta ~$0.25/1M tokens input. Para uso personal (~100 items/mes, ~500 tokens promedio por item), el costo es < $0.02/mes. Modelos locales son plan B si escala — no en MVP.

### D2: Secret management

La API key de Anthropic se almacena como Firebase Secret:

```bash
firebase functions:secrets:set ANTHROPIC_API_KEY
```

La Cloud Function la accede con `defineSecret('ANTHROPIC_API_KEY')` y `process.env.ANTHROPIC_API_KEY` en runtime.

### D3: Rate limiting / abuse prevention

No necesario en MVP (single-user, auth-gated). Las Cloud Functions solo procesan docs dentro del path autenticado del usuario. Si se abre a multi-user en el futuro, agregar rate limiting por userId.

### D4: Retry policy

`retry: false` en las Cloud Functions. Si la API de Anthropic falla, el item queda con `aiProcessed: false` y el usuario puede procesarlo manualmente. No vale la pena la complejidad de retry + idempotency para uso personal.

### D5: Index unificado vs separado en Orama

Index unificado con campo `_type: 'note' | 'task' | 'project'`. Un solo `search()` con resultados agrupados post-query. Más simple que mantener 3 indexes sincronizados.

---

## Checklist de completado

Al terminar Fase 3, TODAS estas condiciones deben ser verdaderas:

- [ ] `npm run build` compila sin errores (client + functions)
- [ ] La app despliega correctamente (Firebase Hosting + Cloud Functions)
- [ ] Al capturar con Alt+N, la Cloud Function procesa el item en < 10 segundos
- [ ] La sugerencia AI aparece en el card de inbox con tipo, título, tags, área
- [ ] El usuario puede aceptar la sugerencia con un click (crea nota/tarea/proyecto)
- [ ] El usuario puede editar la sugerencia antes de aceptar
- [ ] El Inbox Processor (`/inbox/process`) permite procesar items one-by-one
- [ ] ⌘K/Ctrl+K abre el Command Palette desde cualquier ruta
- [ ] La búsqueda global encuentra notas, tareas y proyectos instantáneamente
- [ ] Navegación por teclado funciona en el Command Palette (↑↓ Enter Esc)
- [ ] Las notas nuevas reciben auto-tags de la AI
- [ ] Los datos persisten correctamente en Firestore
- [ ] `ANTHROPIC_API_KEY` almacenada como Secret (no hardcoded)

---

## Siguiente fase

**Fase 4 (Grafo + Resurfacing):** Knowledge graph visual con Reagraph, embeddings pipeline con OpenAI, búsqueda semántica de "notas similares", FSRS resurfacing algorithm, y Daily Digest en el dashboard. Fase 3 agrega inteligencia al inbox y búsqueda global — Fase 4 agrega inteligencia al conocimiento conectado.
