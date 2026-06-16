# SPEC — Feature 60: Tablas en las notas (editor TipTap)

> Estado: **Propuesto** (en revisión de Sebastián). Rama: `feat/tablas-notas` (worktree aislado `SecondMind-tablas`).
> Alcance decidido: **Completo** (insertar + editar + resize + gestión filas/columnas + merge/split + header toggle + alineación) y **editable en todas las plataformas** (web/Tauri/Android, incluido touch).
> 100% cliente. Sin Cloud Functions / rules / indexes. Sin bump de `TINYBASE_SCHEMA_VERSION` (las tablas viven en el `content` JSON de Firestore, no en una Row de TinyBase).

## Objetivo

Permitir insertar y editar **tablas** dentro de las notas del editor TipTap, con gestión completa de estructura (filas, columnas, merge/split, header, alineación) y soporte de edición en las tres plataformas del ecosistema. Single-concern: tablas como nuevo tipo de bloque del editor; reusa el patrón de inserción del slash menu existente y no toca la capa de persistencia/search/embeddings (que ya operan sobre `contentPlain`).

## Contexto técnico (de la investigación pre-SPEC)

- **TipTap v3.26.1.** El paquete de tablas en v3 es **`@tiptap/extension-table`** (uno solo), que exporta **`TableKit`** — un kit que agrupa `Table` + `TableRow` + `TableHeader` + `TableCell` (igual que `StarterKit`). `@tiptap/pm` ya está instalado. NO son paquetes separados como en v2.
- **Editor:** instancia única en [src/components/editor/NoteEditor.tsx](src/components/editor/NoteEditor.tsx) (extensiones líneas 48-71). `StarterKit` v3 ya incluye `Gapcursor` y `Dropcursor` (necesarios para posicionar el cursor antes/después de una tabla) — **verificar, no re-agregar**.
- **Inserción:** patrón data-driven en [src/components/editor/menus/slashMenuItems.ts](src/components/editor/menus/slashMenuItems.ts) — shape `SlashMenuItem` (`id`, `label`, `description`, `icon`, `category`, `keywords?`, `action: (editor, ctx) => void`). Categorías en `CATEGORY_ORDER`: `text | lists | blocks | mentions | templates`.
- **Menú flotante sobre selección:** [src/components/editor/menus/BubbleToolbar.tsx](src/components/editor/menus/BubbleToolbar.tsx) usa `BubbleMenu` de `@tiptap/react/menus` con `shouldShow`. Es el patrón a reusar para el menú de gestión de tabla.
- **Persistencia (sin cambios):** el doc TipTap JSON va directo a Firestore como `content` string vía `notesRepo.saveContent` ([src/hooks/useNoteSave.ts](src/hooks/useNoteSave.ts):118-148). Las tablas se serializan solas.
- **Search/embeddings (sin cambios):** indexan `contentPlain` (`editor.getText()`), que ya incluye el texto de las celdas. Orama schema en [src/lib/orama.ts](src/lib/orama.ts) no se toca.
- **Links:** [src/lib/editor/extractLinks.ts](src/lib/editor/extractLinks.ts) camina el JSON buscando nodos `wikilink` — **verificar** que el walker recorre nodos de tabla (celdas) si se permiten `@wikilinks` dentro de celdas.
- **CSS obligatorio (gotcha clásico ProseMirror):** sin estilos para `table/td/th/.selectedCell/.column-resize-handle/.tableWrapper`, la tabla se ve rota y el resize es invisible. Va en [src/index.css](src/index.css), themed con las CSS variables de shadcn.

## Sub-features (orden de implementación: núcleo → cortable)

### F1 — Inserción + persistencia + estilos (núcleo usable)

- **Qué:** instalar `@tiptap/extension-table`; registrar `TableKit.configure({ table: { resizable: true } })` en `NoteEditor.tsx`; agregar item "Insertar tabla" en `slashMenuItems.ts` (categoría `blocks`, icono `Table` de lucide-react, `action: (editor) => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()`); keys i18n `editor.slash.items.table.{label,description}` (es/en) + regen de tipos i18n; CSS themed completo de tablas en `src/index.css` (bordes `border-border`, header `bg-muted`, `.selectedCell` con `primary/accent`, `.column-resize-handle` con `primary`, `.tableWrapper` con `overflow-x-auto` para mobile), light + dark. Verificar `Gapcursor` y el walker de `extractLinks`.
- **Criterio de done:** insertar tabla 3×3 con header desde `/`; editar celdas; resize de columnas (desktop, arrastrando el borde); persiste a Firestore y reabre intacta; `getText()` incluye el texto de las celdas (search lo encuentra); se ve coherente en light/dark; scroll horizontal en viewport angosto sin romper layout.
- **Archivos:** `package.json` (+ lock), `src/components/editor/NoteEditor.tsx`, `src/components/editor/menus/slashMenuItems.ts`, `src/index.css`, `src/locales/{es,en}/translation.json`, `src/types/resources.d.ts`.

### F2 — Menú de gestión de tabla (filas / columnas / borrar)

- **Qué:** menú flotante contextual visible cuando el cursor está dentro de una tabla (`editor.isActive('table')`), con acciones: agregar fila arriba/abajo (`addRowBefore/After`), borrar fila (`deleteRow`), agregar columna izq/der (`addColumnBefore/After`), borrar columna (`deleteColumn`), borrar tabla (`deleteTable`). Patrón: `BubbleMenu` con `shouldShow` (calca `BubbleToolbar.tsx`), o un componente nuevo `TableToolbar.tsx`. Iconos lucide. i18n.
- **Criterio de done:** todas las operaciones disponibles desde UI descubrible en desktop; el menú aparece/desaparece según contexto; no colisiona con el `BubbleToolbar` de formato de texto.
- **Archivos:** `src/components/editor/menus/TableToolbar.tsx` (nuevo), `src/components/editor/NoteEditor.tsx` (montar), `src/locales/{es,en}/translation.json`, `src/types/resources.d.ts`.

### F3 — Header toggle + alineación de celdas

- **Qué:** en el menú de F2, toggle de header row/column (`toggleHeaderRow`, `toggleHeaderColumn`) y alineación de texto de celdas (left/center/right). **Decisión abierta D3** sobre el mecanismo de alineación (ver Decisiones). i18n.
- **Criterio de done:** toggle header funciona en ambos sentidos; alineación aplica al contenido de la celda activa o la selección de celdas y persiste.
- **Archivos:** `src/components/editor/menus/TableToolbar.tsx`, posiblemente `package.json` (`@tiptap/extension-text-align` si se elige esa vía), `src/components/editor/NoteEditor.tsx`, locales + tipos.

### F4 — Merge / split de celdas (cortable)

- **Qué:** en el menú de F2, merge (`mergeCells`), split (`splitCell`) y toggle (`mergeOrSplit`) sobre selección de celdas. Es la pieza más propensa a bugs (estados inválidos, undo/redo). i18n.
- **Criterio de done:** merge de 2+ celdas seleccionadas; split de una celda merged; undo/redo coherente; persiste y reabre.
- **Archivos:** `src/components/editor/menus/TableToolbar.tsx`, locales + tipos.

### F5 — Touch / mobile (Android) (cortable)

- **Qué:** edición y gestión por touch en Android: resize de columnas por touch, accesibilidad del menú de gestión por touch (el `BubbleMenu` puede requerir ajustes de posicionamiento/tap), y QA en device real (Android APK + Tauri desktop). Ajustar `overflow-x` y la ergonomía táctil del menú.
- **Criterio de done:** insertar/editar/gestionar tablas funciona por touch en Android; resize táctil usable; smoke en device (Android + Tauri) verde.
- **Archivos:** `src/index.css` (ajustes táctiles), `src/components/editor/menus/TableToolbar.tsx` (ergonomía touch), `NoteEditor.tsx` si hace falta.

### F6 — Cierre (SDD step 8)

- **Qué:** escalar gotchas nuevos (CSS ProseMirror obligatorio, comportamiento de `getText` con celdas, lo que aparezca de merge/split o touch) a `Spec/gotchas/editor-tiptap.md`; actualizar `ESTADO-ACTUAL.md` (línea F60 + índices); convertir este SPEC a registro de implementación.

## Decisiones clave

| #      | Decisión                                                                                                                                                                                                                                                                                                                             | Estado                |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| **D1** | **`TableKit` (no extensiones sueltas)** con `table.resizable: true`. Consistente con cómo el proyecto usa `StarterKit`.                                                                                                                                                                                                              | Propuesta             |
| **D2** | **Menú de gestión = `BubbleMenu` contextual** (`shouldShow: isActive('table')`), reusando el patrón de `BubbleToolbar`, en vez de un toolbar fijo. Descubrible y no roba espacio.                                                                                                                                                    | Propuesta             |
| **D3** | **Alineación de celdas (F3):** opción A = `@tiptap/extension-text-align` aplicado a `paragraph`/`heading` (simple, pero la alineación queda disponible **globalmente**, no solo en tablas); opción B = restringir a contenido de celda (más complejo). **Recomiendo A** salvo que se quiera evitar alinear párrafos fuera de tablas. | **Abierta — decidir** |
| **D4** | **¿Wikilinks dentro de celdas?** Si sí, verificar/ajustar `extractLinks.ts` para recorrer nodos de tabla. **Recomiendo permitirlo** (consistencia) y cubrir el walker en F1.                                                                                                                                                         | **Abierta — decidir** |
| **D5** | **F4 (merge/split) y F5 (touch) son cortables** sin dejar la feature a medias: F1-F3 ya entregan una tabla plenamente usable en desktop. Si el costo/riesgo de merge/split o touch escala, se difieren a una feature posterior.                                                                                                      | Propuesta             |
| **D6** | **Sin bump de schema** TinyBase ni de preferences. Confirmado en la investigación.                                                                                                                                                                                                                                                   | Cerrada (técnica)     |

## Pre-requisitos / gotchas a vigilar

- **`resolve.dedupe` tras `npm install`** (CLAUDE.md): instalar `@tiptap/extension-table` mueve el lockfile → al levantar el dev server del worktree, verificar que no reaparece `Firebase: Component auth has not been registered yet` / `Invalid hook call`. Si pasa, revisar `vite.config.ts` dedupe.
- **Worktree aislado:** `node_modules` propio (no junction, lockfile diverge). Limpieza segura al cerrar (skill `git-worktrees`): `remove-worktree.ps1`.
- **QA contra prod** bajo el protocolo del CLAUDE.md step 5 (anunciar, revertir + verificar server-side, hard-delete notas de prueba). Emulador preferido donde alcance.

## Verificación (gate de cierre)

- `npm run lint` (completo) + `npx tsc -b` + `npm test`.
- Smoke web E2E (Playwright): insertar tabla, editar, resize, gestión (add/del row/col), merge/split, header, alineación; persistencia (reabrir nota); search encuentra texto de celda. Cleanup server-side verificado.
- Smoke nativo: Tauri (desktop) + Android (APK) — edición y touch.

## Checklist

- [ ] F1 — inserción + persistencia + estilos
- [ ] F2 — menú de gestión (filas/columnas/borrar)
- [ ] F3 — header toggle + alineación
- [ ] F4 — merge/split (cortable)
- [ ] F5 — touch/mobile Android (cortable)
- [ ] F6 — cierre SDD step 8
