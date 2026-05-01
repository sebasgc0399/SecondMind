# Editor (TipTap)

> Canon de gotchas del dominio. Índice ligero en `../ESTADO-ACTUAL.md` § "Gotchas por dominio (índice)".
> Cada gotcha vive como `## <título>`. El slug del título es el anchor estable referenciado desde el índice.

## TipTap WikiLinks son Nodes, no Marks

Attrs `{ noteId, noteTitle }`, renderizado inline. Ver extensión en [`components/editor/extensions/wikilink.ts`](../../src/components/editor/extensions/wikilink.ts).

## `extractLinks()` se ejecuta en cada save

Parseando el doc TipTap JSON y sincronizando la colección `links/` con los wikilinks encontrados.

## Auto-save debounce 2s

`AUTOSAVE_DEBOUNCE_MS = 2000`. Hook `useNoteSave` es el único writer del doc de nota: maneja editor + textarea del `summaryL3` con un solo timer compartido. Un `updateDoc` atómico por disparo. Cualquier campo futuro persistible por-save debe extender este hook, no crear uno paralelo.

## Múltiples `@tiptap/suggestion` plugins necesitan `pluginKey` explícito

Default todos usan `suggestion$` → `RangeError: Adding different instances of a keyed plugin` al montar el segundo. Fix: `pluginKey: new PluginKey('nombre-único')`. F2 tiene `wikilink-suggestion` y `slash-command-suggestion`.

## `@` trigger con `allow()` blacklist alfanumérica

No whitelist. `allow: ({ state, range }) => !/[a-zA-Z0-9]/.test(state.doc.textBetween(range.from - 1, range.from))`. Bloquea `user@domain.com` sin enumerar chars permitidos.

## Popups del editor encapsulados en `useEditorPopup<TItem>` (post-F17)

Cualquier popup del editor — los actuales `slash` y `wikilink`, y futuros tags `#`/autocompletes — consume [src/components/editor/hooks/useEditorPopup.ts](../../src/components/editor/hooks/useEditorPopup.ts) — recibe `setListener` (de `*-suggestion.ts`), `queryItems`, `executeCommand`, y devuelve state listo para renderizar (`isOpen`, `items`, `selectedIndex`, `position`, `menuRef`, `selectItem`, etc.). Encapsula listener pattern (`activeListener` module-level + `setXMenuListener` se preservan en cada `*-suggestion.ts`), positioning Floating UI, close-on-scroll, keyboard nav, lifecycle. **Tipo único `PopupListener<TItem>`** exportado desde el hook; no crear interfaces específicas por popup. La regresión a popup manual con `inline style` y snapshot rect es un anti-patrón.

## Scroll listener tras char trigger requiere defer 1 task tick

ProseMirror invoca `scrollIntoView()` sincrónicamente al insertar el char trigger de un Suggestion (`/`, `@`, etc.) para mantener el cursor visible. Si el handler de close-on-scroll se registra en el mismo tick que el `onStart` del listener, atrapa ese scroll programático y cierra el popup antes de que el user lo vea. Fix consolidado en `useEditorPopup`: `setTimeout(() => document.addEventListener('scroll', ..., { capture: true, passive: true }), 0)`. Aplicable a cualquier futuro popup que abra tras char trigger.

## `scroll` events no burbujean

`document.addEventListener('scroll', ..., { capture: true })` es la única forma estándar de atrapar scrolls de cualquier descendant scrollable, incluso cuando el viewport scroll viene de un `<main>` interno con `overflow: auto` (este shell tiene exactamente ese layout — `<body>` no scrollea). Validado E2E mobile 375 desde el `<main scrollable>` — el fallback `getOverflowAncestors` de `@floating-ui/dom` que se planeaba como Plan B no fue necesario.

## Slash menu items con `keywords?: string[]`

Para abreviaciones (`/h1`, `/ul`, `/hr`). Filter contra `[label, id, ...keywords].join(' ').toLowerCase()`.

## Slash menu NO sirve para inline marks (highlight/link)

Slash commands disparan sin selección → `toggleHighlight` no-op. Block-level OK. Único entrypoint a inline marks: shortcut + bubble menu.

## Templates como `JSONContent[]`, no HTML/Markdown

Array de nodos ProseMirror que `insertContent()` aplica directamente. `updateNoteType(noteId, type)` lee `auth.currentUser?.uid` en runtime (no freeze en config) para tolerar logout/login mid-sesión.

## StarterKit v3 incluye Link, Underline y ListKeymap por default

Configurar Link vía `StarterKit.configure({ link: {...}, underline: false })`. NO instalar `@tiptap/extension-link` por separado. Verificado en `node_modules/@tiptap/starter-kit/dist/index.d.ts:10,97`.

## `@tiptap/react/menus` es el import v3 correcto

No `@tiptap/react` legacy. `BubbleMenu` y `FloatingMenu` viven ahí. `options` expone middlewares de Floating UI como **keys individuales** (`offset`, `flip`, `shift`, `arrow`, `size`, `autoPlacement`, `hide`, `inline`) — pasar `middleware: [...]` falla con TS2353.

## `useEditorState` obligatorio para reactividad de `isActive()` en React

Sin el hook, `editor.isActive('bold')` queda congelado en el valor del primer render. **Retornar solo primitivos** (booleans, strings) en el selector — objects anidados causan re-renders en cada keystroke.

## `shouldShow` de BubbleMenu definido module-level

Fuera del componente. Referencia estable sin overhead de `useCallback`. Inline remonta el BubbleMenu en cada render y pierde el plugin de ProseMirror.

## `extendMarkRange('link')` antes de `setLink`/`unsetLink`

Cuando el cursor está sobre un link sin selección activa. Sin `extendMarkRange`, aplica solo al rango del cursor (1 char).

## `e.preventDefault() + e.stopPropagation()` en Enter/Escape dentro de inputs en floating menus

Sin `stopPropagation`, el keydown burbujea al editor. Patrón en `LinkInput.tsx`, reusar para cualquier input dentro de BubbleMenu/FloatingMenu.

## Node ProseMirror `atom: true` + `contenteditable="false"` NO emite textContent en DOM

El wikilink aparece solo en `editor.getText()` (TipTap serializa), no en `document.querySelector('.ProseMirror').textContent`. Afecta tests E2E.

## Pill `.wikilink::before { content: '@' }` no se copia al clipboard

Chrome/Firefox excluyen pseudo-elementos. Al pegar una mención afuera sale solo el título.

## `SlashCommand.configure({ noteId })` y `Wikilink.configure({ noteId })` dependen de remount por nota

`noteId` capturado en closure del Suggestion. Funciona porque `[noteId]/page.tsx` pasa `key={noteId}` al `<NoteEditor>`. Si alguien comparte el editor entre notas sin remount: las Templates Actions escribirían al `noteId` viejo y el popup wikilink mostraría la nota anterior como candidato self-link.

## Textarea auto-resize: `el.style.height = '0px'` antes de `scrollHeight`

No usar `'auto'` — iOS Safari devuelve valores pequeños tras deletes.

## Progressive Summarization: `computeDistillLevel(doc, summaryL3)` usa walk recursivo

Orama schema + `NoteOramaDoc` extended con `distillLevel` para badge en NoteCard (L0 oculto, L1 azul, L2 amarillo, L3 verde).

## BubbleMenu v3 NO anima entrada/salida automáticamente

No aplica `data-starting-style` / `data-ending-style` como base-ui. Decisión F5: no animar (Notion tampoco).

## iOS Safari selection toolbar coexiste con BubbleMenu

Known limitation sin workaround confiable. _No re-verificado tras TipTap v3 + iOS 17/18 — confirmar en próximo test mobile real; si ya no se reproduce, eliminar._

## Paste sin `transformPastedHTML` preserva atributos HTML del nodo aunque el schema filtre marks

El schema ProseMirror descarta marks no registrados (FontSize, TextStyle, Color) al reconstruir el documento, pero `<p style="font-size: 32px">` entra como atributo del paragraph y gana por CSS specificity sobre el estilo del editor. Cualquier extensión nueva que permita paste necesita sanitizar HTML a nivel string antes de que el schema lo procese. Hook canónico: `editorProps.transformPastedHTML` en el `useEditor()` con regex defensivo `/\s(style|class)=["'][^"']*["']/gi` (cubre comillas simples y dobles). Vive en [NoteEditor.tsx:62-64](../../src/components/editor/NoteEditor.tsx#L62-L64). `linkOnPaste` sigue funcionando porque opera sobre el texto post-strip.

## Menús anchored en cursor position usan `@floating-ui/dom` con virtual element + `autoUpdate` (post-F14)

El virtual element solo requiere `getBoundingClientRect: () => DOMRect` — perfecto para `SuggestionProps.clientRect` de TipTap que devuelve coords del cursor. `autoUpdate` instala `ResizeObserver` + `IntersectionObserver` + scroll ancestors listeners con un único handle de cleanup → re-posiciona en scroll/resize sin código extra. Crítico: **guardar la función `clientRect`, NO un snapshot `DOMRect`**. Snapshot queda stale al scrollear con el menú abierto; función invocada desde `virtualRef.getBoundingClientRect()` devuelve coords actuales siempre. Render con `visibility: hidden` hasta el primer `computePosition()` resuelva (evita flash de posición `(0,0)`). Patrón vivo en [SlashMenu.tsx](../../src/components/editor/menus/SlashMenu.tsx); reusable para hover cards de wikilinks, tooltips de AI suggestions, cualquier overlay del editor cuyo anchor no es un DOM node.

## `padding-bottom: 50vh` en `.note-editor .ProseMirror` para breathing room al final de notas largas

Spacer CSS invisible que permite que el scroll del `<main>` corra aunque el contenido real termine antes — el cursor al final nunca queda pegado al borde inferior del viewport. Principio generalizable: antes de montar un listener JS que corre en cada keystroke/selection change (typewriter-mode via `selectionUpdate` + `scrollIntoView`), verificar si un padding/margin/spacer estático alcanza. El listener tiene costo de performance y tradeoff de UX (some users hate typewriter mode); el padding no. Documentado en [src/index.css:167](../../src/index.css#L167).

## Popup wikilinks sin `tippy.js`

`createPortal` + virtual anchor del `clientRect()` de TipTap. ~30 líneas, sin dep extra.

## Tokens de popup styling unificados

Todos los menus flotantes del editor (WikilinkMenu, SlashMenu, BubbleToolbar, LinkInput, LinkHoverView) usan `rounded-lg border border-border bg-popover text-popover-foreground shadow-xl` + `p-1`.
