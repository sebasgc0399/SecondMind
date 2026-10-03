# SPEC — Etapa 2: Editor productivo

> **Estado:** En curso (rama `feat/etapa2-editor`).
> **Origen / autorización:** Sebastián, 2026-10-03, eligió la opción 1 ("Editor productivo") de la propuesta de Etapa 2: _"y si tomare tu recomendacion"_ / _"Si procedamos"_. **Loop autorizado** (2026-10-03, cita textual): _"Apruebo el SPEC-71. Autorizado el loop para la Etapa 2, rama feat/etapa2-editor, commits y tags locales, sin push."_
> **Etiquetas:** locales `e2-T<n>`. **Nunca** `v*` (dispara `release.yml`). Sin push dentro de la etapa; al cerrar, el orquestador mergea a `main` con la aprobación de Sebastián (Docs/05 § 10).
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

## Decisiones del juez (a ratificar)

_(vacío)_

## Estacionadas para Sebastián

_(vacío)_

## Pasos manuales de Sebastián

1. **Tareas en el celular.** Tras el release 0.6.1, en Android: crear una tarea desde una nota y completarla en `/tasks`.
   **Qué deberías ver:** el check aparece en la nota.

## Resumen de cierre

_(lo escribe el orquestador al cerrar la etapa)_
