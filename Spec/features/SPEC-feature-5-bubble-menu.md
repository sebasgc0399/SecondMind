# SPEC — SecondMind · Feature 5: Bubble Menu + Link Extension (Registro de implementación)

> Estado: **Completada** — Abril 2026
> Alcance: Toolbar flotante al seleccionar texto en el editor TipTap con 6 formatos inline (Bold, Italic, Strike, Code, Highlight, Link), extensión de hyperlinks con UI de edición inline (crear, editar, desvincular, abrir), y polish de UX del editor en mobile/touch.
> Stack implementado: `@tiptap/react/menus` (BubbleMenu v3), `@floating-ui/dom` (direct dep + ya transitivo), StarterKit v3 `Link` + `underline: false`, state machine de 2 modos con branch de link-hover, `useEditorState` con selector de primitivos.
> Para gotchas operativos consolidados → `Spec/ESTADO-ACTUAL.md` sección "Bubble Menu + Link (Feature 5)".

---

## Objetivo

El editor tenía 5 marks inline (bold, italic, strike, code, highlight) accesibles solo vía shortcuts invisibles (`Ctrl+B`, `Ctrl+I`, `Ctrl+Shift+H`). En mobile no había forma alguna de formatear. Después de Feature 5: seleccionar texto muestra un toolbar flotante con los 6 formatos (los 5 previos + Link nuevo). Cada botón refleja estado activo y togglea con un tap. Los hyperlinks se crean, editan, desvinculan y abren desde el mismo bubble. Funciona bien en mobile 375, y convive con la selection toolbar nativa de iOS.

---

## Prerrequisitos descubiertos

- **StarterKit v3.22.3 ya incluye `Link` por default** (confirmado en `node_modules/@tiptap/starter-kit/dist/index.d.ts:10` y `:97` — declara `link: Partial<LinkOptions> | false`). El SPEC original decía "instalar `@tiptap/extension-link`". Desvío correcto: configurar vía `StarterKit.configure({ link: {...} })`. Cero deps extra.
- **StarterKit v3 también incluye `Underline` por default + shortcut `Ctrl+U`** activo. Para preservar el principio del SPEC D3 ("en web underline se confunde con links"), se deshabilitó explícitamente con `underline: false`. Sin esto, el user podía activar underline por accidente con `Ctrl+U` y luego no tener cómo quitarlo sin saber el shortcut (no había UI).
- **`@floating-ui/dom@1.7.6` ya estaba transitivamente instalado** vía `@base-ui/react 1.3.0 → @floating-ui/react-dom 2.1.8 → @floating-ui/dom 1.7.6`. TipTap v3 BubbleMenu pide `^1.6.0`. Se agregó como direct dep igual (`^1.7.6`) para contrato explícito — 0KB extra, previene desaparición silenciosa si `@base-ui/react` migra en el futuro.
- **API de `options` de BubbleMenu v3 NO acepta `middleware` como key.** El tipo expone los middlewares de Floating UI como propiedades individuales (`offset`, `flip`, `shift`, `arrow`, `size`, `autoPlacement`, `hide`, `inline`), cada una con `Parameters<typeof X>[0] | boolean`. El plan inicial pretendía pasar `middleware: [offset(8), flip(), shift({ padding: 8 })]` — el compiler rechazó. Corregido a `{ placement: 'top', offset: 8, flip: true, shift: { padding: 8 } }`. Identificado en el primer build del commit 2.
- **Wikilink es Node atomic, no mark.** `editor.isActive('wikilink')` en `shouldShow` sigue siendo la forma práctica de filtrar. ProseMirror skippea marks en atoms automáticamente. Simplificación pragmática documentada.
- **El BubbleMenu v3 NO aplica `data-starting-style` / `data-ending-style` automáticamente.** El componente solo muestra u oculta. Animar requeriría Framer Motion o transitions CSS con mount delays — decisión: no animar. Notion tampoco anima. Aparición instantánea es UX aceptable.
- **`shouldShow` inline en el JSX remonta el BubbleMenu en cada render.** Definir la función a **module-level** (fuera del componente) da referencia estable sin necesidad de `useCallback([])`. Más limpio y sin overhead.
- **iOS Safari selection toolbar coexiste con BubbleMenu.** Conocido, sin workaround confiable. El bubble aparece encima de la selección (`placement: 'top'`); iOS toolbar flota fija. Documentado como known limitation.

---

## Features implementadas

### F1: StarterKit config — link enabled + underline disabled (commit `cab57ff`)

- `src/components/editor/NoteEditor.tsx`: reemplazar `StarterKit` pelado por `StarterKit.configure({ link: {...}, underline: false })` con opciones:
  - `openOnClick: false` — crítico: sin esto cada click en link navega y rompe edición inline.
  - `autolink: true` — detecta URLs al escribir + espacio.
  - `linkOnPaste: true` — pegar URL sobre selección aplica link al texto.
  - `defaultProtocol: 'https'` — prefija HTTPS si el usuario escribe `notion.so` sin protocolo.
  - `HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer', class: 'editor-link' }` — abre en nueva pestaña + hook de styling.
  - `underline: false` — mata la extensión Underline que StarterKit v3 carga por default.
- `src/index.css`: regla nueva `.note-editor .ProseMirror a.editor-link` cerca del bloque wikilink:
  - `color: var(--primary)`, `text-decoration: underline` con `text-decoration-color: color-mix(in oklch, var(--primary) 40%, transparent)`.
  - `text-underline-offset: 2px` y transición en `text-decoration-color` a `80%` al hover.
- Verificación: `Ctrl+U` no togglea nada, pegar URL crea link automático.

### F2: BubbleToolbar con 5 botones de formato (commit `4538ab8`)

- `package.json`: `+ @floating-ui/dom: ^1.7.6` como direct dep. Instalado con `--legacy-peer-deps` (consistente con el resto de instalaciones del proyecto por Vite 8).
- `src/components/editor/menus/BubbleToolbar.tsx` nuevo:
  - `import { BubbleMenu } from '@tiptap/react/menus'` (path v3 — `@tiptap/react` es v2 legacy).
  - `useEditorState` con selector que retorna **solo primitivos** (`isBold`, `isItalic`, `isStrike`, `isCode`, `isHighlight` — todos `boolean`) → TipTap hace shallow compare sin re-renders innecesarios.
  - `shouldShow` definido **module-level** (fuera del componente): bloquea si editor no es editable, si la selección está vacía (F2), si cursor en code block o sobre wikilink.
  - `<BubbleMenu editor pluginKey="bubbleToolbar" shouldShow options={{ placement: 'top', offset: 8, flip: true, shift: { padding: 8 } }}>`.
  - 5 botones envueltos en `<ToolbarButton active onClick label>` con iconos de Lucide (`Bold`, `Italic`, `Strikethrough`, `Code`, `Highlighter`). Botón activo: `bg-accent text-accent-foreground`. Inactivo: `text-foreground hover:bg-accent/60`. Tap target 44×44 (`h-11 w-11`) + icono `h-4 w-4` consistente con convención del proyecto.
  - Separador visual entre los 4 de formato y el Highlight: `<span aria-hidden className="mx-0.5 h-5 w-px bg-border" />`.
  - Wrapper del toolbar: `rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl` — mismos tokens que WikilinkMenu/SlashMenu.
- `src/components/editor/NoteEditor.tsx`: `<BubbleToolbar editor={editor} />` montado al mismo nivel que `<WikilinkMenu />` y `<SlashMenu />`.

### F3: Link en el bubble + LinkInput + link-hover view (commit `5bf3acf`)

- `src/components/editor/menus/LinkInput.tsx` nuevo:
  - Props: `{ initialUrl?: string; onConfirm: (url) => void; onCancel: () => void; onUnlink?: () => void }`.
  - `useEffect` foca + selecciona el input al mount (para edit pre-llenado).
  - `handleKeyDown` con `e.preventDefault() + e.stopPropagation()` en `Enter` y `Escape` — **crítico**: sin stopPropagation el keydown burbujea al editor (deshace selección, dispara shortcuts).
  - `normalizeUrl(raw)`: trim + si ya empieza con `https?://` o `mailto:` devuelve tal cual; si no, prefija `https://`. Vacío devuelve `''` (para desvincular).
  - UI: input `h-11 min-w-56` + botones `h-11 w-11` (Confirmar, Desvincular opcional, Cancelar). Mismo popup styling que el BubbleToolbar.
- `src/components/editor/menus/BubbleToolbar.tsx` extendido:
  - `useState<'default' | 'link-edit'>('default')` para el modo del toolbar.
  - Selector de `useEditorState` agrega `isLink`, `linkHref`, `selectionEmpty`.
  - `shouldShow` module-level actualizado: mostrar el bubble también cuando `selection.empty && editor.isActive('link')` (cursor sobre link sin selección).
  - `useEffect` que resetea `mode` a `'default'` cuando ya no hay link ni selección activa (evita quedar trabado en `link-edit` tras `unsetLink`).
  - Handlers:
    - `applyLink(href)`: `editor.chain().focus().extendMarkRange('link').setLink({ href }).run()` (si vacío → `unsetLink`). `extendMarkRange` es crítico para que `setLink` aplique a todo el rango del link cuando se edita sin selección.
    - `unlinkCurrent()`: mismo chain con `unsetLink`.
    - `openLink(href)`: `window.open(href, '_blank', 'noopener,noreferrer')`.
  - Branch render de 3 caminos:
    - `mode === 'link-edit'` → `<LinkInput>` pre-llenado con `linkHref`.
    - `selection.empty && isLink && mode === 'default'` → `<LinkHoverView>` (URL truncada + Abrir + Editar + Desvincular).
    - default → 6 botones (5 de formato + Link como 6°).
  - `<LinkHoverView>` interno: `<span title={href}>` truncado (`max-w-56 truncate`) + 3 botones con iconos `ExternalLink`, `Pencil`, `Unlink`. `truncateHref(href, 32)` strippea `https?://` y recorta con ellipsis.

---

## Desviaciones documentadas sobre el SPEC original

| Sección SPEC                   | Original                                                 | Final                                                                                                             |
| ------------------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **F2 dependencia**             | "Instalar `@tiptap/extension-link`"                      | Configurado vía `StarterKit.configure({ link: {...} })`; ya incluido en v3                                        |
| **F1 dependencia**             | `+ @floating-ui/dom@^1.6.0`                              | `+ @floating-ui/dom@^1.7.6` (direct dep, ya transitivo)                                                           |
| **F1 options API**             | `middleware: [offset(8), flip(), shift({ padding: 8 })]` | `{ offset: 8, flip: true, shift: { padding: 8 } }` — v3 expone middlewares como keys individuales                 |
| **D3 Underline**               | "No incluir, evita dep `@tiptap/extension-underline`"    | `underline: false` en StarterKit — ya viene por default                                                           |
| **F1 animación**               | "`opacity + scale + transition` en wrapper"              | Sin animación — BubbleMenu v3 no aplica data-starting-style automáticamente                                       |
| **F2 estados**                 | 3 estados (default, link-input, link-hover)              | 2 estados locales (`default`, `link-edit`) + branch de render en default si `selection.empty && isActive('link')` |
| **F2 mini-toolbar link-hover** | "URL + Editar + Desvincular"                             | + botón **Abrir** con `window.open(..., '_blank', 'noopener,noreferrer')`                                         |
| **Tap targets**                | "≥44×44 en mobile"                                       | 44×44 en **todos los breakpoints** — consistente con convención (TaskCard, HabitRow, DistillIndicator)            |

---

## Decisiones clave

1. **Link y Underline ya vienen en StarterKit v3** → configurar, no instalar. Verificado en `node_modules/@tiptap/starter-kit/dist/index.d.ts`.
2. **`@floating-ui/dom` como direct dep** aunque sea transitivo — contrato explícito y previene desaparición silenciosa.
3. **Tap targets 44×44 en todos los breakpoints**. Mantener una sola convención es más simple que rama mobile vs desktop.
4. **Sin animación de entrada/salida.** Notion tampoco anima su bubble. Menos complejidad.
5. **2 estados locales** (`default` | `link-edit`), link-hover es branch del render en default — más simple que 3 estados.
6. **Botón Abrir** en mini-toolbar de link-hover — complementa `openOnClick: false`.
7. **`useEditorState` con selector de primitivos** (no objects anidados) — TipTap hace shallow compare.
8. **`shouldShow` module-level** — referencia estable sin overhead de `useCallback`.
9. **`extendMarkRange('link')`** antes de cualquier `setLink`/`unsetLink` cuando el cursor está sobre link sin selección.
10. **`e.stopPropagation()` + `e.preventDefault()` en Enter/Escape** dentro de LinkInput — evita que el keydown burbujee al editor o al BubbleMenu.

---

## Verificación E2E

Ejecutada en `npm run dev` contra nota real del UID `gYPP7NIo5JanxIbPqMe6nC3SQfE3` (Firebase `secondmindv1`). Casos:

| #   | Caso                                                             | Resultado                                                                                                              |
| --- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1   | Seleccionar texto → bubble con 6 botones                         | ✅ Botones B/I/S/Code/Highlight/Link visibles; Bold activo refleja `aria-pressed="true"` cuando el texto ya tiene bold |
| 2   | Click Link → LinkInput pre-vacío con focus                       | ✅ Input type=url, placeholder `https://...`, autoFocus                                                                |
| 3   | Escribir `notion.so` + Enter → link aplicado                     | ✅ `<a class="editor-link" href="https://notion.so">` wrappea el texto seleccionado; bubble vuelve a default           |
| 4   | Cursor dentro del link (sin selección) → mini-toolbar link-hover | ✅ Muestra `notion.so` truncado + Abrir + Editar + Desvincular; botones de formato ocultos                             |
| 5   | Click Desvincular                                                | ✅ Mark `link` removido, texto vuelve a normal                                                                         |
| 6   | Pegar `https://example.com ` con cursor al final de párrafo      | ✅ Autolink detecta y aplica `<a.editor-link href="https://example.com">`                                              |
| 7   | `Ctrl+U` sobre texto seleccionado                                | ✅ No aplica underline (`htmlChanged: false`); underline extension disabled                                            |
| 8   | Viewport 375×812: bubble cabe sin desborde                       | ✅ bubble 291×54px, `left:8 right:299`, dentro del viewport. `shift({ padding: 8 })` activo                            |
| 9   | Build verde                                                      | ✅ `tsc -b && vite build` exit 0                                                                                       |
| 10  | Cursor sobre wikilink / code block                               | ✅ `shouldShow` bloquea con `editor.isActive('wikilink')` / `editor.isActive('codeBlock')`                             |

---

## Archivos tocados

| Archivo                                         | Tipo       | Commit               |
| ----------------------------------------------- | ---------- | -------------------- |
| `package.json` + `package-lock.json`            | Modificado | `4538ab8`            |
| `src/components/editor/NoteEditor.tsx`          | Modificado | `cab57ff`, `4538ab8` |
| `src/components/editor/menus/BubbleToolbar.tsx` | Nuevo      | `4538ab8`, `5bf3acf` |
| `src/components/editor/menus/LinkInput.tsx`     | Nuevo      | `5bf3acf`            |
| `src/index.css`                                 | Modificado | `cab57ff`            |

---

## Siguientes iteraciones candidatas

- **AI-suggested highlights** — usar embeddings o tool use para sugerir qué resaltar (cuidado: el valor cognitivo de highlighting manual es la destilación forzada).
- **Floating menu al inicio de línea vacía** — complementa el bubble menu con la misma affordance visual para los slash commands.
- **Botón "Convertir en nota" dentro del bubble menu** cuando hay selección — atomización Zettelkasten directa desde el flujo de lectura.
- **Bubble menu contextual para imágenes** cuando se agregue soporte — `shouldShow` por node type permitiría resize/caption/alignment.
- **Drag handle para reordenar bloques** — `@tiptap/extension-drag-handle-react` para listas ordenadas y headings.
