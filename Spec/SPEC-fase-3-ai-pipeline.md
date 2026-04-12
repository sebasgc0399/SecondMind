# SPEC — SecondMind · Fase 3: AI Pipeline — Inbox AI + InboxProcessor + Command Palette (Completada)

> Registro de lo implementado en la capa de inteligencia artificial.
> Completada: Abril 2026

---

## Objetivo

La capa de AI del sistema. El usuario captura una idea con Alt+N y en segundos la AI sugiere cómo clasificarla: tipo, título, tags, área, prioridad y resumen. El usuario revisa las sugerencias en el card del inbox (inline) o en una vista enfocada one-by-one (`/inbox/process`), acepta con un click, edita si quiere, o descarta. Ctrl+K abre un buscador global que encuentra notas, tareas y proyectos instantáneamente con Orama FTS. Las notas nuevas reciben auto-tags de Claude Haiku al momento de la primera escritura. La fricción de organizar baja dramáticamente — la AI hace el trabajo pesado, el humano decide.

---

## Features implementadas

### F1: Cloud Function processInboxItem

Cloud Function v2 que se dispara con `onDocumentCreated('users/{userId}/inbox/{itemId}')`. Llama a Claude Haiku (`claude-haiku-4-5-20251001`, max_tokens 512) con el `rawContent` del item y escribe **campos flat** `aiSuggested*` al mismo doc de Firestore. Decisión clave: los campos se escriben flat (aiSuggestedTitle, aiSuggestedType, aiSuggestedTags, aiSuggestedArea, aiSummary, aiPriority) en vez de un objeto `aiResult` anidado, alineado al schema de TinyBase que no soporta objetos nested. El campo `aiSuggestedTags` se serializa como JSON array string (patrón del repo). La validación de `suggestedArea` usa fallback `'conocimiento'` en vez de throw porque Haiku devuelve `null` en campos individuales para inputs basura. Secret via `defineSecret('ANTHROPIC_API_KEY')`, accedido con `.value()` dentro del handler. `retry: false`, `timeoutSeconds: 60`, `us-central1`. Primera Cloud Function del repo — creó la estructura completa de `src/functions/` (package.json CommonJS Node 20, tsconfig, .gitignore, `admin.initializeApp()` centralizado en index.ts). Excludes defensivos en `tsconfig.app.json` y `eslint.config.js` para que el build del frontend no toque `src/functions/`. Scripts `deploy:functions` y `logs:functions` agregados a package.json raíz. Firebase Functions v7.2.5 (la v6 fallaba con timeout en el discovery protocol de la CLI).

### F2: Schema aiResult flat en inboxStore + useInbox mapping

Extiende el frontend para recibir los campos que F1 escribe. Reemplaza el placeholder `aiResult: string` del schema de `inboxStore` por 6 campos flat con defaults vacíos. La interface `InboxAiResult` se extiende con `suggestedArea: AreaKey` y `priority: Priority` (reusando types existentes de `src/types/area.ts` y `src/types/common.ts`). Se mantiene `relatedNoteIds: string[]` como placeholder (siempre `[]`) para v1.1 (embeddings) y `'reference'` en `InboxResultType` por compat forward. El hook `useInbox` construye el objeto `aiResult` en el `useMemo` con gate `aiProcessed === true && aiSuggestedTitle !== ''` — diferencia items procesados OK de items pending o con error de parse. Los casts a `InboxResultType`/`AreaKey`/`Priority` son necesarios porque TinyBase solo expone strings planos. `parseIds` de `@/lib/tinybase` se reusa para parsear `aiSuggestedTags` de JSON string a `string[]`. Los docs viejos con `aiResult: ""` (placeholder anterior) quedan como data zombie benigna en Firestore — `merge: true` del persister no los borra en flushes posteriores.

### F3: InboxItem card con sugerencias AI

`AiSuggestionCard` nuevo componente con 2 modos: display (badge tipo + título + área + tags chips read-only + summary + prioridad si task + botones Aceptar/Editar) y edit (form inline con input título + select tipo + select área + select prioridad condicional a tipo=task + input tags comma-separated). Tags en edit mode usan `useState<string>` raw con parseo al submit (evita parsing mid-typing). Cuando `suggestedType === 'trash'`, el botón principal cambia a "Descartar" y llama a dismiss. Indicator "Procesando con AI..." con `Loader2 animate-spin` cuando `!aiProcessed`. Botones fallback "→ Nota" y "Descartar" mantenidos siempre visibles (SPEC explícito). `useInbox` compone `useTasks` y `useProjects` internamente para agregar `convertToTask(itemId, overrides?)` y `convertToProject(itemId, overrides?)`. `convertToNote` extendido con parámetro opcional `ConvertOverrides` (title, area, priority, tags — sin summary porque no tiene campo destino en Note/Task/Project). `createTask` de `useTasks` extendido con segundo argumento opcional `{ priority?, areaId? }` para crear en 1 solo write (retrocompatible). Handler dispatcher en `/inbox/page.tsx` enruta el Aceptar por `suggestedType`: note→convertToNote, task→convertToTask, project→convertToProject, trash/reference→dismiss. Navegación post-accept: note a `/notes/:id`, task a `/tasks`, project a `/projects/:id`.

### F4: Inbox Processor — Vista enfocada one-by-one

Ruta `/inbox/process` que presenta los items pendientes uno a la vez con un form editable pre-llenado. `InboxProcessorForm` con draft local inicializado desde `item.aiResult` o `EMPTY_DRAFT` con título fallback de `rawContent.slice(0, 80)`. Reset del draft con `key={item.id}` (React re-monta el componente). Read-only variant con badge "Ya procesado como {tipo}" cuando `processedMarkers[item.id]` tiene valor. Estado basado en snapshot congelado del batch al montar — `useState<InboxItem[] | null>(null)` inicializado en un `useEffect` que observa `items.length > 0` como signal real del persister (no `isInitializing` de 200ms que no es confiable en full reload). Si items está vacío, grace dedicado de 1500ms antes de snapshotear vacío (evita false empty). `convertToNote/Task/Project` extendidos con tercer argumento `options?: { skipNavigate?: boolean }` — el processor pasa `{ skipNavigate: true }` para quedarse en la vista. Progress dots clickeables en el footer (1 por item, `bg-primary` actual, `bg-primary/40` procesado, `bg-muted` pending). Botón "→ Siguiente" (no en SPEC pero necesario para evitar dead-ends al navegar Atrás a items ya procesados). Keyboard shortcuts: Enter (natural del form), Escape → `/inbox`, ArrowLeft/ArrowRight (solo si target no es input/select). No se implementó `D = Descartar` por riesgo de falso positivo durante edición de tags. Pantalla done con resumen ("Procesaste N notas, M tareas, X descartados") + link "Volver al Dashboard". Botón "Procesar" en header de `/inbox` (disabled como `<span>` si items.length === 0). Link "Procesar →" del `InboxCard` del dashboard redirigido de `/inbox` a `/inbox/process`.

### F5: Command Palette (Ctrl+K) — Búsqueda global

Modal accesible con `Ctrl+K` (o `Cmd+K` en Mac) desde cualquier pantalla. `CommandPaletteProvider` con Context + hook `useCommandPalette` (mismo pattern que `QuickCaptureProvider`). Listener global con `(e.ctrlKey || e.metaKey) && e.key === 'k'` + `e.preventDefault()` (evita Chrome address bar). Dialog base-ui con posición top-center (`top-[15vh]`, estilo Raycast/Linear), animaciones `data-starting-style`/`data-ending-style`. Index Orama unificado con `_type: 'note' | 'task' | 'project'` — `GLOBAL_SCHEMA` con 6 campos (id, \_type, title, body, updatedAt, isArchived) agregado a `src/lib/orama.ts`. `useGlobalSearch` hook con full rebuild del index en cada cambio de store, debounce de 100ms para agrupar los 3 listeners iniciales. Search sync con cast explícito `as Results<AnyDocument>` (Orama v3 runtime es sync sin async components, mismo pattern que `useNoteSearch`). Query vacío muestra "Recientes" (top 5 por `updatedAt desc`, filtra tareas completadas + archivadas) + "Acciones rápidas" estáticas (Notas, Tareas, Proyectos, Ir a Inbox). Keyboard nav: `selectedIndex` con ArrowUp/Down en `<input onKeyDown>`, Enter navega + cierra, mouse hover sincronizado con keyboard index vía `onMouseEnter`. ScrollIntoView del item seleccionado. Coexiste con el index de notas de `useNoteSearch` (propósitos distintos, refactor no justificado). No se implementaron prefijos especiales (`>`, `#`, `@`) ni mutual exclusion con QuickCapture — YAGNI.

### F6: Cloud Function autoTagNote

Cloud Function con `onDocumentWritten('users/{userId}/notes/{noteId}')`. Cambio de `onDocumentCreated` a `onDocumentWritten` descubierto durante testing: las notas desde `/notes` se crean con `contentPlain: ''` (doc vacío) y el texto llega en el primer auto-save (2s después). `onDocumentCreated` se disparaba con content vacío y el guard hacía early return, pero el auto-save posterior no re-disparaba el trigger. `onDocumentWritten` detecta el primer write con contenido. Guard: `if (after.aiProcessed) return` (early return sin log — frecuente en cada update de nota) + `if (!contentPlain.trim()) return`. Prompt más simple que F1: solo tags (máx 5) + summary. `max_tokens: 256`. Escribe `aiTags: JSON.stringify(tags)`, `aiSummary`, `aiProcessed: true` al doc. Validación permisiva — siempre marca `aiProcessed: true` incluso con datos parciales para evitar re-procesamiento (el trigger `onDocumentWritten` se dispara en cada update). Fix crítico en `convertToNote` de `useInbox`: `aiProcessed: !!(overrides?.tags?.length > 0)` — notas del inbox processor con tags aceptados se marcan procesadas al crear para que F6 las ignore. `stripJsonFence` extraído a `src/functions/src/lib/parseJson.ts` como módulo compartido entre `processInboxItem` y `autoTagNote`. Fix del `.gitignore` de functions: `lib/` anchored a `/lib/` para no ignorar `src/lib/` (sources).

---

## Decisiones técnicas que cambiaron vs lo planeado

| Planeado                                                                      | Implementado                                                                        | Razón                                                                                                                                      |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `aiResult` como objeto anidado en Firestore                                   | Campos flat con prefijo `ai*` (aiSuggestedTitle, aiSuggestedType, etc.)             | TinyBase no soporta objetos nested. Flat alinea la CF con el schema del store sin migración                                                |
| `firebase-functions ^6.3.0`                                                   | `firebase-functions ^7.2.5` (major bump)                                            | v6 fallaba con timeout en el discovery protocol de la CLI al desplegar                                                                     |
| `suggestedArea` validado con throw si inválido                                | Fallback `'conocimiento'` si null o no reconocido                                   | Claude Haiku devuelve `null` para inputs basura — throw dejaba items sin procesar                                                          |
| `createTask(name)` seguido de `updateTask(id, {priority, areaId})` (2 writes) | `createTask(name, { priority?, areaId? })` en 1 solo write                          | Elimina el instante intermedio donde la tarea existe sin prioridad/área                                                                    |
| `summary` en `ConvertOverrides`                                               | Removido del tipo                                                                   | No tiene campo destino en Note/Task/Project desde el frontend. aiSummary lo escribe la CF de F6                                            |
| `useState(() => items.filter(...))` para snapshot del batch en processor      | `useState(null)` + `useEffect` con observación de `items.length > 0` + grace 1500ms | El lazy init se ejecuta en el primer render cuando `items` puede estar vacío (persisters no hidrataron). El fix observa datos reales       |
| `onDocumentCreated` para autoTagNote                                          | `onDocumentWritten` con guard `aiProcessed`                                         | Notas creadas vacías desde el editor no tienen contentPlain al momento del create. onDocumentWritten detecta el primer write con contenido |
| `D` como shortcut de Descartar en el processor                                | No implementado                                                                     | Riesgo de falso positivo mientras el usuario edita tags o título con la tecla D                                                            |
| Mutual exclusion entre QuickCapture y CommandPalette                          | No implementado                                                                     | Shortcuts distintos (Alt+N vs Ctrl+K), conflicto improbable. YAGNI                                                                         |
| Prefijos especiales en Command Palette (`>` acciones, `#` tags, `@` áreas)    | No implementado                                                                     | Complejidad alta, valor incremental en MVP. Se agrega en iteración futura                                                                  |

---

## Archivos creados — por feature

**F1 — Cloud Function processInboxItem:**

- `src/functions/package.json`, `src/functions/tsconfig.json`, `src/functions/.gitignore`, `src/functions/package-lock.json`
- `src/functions/src/index.ts` — entry point con `admin.initializeApp()` centralizado
- `src/functions/src/inbox/processInboxItem.ts` — Cloud Function
- `firebase.json` — bloque `functions` agregado (source, runtime nodejs20, predeploy build)
- `tsconfig.app.json` — `exclude: ["src/functions"]` agregado
- `eslint.config.js` — `src/functions` agregado al `globalIgnores`
- `package.json` — scripts `deploy:functions`, `logs:functions`

**F2 — Schema aiResult flat:**

- `src/types/inbox.ts` — `InboxAiResult` extendida con `suggestedArea`, `priority`, imports
- `src/stores/inboxStore.ts` — 6 campos flat reemplazan placeholder `aiResult: string`
- `src/hooks/useInbox.ts` — mapping extendido con construcción de `aiResult`

**F3 — InboxItem card con sugerencias:**

- `src/components/capture/AiSuggestionCard.tsx` — nuevo componente display + edit
- `src/types/inbox.ts` — `ConvertOverrides` interface agregada
- `src/hooks/useTasks.ts` — `createTask` extendido con `options?`
- `src/hooks/useInbox.ts` — `convertToTask`, `convertToProject` nuevas, `convertToNote` con overrides
- `src/components/capture/InboxItem.tsx` — indicator + AiSuggestionCard + prop onAcceptSuggestion
- `src/app/inbox/page.tsx` — handler dispatcher

**F4 — Inbox Processor:**

- `src/app/inbox/process/page.tsx` — página one-by-one con batch snapshot + navegación
- `src/components/capture/InboxProcessorForm.tsx` — form con draft local + read-only variant
- `src/app/router.tsx` — ruta `inbox/process`
- `src/app/inbox/page.tsx` — botón "Procesar" en header
- `src/components/dashboard/InboxCard.tsx` — link "Procesar →" a `/inbox/process`
- `src/hooks/useInbox.ts` — `options?: { skipNavigate?: boolean }` en convertTo\*

**F5 — Command Palette:**

- `src/components/layout/CommandPalette.tsx` — Provider + Dialog + UI
- `src/hooks/useCommandPalette.ts` — Context + hook
- `src/hooks/useGlobalSearch.ts` — Orama index unificado + rebuild + search + recientes
- `src/lib/orama.ts` — `GLOBAL_SCHEMA`, `createGlobalIndex()`, 3 helpers `*RowToGlobalDoc`
- `src/app/layout.tsx` — `CommandPaletteProvider` + `<CommandPalette />`

**F6 — Cloud Function autoTagNote:**

- `src/functions/src/notes/autoTagNote.ts` — Cloud Function
- `src/functions/src/lib/parseJson.ts` — `stripJsonFence` compartido (eliminado en Fase 3.1)
- `src/functions/src/inbox/processInboxItem.ts` — refactor import
- `src/functions/src/index.ts` — export agregado
- `src/hooks/useInbox.ts` — fix `aiProcessed` en `convertToNote`
- `src/functions/.gitignore` — fix anchor `/lib/`

---

## Checklist de completado

- [x] `npm run build` compila sin errores (client + functions)
- [x] La app despliega correctamente (Firebase Hosting + Cloud Functions)
- [x] Al capturar con Alt+N, la Cloud Function procesa el item en < 10 segundos
- [x] La sugerencia AI aparece en el card de inbox con tipo, título, tags, área
- [x] El usuario puede aceptar la sugerencia con un click (crea nota/tarea/proyecto)
- [x] El usuario puede editar la sugerencia antes de aceptar
- [x] El Inbox Processor (`/inbox/process`) permite procesar items one-by-one
- [x] Ctrl+K abre el Command Palette desde cualquier ruta
- [x] La búsqueda global encuentra notas, tareas y proyectos instantáneamente
- [x] Navegación por teclado funciona en el Command Palette (↑↓ Enter Esc)
- [x] Las notas nuevas reciben auto-tags de la AI
- [x] Los datos persisten correctamente en Firestore
- [x] `ANTHROPIC_API_KEY` almacenada como Secret (no hardcoded)

---

## Gotchas descubiertos

Conocimiento nuevo que salió de la implementación y que Fase 4+ deben respetar:

1. **Claude Haiku devuelve `null` en campos individuales del JSON** para inputs basura (especialmente `suggestedArea`). Validar cada campo con fallback en las Cloud Functions — no hacer throw en validación de campos opcionales. El fallback para área es `'conocimiento'`. _(Resuelto en Fase 3.1: tool use con schema enforcement elimina nulls a nivel de decoder)_

2. **`isInitializing` de hooks (200ms) no es suficiente para snapshots de datos en full reload.** Los persisters pueden tardar más en hidratar el store. Para decisiones de "¿hay datos o no?" (ej: batch del InboxProcessor, redirect por existencia de row), usar un grace dedicado más largo (1500ms) o observar `items.length > 0` como signal real. Mismo patrón que `redirectGraceExpired` de ProjectDetailPage de Fase 2

3. **`onDocumentCreated` no cubre notas creadas vacías desde el editor.** Las notas desde `/notes` se crean con `contentPlain: ''` y el texto llega en el auto-save (2s después). `autoTagNote` usa `onDocumentWritten` con guard `aiProcessed` para procesar en el primer write con contenido sin re-procesar en updates subsiguientes

4. **Notas del inbox processor necesitan `aiProcessed: true` al crear** si vienen con tags aceptados del AI. Sin esto, `autoTagNote` sobrescribiría los tags que el usuario aceptó. `convertToNote` setea `aiProcessed: !!(overrides?.tags?.length > 0)`

5. **Orama v3 `search()` es sync at runtime** aunque el tipo diga `Results | Promise<Results>`. Sin async components, se castea a `Results<AnyDocument>` y se usa en `useMemo`. Patrón establecido en `useNoteSearch` de Fase 1 y replicado en `useGlobalSearch`

6. **Firebase Functions v6 → v7 breaking change** — la v6 fallaba con timeout en el discovery protocol de la CLI (`User code failed to load. Timeout after 10000`). La v7 lo resolvió. Importante al elegir versiones de `firebase-functions`

7. **`lib/` en `.gitignore` de functions matchea `src/lib/`** (sources) además de `lib/` (compiled). Anchor con `/lib/` para evitar ignorar archivos fuente

---

## Dependencias agregadas

**En `src/functions/package.json` (sub-package, no en raíz):**

```
@anthropic-ai/sdk ^0.40.1
firebase-admin ^13.8.0
firebase-functions ^7.2.5
```

**En raíz:** ninguna. Todo el stack de Fase 3 funciona sobre las dependencias existentes (Orama, base-ui, lucide-react, TinyBase, React Router).

---
