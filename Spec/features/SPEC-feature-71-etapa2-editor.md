# SPEC — Etapa 2: Editor productivo

> **Estado:** En curso (rama `feat/etapa2-editor`).
> **Origen / autorización:** Sebastián, 2026-10-03, eligió la opción 1 ("Editor productivo") de la propuesta de Etapa 2: _"y si tomare tu recomendacion"_ / _"Si procedamos"_. **Loop autorizado** (2026-10-03, cita textual): _"Apruebo el SPEC-71. Autorizado el loop para la Etapa 2, rama feat/etapa2-editor, commits y tags locales, sin push."_ > **Etiquetas:** locales `e2-T<n>`. **Nunca** `v*` (dispara `release.yml`). Sin push dentro de la etapa; al cerrar, el orquestador mergea a `main` con la aprobación de Sebastián (Docs/05 § 10).
> **Rama:** `feat/etapa2-editor`.
> **Release:** junto con la Etapa 1 (SPEC-70) forma el próximo release **0.6.1** (el release —tag, CI, deploy, changelog— es un paso aparte, a pedido de Sebastián).

---

## Objetivo

Que escribir en una nota sirva para **conectar y ejecutar**, no solo para guardar texto. Cuatro mejoras del editor, 100% cliente:

1. **Pista de comandos en líneas vacías.** Hoy el placeholder `editor.placeholder` ("Escribe una idea...") solo aparece en el primer párrafo de una nota vacía (`src/index.css:396-400`, `p.is-editor-empty:first-child::before`); nada enseña que `/` abre el menú de comandos.
2. **Enlazar desde "Notas similares".** `SimilarNotesPanel` (`src/components/editor/SimilarNotesPanel.tsx:61-69`) solo navega; para enlazar una nota sugerida hay que escribir `[[` y buscarla a mano.
3. **Convertir una selección en nota.** El bubble menu (`src/components/editor/menus/BubbleToolbar.tsx:126-170`) solo formatea. Atomizar una idea (Zettelkasten) exige copiar, crear nota, pegar y volver a enlazar.
4. **Tareas del editor que son tareas reales.** Los checkboxes de la nota (`TaskItem`, `NoteEditor.tsx:67-68`) son texto: no aparecen en `/tasks`. El tipo `Task` ya tiene `noteIds: string[]` (`src/types/task.ts:12`), sin uso desde el editor.

**Fuera de alcance (verificado 2026-10-03):** resaltado de sintaxis en bloques de código — **ya existe** (`code-block-lowlight.ts`, selector de lenguaje y copiar en `CodeBlockNodeView.tsx:62-106`, temas claro/oscuro en `src/index.css:250+/326+`); se saca de "Candidatos próximos". Imágenes, links sugeridos por IA en línea y tab semántico de la paleta quedan para otra etapa.

## Invariantes

- **I1 — Producción intocable.** Ni CLI ni MCP sobre `secondmindv1`, sin deploy, sin push, sin tags `v*`. UI solo con `npm run dev:emu` / `npm run e2e:ui`.
- **I2 — Sin cambios de shape ni backend.** No se tocan las cells de `src/stores/*.ts`, `TINYBASE_SCHEMA_VERSION`, `UserPreferences`, `src/functions/`, `firestore.rules` ni índices. Se permite: atributos nuevos en nodos TipTap (viven en el JSON `content` de la nota, fuera de TinyBase) y opciones **aditivas** en los repos (p. ej. `noteIds` en `CreateTaskOptions`).
- **I3 — Writes por repo.** Toda escritura pasa por `notesRepo`/`tasksRepo` (patrón optimistic de `createFirestoreRepo`); nada de `setDoc`/`setPartialRow` directo desde componentes o hooks.
- **I4 — Links consistentes.** Cualquier wikilink insertado (T2, T3) es un nodo `wikilink` normal (`insertWikilink`, `wikilink.ts:81-86`), así `syncLinksFromEditor` crea el link y el backlink como si se hubiera escrito `[[…]]`. No se escribe en `links/` a mano.
- **I5 — Bilingüe.** Todo texto nuevo va en `src/locales/es` **y** `src/locales/en`, con el copy aprobado en este SPEC (§ Copy). Cambiar ese copy o el aspecto acordado se estaciona para Sebastián.
- **I6 — Control positivo.** Todo test nuevo falla contra el código anterior o contra una mutación deliberada, y se reporta el FAIL observado.
- **I7 — Verde.** Cada tanda cierra con `npm run verify` PASS; la etapa cierra además con `npm run e2e:ui` verde y una verificación visual en el emulador (375/768/1280) de lo que cambió.
- **I8 — Export intacto.** `src/lib/export/` sigue produciendo el mismo Markdown para notas sin los atributos nuevos; si se agrega un atributo a un nodo, `exportExtensions.ts` lo conoce y los tests de `serializeNote` siguen verdes.

## Copy (aprobado con este SPEC)

| Clave (sugerida)                  | es                            | en                      |
| --------------------------------- | ----------------------------- | ----------------------- |
| `editor.placeholderEmptyLine`     | Escribe `/` para ver comandos | Type `/` for commands   |
| `editor.similar.insertLink`       | Insertar enlace               | Insert link             |
| `editor.similar.alreadyLinked`    | Ya enlazada                   | Already linked          |
| `editor.bubble.convertToNote`     | Convertir en nota             | Convert to note         |
| `editor.bubble.convertToNoteDone` | Nota creada y enlazada        | Note created and linked |
| `editor.task.createTask`          | Crear tarea                   | Create task             |
| `editor.task.linked`              | Vinculada a Tareas            | Linked to Tasks         |

## Plan por tandas

| Id     | Objetivo                                     | Áreas                                                                                      | Tamaño | Riesgo | Depende |
| ------ | -------------------------------------------- | ------------------------------------------------------------------------------------------ | ------ | ------ | ------- |
| **T1** | Pista "/" en la línea vacía con foco         | `NoteEditor.tsx` (Placeholder), `src/index.css`, locales                                   | ~100   | Bajo   | —       |
| **T2** | "Insertar enlace" desde Notas similares      | `SimilarNotesPanel.tsx`, `NoteEditorContainer.tsx`, locales                                | ~200   | Bajo   | —       |
| **T3** | "Convertir en nota" en el bubble menu        | `BubbleToolbar.tsx`, `notesRepo.ts` (creación con contenido), hook nuevo, locales          | ~400   | Medio  | —       |
| **T4** | Tareas del editor vinculadas a tareas reales | `TaskItem` extendido + NodeView, `tasksRepo.ts` (`noteIds` aditivo), `exportExtensions.ts` | ~600   | Alto   | —       |

Modelos (Docs/05 § 3): T1–T2 writer y fixer `sonnet`; T3 writer `sonnet`, fixer `opus` si los hallazgos son de lógica; **T4 writer `opus`** (estado compartido editor ↔ store, concurrencia de escrituras). Reviewer siempre `opus`.

### T1 — Pista de comandos en líneas vacías

- **Qué:** configurar `Placeholder` con una función por nodo: nota vacía → `editor.placeholder` (sin cambios); **párrafo vacío con el cursor** en una nota con contenido → `editor.placeholderEmptyLine`. Solo en el párrafo actual (`showOnlyCurrent`), nunca en todos los vacíos a la vez, ni dentro de bloques de código, tablas o items de tarea. CSS: el `::before` existente pasa a cubrir `.is-empty` con el mismo estilo (color `muted-foreground`, sin cambiar tipografía).
- **Fuentes de verdad:** `NoteEditor.tsx:73`, `src/index.css:396-400`, docs de `@tiptap/extension-placeholder` v3 (context7).
- **Criterio de cierre:** test de la función de placeholder (nota vacía / línea vacía / bloque de código / tabla); verificación visual en emulador; `npm run verify` PASS.
- **Control positivo:** el test de "línea vacía" falla con la configuración actual.
- **Mirar con lupa:** que el placeholder no se exporte ni se guarde (es decoración); que no aparezca en el modo solo-lectura/resumen L3; mobile (teclado virtual).

### T2 — Insertar enlace desde Notas similares

- **Qué:** cada item de `SimilarNotesPanel` suma un botón con ícono (lucide `Link2`, `aria-label` = `editor.similar.insertLink`) que inserta un wikilink a esa nota **en la posición del cursor** del editor (o al final del documento si el editor no tiene foco/selección). Si la nota ya está enlazada desde la actual (está en `outgoingLinkIds`), el botón se muestra deshabilitado con tooltip `editor.similar.alreadyLinked`. La navegación por click en el título se mantiene.
- **Fuentes de verdad:** `SimilarNotesPanel.tsx`, `NoteEditorContainer.tsx:188` (de dónde sale la instancia del editor), `wikilink.ts:81-86`, I4.
- **Criterio de cierre:** tests del panel (inserta con el `noteId`/`noteTitle` correctos, deshabilitado si ya enlazada); `npm run verify` PASS.
- **Control positivo:** quitar la condición de `outgoingLinkIds` hace fallar el test de "ya enlazada".
- **Mirar con lupa:** que el wikilink dispare el guardado normal (se ve en Backlinks de la otra nota en el emulador); foco del editor tras insertar; título vacío ("Sin título").

### T3 — Convertir una selección en nota

- **Qué:** botón en el bubble menu (lucide `FilePlus2`, label `editor.bubble.convertToNote`), visible con selección no vacía fuera de bloques de código. Al usarlo:
  1. Crea una nota nueva vía `notesRepo` con **el contenido seleccionado como JSON de TipTap** (conserva formato, listas y wikilinks internos) y `contentPlain` derivado. Título = primera línea de texto de la selección, recortada a 80 caracteres.
  2. Reemplaza la selección en la nota actual por un wikilink a la nota nueva (una transacción; deshacer con Ctrl+Z restaura el texto original).
  3. Se queda en la nota actual y muestra un toast `editor.bubble.convertToNoteDone` (patrón de toasts existente).
- Si la creación falla (`createNote` devuelve `null`), no toca la selección y muestra el error con el patrón existente.
- **Fuentes de verdad:** `notesRepo.createNote` (`notesRepo.ts:23-37`) y `createFromInbox` (`notesRepo.ts:159`, patrón de creación con `content`); campos y valores válidos de la row de nota (Docs/01, `notesStore`); I3, I4.
- **Criterio de cierre:** función pura testeada (selección → `{ title, contentJson, contentPlain }`, incluidos multi-párrafo, selección dentro de una lista, wikilink dentro); test del repo (la nota nace con `content`); en emulador: la nota nueva existe, abre con el texto, la original muestra el wikilink y la nueva tiene el backlink; `npm run verify` PASS.
- **Control positivo:** el test de título falla si se quita el recorte; el de contenido falla si se usa solo texto plano.
- **Mirar con lupa:** selección que corta un nodo a la mitad (slice abierto); selección de toda la nota; nota recién creada que todavía no se guardó (id temporal); `source`/`noteType` de la nota nueva con un valor que ya exista (no inventar enums, ver `feedback_types_runtime`); que `autoTagNote` no pise nada.

### T4 — Tareas del editor vinculadas a tareas reales

- **Qué:**
  - `TaskItem` extendido con atributo `taskId` (default `null`, se serializa en el JSON de la nota). `exportExtensions.ts` usa la misma extensión (I8).
  - NodeView del item: sin `taskId`, al pasar el mouse (o siempre en touch) un botón chico (lucide `ListPlus`, label `editor.task.createTask`) crea la tarea vía `tasksRepo.createTask(texto del item, { noteIds: [noteId] })` y guarda el `taskId` en el nodo. Con `taskId`, un ícono discreto (lucide `ListChecks`, tooltip `editor.task.linked`) que lleva a `/tasks`.
  - **Estado:** con `taskId`, el checkbox refleja el estado de la tarea en `tasksStore` (completada ↔ marcado), y marcarlo/desmarcarlo en el editor completa/reabre la tarea vía `tasksRepo`. El atributo `checked` del nodo se actualiza para que el export y el texto sigan coherentes.
  - **Fuera de alcance (decisiones fijadas):** editar el texto del item **no** renombra la tarea; borrar el item o la nota **no** borra la tarea; no se crean tareas automáticamente (solo con el botón). Si la tarea ya no existe (borrada), el item vuelve a ser un checkbox local y el `taskId` se limpia al próximo cambio.
  - `CreateTaskOptions` suma `noteIds?: string[]` (aditivo, I2).
- **Fuentes de verdad:** `src/types/task.ts`, `tasksRepo.ts:9-12,30,43,71-79`, `useTasks.ts:33`, creación de tareas en `src/app/tasks/page.tsx:124` e `inboxRepo.ts:124`, NodeView de referencia `CodeBlockNodeView.tsx`, docs TipTap 3 de `TaskItem`/NodeView (context7).
- **Criterio de cierre:** tests de la extensión (atributo `taskId` round-trip en JSON), del repo (`noteIds` persiste), y de la sincronización de estado (store → checkbox, checkbox → repo); test de export con y sin `taskId`; en emulador: crear tarea desde una nota, verla en `/tasks`, completarla en `/tasks` y ver el check en la nota, y al revés; `npm run verify` PASS.
- **Control positivo:** cada test de sincronización falla con la conexión quitada; el de export falla si `exportExtensions` no conoce el atributo.
- **Mirar con lupa:** bucles de actualización (store → nodo → repo → store); dos ventanas con la misma nota; deshacer después de crear la tarea (no debe dejar tareas huérfanas duplicadas al rehacer); item anidado; offline (la tarea se crea optimista y el `taskId` existe antes del `setDoc`); que `/tasks` muestre la nota vinculada si ya hay UI para `noteIds` (si no hay, no se agrega en esta etapa).

## Verificación de la etapa

- `npm run verify` PASS en la rama tras cada tanda.
- `npm run e2e:ui` verde (3 viewports) al cierre.
- Recorrido en el emulador (`npm run dev:emu`) de las 4 mejoras en 375/768/1280, con el navegador MCP cerrado al terminar cada verificación (seguimiento de la Etapa 1).
- `Spec/ESTADO-ACTUAL.md` § Candidatos próximos: quitar "Code blocks con syntax highlighting" (ya existe), "Decodificar HTML entities en share intent" y "z-index del popover de PendingSyncIndicator" (resueltos/verificados en la Etapa 1), y los que esta etapa cierre ("Floating menu…" queda cubierto por T1, "Convertir en nota" por T3, "Task items → Tasks reales" por T4).

## Avance

_(una entrada por tanda, formato de `Spec/templates/SPEC-etapa.md`)_

### T1 — Pista de comandos en líneas vacías (e2-T1)

- **Qué se hizo:** `Placeholder` usa una función por nodo delegada a `resolvePlaceholderText` (`extensions/placeholder-text.ts`, pura): nota vacía → `editor.placeholder`; párrafo vacío de primer nivel con el cursor en nota con contenido → `editor.placeholderEmptyLine`; headings, código, tablas, listas, citas e items de tarea → `''`. CSS: `p.is-empty::before` solo con `.ProseMirror-focused`; el de nota vacía queda siempre visible. Claves es/en y `resources.d.ts` regenerado.
- **Commits:** `c794a4f` feat(editor): pista de comandos '/' en líneas vacías.
- **Verificación:** `vitest placeholder-text.test.ts`: 7/7 PASS. Control positivo por mutación: línea vacía devolviendo `''` (comportamiento anterior) → FAIL "párrafo vacío en nota con contenido"; sin guard de primer nivel → 3 FAIL (tabla, taskItem, lista/cita); sin guard `paragraph` → 2 FAIL (heading, codeBlock); archivo restaurado. `npm run verify`: PASS (lint, typecheck x3, unit, guard, agents, rules, functions, build).
- **Revisión:** APROBADA CON CORRECCIONES. MINOR: nota con solo párrafos vacíos (`[p, p]`, cursor en la 2ª) mostraba el texto de nota vacía en la línea 2 y nunca la pista "/". NIT: `resources.d.ts` sin formato. NIT: faltaba prueba de integración con un `Editor` real.
- **Correcciones:** (1) `resolvePlaceholderText` devuelve el texto de nota vacía solo si `pos === 0`; el resto cae en la regla de párrafo de primer nivel. Test unitario nuevo `[p, p]` segunda línea; control positivo: sin el arreglo FAIL (`expected 'DOC' to be 'LINE'`), con el arreglo PASS. (2) `prettier --write` a `resources.d.ts` (diff vs `e2-T0`: solo las claves reales; incluye 2 claves de export que el generador ya traía desactualizadas). (3) Test de integración `placeholder-integration.test.ts` con `Editor` real en jsdom (stubs de `elementFromPoint`, `Range.getClientRects/getBoundingClientRect`): nota vacía, `[p, p]`, línea tras contenido, celda de tabla y taskItem sin decoración, `getJSON()` sin rastro. Para compartir la config se extrajo `createPlaceholderExtension` a `extensions/placeholder-config.ts` (sin cambio de comportamiento; `NoteEditor` la usa). Control positivo de la integración: revirtiendo el fix, FAIL en `[p, p]` (más el unitario).
- **Verificación (post-correcciones):** `npm run verify` PASS (lint, typecheck x3, unit 503/503 en 76 archivos, guard, agents, rules, functions, build).
- **Pendientes:** verificación visual en emulador (375/768/1280) NO hecha: el MCP de Playwright no conectó en esta sesión; queda para el cierre de etapa (I7). Revisar mobile con teclado virtual y que la pista no aparezca en modo solo-lectura (`showOnlyWhenEditable` de la extensión lo cubre por defecto).

### T2 — Insertar enlace desde Notas similares (e2-T2)

- **Qué se hizo:** cada item de `SimilarNotesPanel` suma un botón `Link2` (`aria-label` y `title` = `editor.similar.insertLink`) que inserta un nodo `wikilink` normal con el `noteId`/`noteTitle` de la nota sugerida (I4). Si el id está en `outgoingLinkIds` (cell leída reactivamente con `useCell` + `parseIds`), el botón queda `disabled` con label/tooltip `editor.similar.alreadyLinked`. Sin editor listo, también deshabilitado. La navegación por click en el título se mantiene (el botón es hermano del `Link`, no anidado). `NoteEditor` expone la instancia vía `onEditorReady`; `NoteEditorContainer` la guarda en state y la pasa al panel. Lógica en `useInsertSimilarLink` (+ función pura `insertSimilarWikilink`). Claves es/en y `resources.d.ts` regenerado + prettier.
- **Commits:** ver `git log e2-T1..HEAD`.
- **Verificación:** `vitest SimilarNotesPanel.test.tsx`: 7/7 PASS (inserta con noteId/noteTitle correctos, al final sin foco previo, en el cursor con foco previo, deshabilitado si ya enlazada, reactivo a `outgoingLinkIds`, título sigue siendo link, sin editor deshabilitado). Control positivo por mutación: `isLinked = false` (sin la condición de `outgoingLinkIds`) -> 2 FAIL ("ya enlazada" y "reacciona"); `hasBeenFocused` forzado a false -> 1 FAIL (posición del cursor); restaurados. `npm run verify`: PASS (lint, typecheck x3, unit, guard, agents, rules, functions, build).
- **Pendientes:** verificación visual en emulador (375/768/1280) y comprobar que el wikilink insertado crea el backlink en la otra nota tras el guardado: NO hechas (MCP de Playwright no conectado); quedan para el cierre de etapa (I7). Foco del editor tras insertar y título vacío ("Sin título" lo resuelve `renderHTML` del wikilink) cubiertos solo por lectura de código.
- **Revisión:** APROBADA CON CORRECCIONES. MAJOR: la marca "tuvo foco" vivía en el panel (listener solo con `SimilarNotesPanel` montado, reseteada al montar) → en mobile (panel cerrado por defecto <1024px) insertaba al final aunque hubiera cursor. MAJOR: con el cursor en un bloque de código, la inserción partía el codeBlock. MINOR: "Ya enlazada" con `disabled` no recibía foco de teclado y el `title` no existe en touch. NIT: no deshabilitaba si el doc ya tenía el wikilink (antes del guardado debounced). NIT: área táctil ~28px.
- **Correcciones:** (1) Extensión `FocusTracking` (`extensions/focus-tracking.ts`) en `NoteEditor`: marca `editor.storage.focusTracking.hasBeenFocused` en `onFocus` (y en `onCreate` si nace enfocado); `useInsertSimilarLink` lee `hasEditorBeenFocused(editor)` y ya no tiene listener propio. Test: enfocar + cursor y recién después montar el panel → inserta en el cursor. (2) `insertSimilarWikilink` resuelve `selection.to`; si el padre es código (`type.spec.code`) o no admite `wikilink` (`canReplaceWith`), inserta un párrafo nuevo con el wikilink justo después de ese bloque (`$pos.after()`); a profundidad 0, al final (E2-T2-e). Test `[p, codeBlock]` con cursor en el código → el codeBlock queda intacto y el enlace va en el párrafo siguiente. (3) Botón con `aria-disabled="true"` en vez de `disabled`, click ignorado en el handler, enfocable; `title` y `aria-label` se mantienen; estilos `disabled:` → `aria-disabled:` (mismo aspecto). Test: enfocable y sin `disabled`, click no inserta. (4) `useEditorWikilinkIds(editor)` (escucha `update`, re-renderiza solo si cambia el conjunto de ids): un wikilink ya presente en el doc también marca "Ya enlazada". Test: insertar → el mismo botón pasa a "Ya enlazada" y un 2º click no duplica; si el enlace sale del doc, se rehabilita. (5) Área táctil 40x40 con `after:` absoluto (`-inset-y-1.5 -left-1 -right-2`), el botón visible sigue en 28px; a la izquierda solo se extiende 4px (= `gap-1`) para no tapar el link del título. No verificado visualmente (sin MCP de Playwright).
- **Control positivo (I6):** (1) y (2) con el hook original (`HEAD`) restaurado temporalmente: FAIL `expected 'hola mundo' to be 'hola'` y `expected [ 'cons' ] to deeply equal [ 'const x = 1;' ]`. (3) mutación agregando `disabled={isUnavailable}`: FAIL `expected true to be false`. (4) mutación quitando `docLinkedIds`: FAIL `Unable to find ... "Ya enlazada"`. Restaurados; con los arreglos 11/11 PASS. Los tests previos de "deshabilitado" pasan a mirar `aria-disabled`.
- **Verificación (post-correcciones):** `npm run verify` PASS (lint, typecheck x3, unit 514/514 en 77 archivos, guard, agents, rules, functions, build). El primer intento falló en lint (`react-hooks/set-state-in-effect` en `useEditorWikilinkIds`, pasó a `useSyncExternalStore` con cache por versión del doc) y typecheck (cast de `editor.storage`); corregidos antes de la corrida verde.
- **Seguimiento:** el guard bloquea `git stash push` por el patrón `git push` (falso positivo: `[git-push]`); no se rodeó con stash, el control (1)/(2) se hizo copiando el archivo de `HEAD`. Revisar el patrón del guard en otra tanda.

### T3 — Convertir una selección en nota (e2-T3)

- **Qué se hizo:** botón `FilePlus2` ("Convertir en nota") en el bubble menu, visible con selección de texto (o toda la nota) fuera de código/wikilink/celdas. Función pura `selectionToNoteDraft` (`extensions/selection-to-note.ts`): selección -> `{ title, contentJson, contentPlain }` (slice con padres para que un corte a la mitad sea válido, recorte de bordes vacíos, fallback a párrafos si el slice no forma un doc válido, texto en celda -> párrafo, título = primera línea con texto o, si no hay, el título del primer wikilink, máx. 80 caracteres sin partir emojis). `convertSelectionToNote` / `useConvertSelectionToNote`: crea la nota con `notesRepo.createNote({ title, contentPlain, content })` (override aditivo `content`, mismo camino que `createFromInbox`; `null` -> no toca la selección) y reemplaza el rango por un nodo `wikilink` en una sola transacción. Si el contenido movido trae wikilinks, sincroniza los links de la nota nueva (`syncLinksFromEditor` + `updateMeta`). Aviso efímero en el header del editor. Claves `editor.bubble.*` es/en, `resources.d.ts` regenerado + prettier.
- **Commits:** `85b1444` feat(notes) createNote con content; `d0e62ab` feat(editor) función pura; `affc2f4` feat(editor) botón + hook + aviso + textos.
- **Verificación:** `npm run verify` PASS (lint, typecheck x3, unit 538/538 en 79 archivos, guard, agents, rules, functions, build). Tests nuevos: `selection-to-note.test.ts` 13, `useConvertSelectionToNote.test.ts` 9 (Editor real en jsdom), 2 en `notesRepo.test.ts`.
- **Control positivo (I6), por mutación:** (1) sin recorte de título -> FAIL "recorta el título a 80 caracteres" y "no parte un emoji". (2) contenido solo texto plano (`docNode = null`) -> 6 FAIL (listas, marcas+wikilink, toda la nota, sync de links). (3) repo sin `content` -> FAIL "la nota nace con content". (4) sin el chequeo `null` de `createNote` -> FAIL "si la creación falla no toca la selección". (5) reemplazo en dos transacciones (`deleteRange` + `insertContentAt`) -> FAIL "una sola transacción" (`expected 2 to be 1`). Todo restaurado desde copia en scratchpad.
- **Pendientes:** verificación en emulador (nota nueva existe y abre con el texto, original con wikilink, backlink en la nueva, 375/768/1280, aviso visible) NO hecha: MCP de Playwright no conectado; queda para el cierre de etapa (I7). `autoTagNote` no se tocó (la nota nace con `aiProcessed: false` como cualquier createNote; verlo en emulador).

## Decisiones del juez (a ratificar)

- **E2-T1-a — Copy sin backticks.** Porqué: un placeholder es texto de atributo CSS (`content: attr(data-placeholder)`), no renderiza markdown; los backticks se verían literales. Queda "Escribe / para ver comandos" / "Type / for commands".
- **E2-T1-b — La pista de línea solo con el editor enfocado (CSS).** Porqué: Placeholder decora el nodo vacío bajo `selection.anchor` aunque el editor no tenga foco; el SPEC pide "párrafo vacío con el cursor". La nota vacía conserva visibilidad sin foco (comportamiento previo).
- **E2-T1-c — Sin `includeChildren`; solo párrafos de primer nivel.** Porqué: verificado en `buildPlaceholderDecorations` (v3.26.1) que con `showOnlyCurrent` y sin `includeChildren` solo se evalúa `resolved.node(1)`, así que celdas de tabla e items de tarea ya quedaban excluidos; la función además lo exige explícito (guard `parent === doc`) como defensa, y excluye headings.
- **E2-T2-a — La posición se decide por "el editor tuvo foco alguna vez" (evento `focus`), no por `isFocused`.** Porqué: al hacer click en el botón el editor ya perdió el foco, así que `isFocused` es siempre false en ese momento; ProseMirror conserva la selección y eso permite insertar donde estaba el cursor. Si nunca se enfocó (cursor en la posición inicial por defecto) va al final, como pide el SPEC. **Actualizada en la corrección:** la marca vive con el editor (extensión `FocusTracking`, `editor.storage.focusTracking.hasBeenFocused`, registrada en `NoteEditor`), no en el panel: el panel puede montarse después de que el usuario escribió (mobile, panel cerrado por defecto) y su listener no habría visto el foco.
- **E2-T2-b — Con selección no vacía se inserta tras el final de la selección, sin reemplazarla.** Porqué: `insertContent` con rango reemplaza el texto seleccionado; perder texto por tocar "Insertar enlace" es peor que un enlace pegado al final de la selección.
- **E2-T2-c — "Ya enlazada" se deriva solo de `outgoingLinkIds` (como pide el SPEC).** Porqué/limitación: esa cell se actualiza tras el guardado debounced, así que entre insertar y guardar el botón sigue habilitado y un segundo click inserta un duplicado (inofensivo: el link es por par origen/destino). No se agregó un segundo origen de verdad (escanear el doc) para no divergir del criterio firmado. **Reemplazada en la corrección (NIT de la revisión):** "Ya enlazada" = está en `outgoingLinkIds` **o** el doc del editor ya tiene un nodo `wikilink` a esa nota (`useEditorWikilinkIds`, reactivo al doc), así no hay duplicado antes del guardado.
- **E2-T2-e — Cursor en un bloque que no admite el wikilink (código): párrafo nuevo justo después de ese bloque.** Porqué: insertar dentro parte el codeBlock (ProseMirror lo cierra); ir al final del doc aleja el enlace del lugar donde el usuario estaba. Se decide con `parent.type.spec.code` o `!parent.canReplaceWith(...)`; si el cursor está a profundidad 0 (sin bloque padre), al final del doc. El cursor queda tras el enlace insertado.
- **E2-T2-d — `onEditorReady` + state en el contenedor (en vez de ref o contexto).** Porqué: el panel debe re-renderizar cuando el editor existe/cambia (remount por `key` al descartar error de guardado); un ref no dispara render y un contexto es sobredimensionado para un solo consumidor.
- **E2-T3-a — `source` = `''` y `noteType` = `'fleeting'` (defaults de `createNote`).** Porqué: en notas el único `source` existente es `'inbox'` (captura) y `''` por defecto; ninguno describe "nacida de una selección", y inventar un valor viola "no inventar enums". `fleeting` es el tipo por defecto y encaja con un fragmento recién atomizado.
- **E2-T3-b — Slice con padres (`doc.slice(from, to, true)`).** Porqué: sin padres, una selección dentro de un párrafo da solo texto inline (no forma un doc). Con padres, "dentro de una lista" conserva la lista (un item), y el corte a la mitad queda como bloques válidos. Excepciones: texto dentro de una celda -> párrafo (no una tabla de una celda); slice inválido -> párrafos por línea.
- **E2-T3-c — `contentPlain` se deriva con `getText` + serializers del schema (igual que `useNoteSave`) y se hace `trim()`.** Porqué: paridad con lo que guardará el editor después (el wikilink no aporta texto); `getText` antepone saltos cuando el primer bloque está anidado en una lista, el `trim` los quita.
- **E2-T3-d — Aviso inline en el header del editor, error con `editor.save.error`.** Porqué: el proyecto no tiene librería de toasts (solo feedback inline con estado + timer, p. ej. "Código copiado", badge "Guardado"). El bubble se oculta al reemplazar la selección, así que el aviso vive en `NoteEditor` (`role="status"`, 3 s). El error reusa "Error al guardar" para no inventar copy; ver Estacionadas.
- **E2-T3-e — Si el documento cambió durante la creación async, no se reemplaza.** Porqué: las posiciones dejan de ser confiables; se reemplaza solo si el rango sigue produciendo exactamente el mismo contenido. Si no, resultado `error` y la nota nueva queda creada (huérfana, sin enlace): se prefiere eso a corromper texto del usuario. Mismo trade-off con Ctrl+Z: restaura el texto, la nota creada permanece (el guardado normal quita el link).
- **E2-T3-f — Se sincronizan los links de la nota nueva si el contenido movido trae wikilinks.** Porqué: la nota nueva no se abre ni guarda hasta que el usuario entra, así que nadie crearía sus links/backlinks (I4) y la nota original ya perdió el suyo al reemplazar. Falla de ese sync solo se loguea (la conversión ya está hecha).
- **E2-T3-g — Botón solo con `TextSelection`/`AllSelection`; guard anti doble click (`isBusyRef`).** Porqué: una selección de nodo/celdas no es convertible; dos clicks durante el `await` crearían dos notas.

## Estacionadas para Sebastián

- **Copy de error de "Convertir en nota" (T3).** Hoy muestra "Error al guardar" (`editor.save.error`) si la creación falla. Opciones: (a) dejarlo; (b) copy propio, p. ej. "No se pudo crear la nota" / "Could not create the note". Y el aviso de éxito es texto inline junto al indicador de guardado, no un toast flotante (no existe sistema de toasts): confirmar si se prefiere un toast global en otra etapa.

## Pasos manuales de Sebastián

1. **Tareas en el celular.** Tras el release 0.6.1, en Android: crear una tarea desde una nota y completarla en `/tasks`.
   **Qué deberías ver:** el check aparece en la nota.

## Resumen de cierre

_(lo escribe el orquestador al cerrar la etapa)_
