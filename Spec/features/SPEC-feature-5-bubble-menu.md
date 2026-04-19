# SPEC — SecondMind · Feature 5: Bubble Menu + Link Extension (Registro de implementación)

> Estado: Completada — Abril 2026
> Commits: `cab57ff` StarterKit config (link enabled + underline disabled), `4538ab8` BubbleToolbar con 5 botones de formato inline, `5bf3acf` Link en bubble + LinkInput + link-hover view
> Gotchas operativos vigentes → `Spec/ESTADO-ACTUAL.md` sección "Bubble Menu + Link (Feature 5)"

## Objetivo

El editor tenía 5 marks inline (bold, italic, strike, code, highlight) accesibles solo vía shortcuts invisibles (`Ctrl+B`, `Ctrl+I`, `Ctrl+Shift+H`). En mobile no había forma alguna de formatear. Después de Feature 5: seleccionar texto muestra un toolbar flotante con los 6 formatos (los 5 previos + Link nuevo). Cada botón refleja estado activo y togglea con un tap. Los hyperlinks se crean, editan, desvinculan y abren desde el mismo bubble. Funciona bien en mobile 375, y convive con la selection toolbar nativa de iOS.

## Qué se implementó

- **F1 — StarterKit config (link enabled + underline disabled):** reemplazado `StarterKit` pelado por `StarterKit.configure({ link: { openOnClick: false, autolink: true, linkOnPaste: true, defaultProtocol: 'https', HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer', class: 'editor-link' } }, underline: false })`. CSS para `.editor-link` con `color: var(--primary)` + underline `color-mix` 40% transparent que sube a 80% en hover. `Ctrl+U` queda inerte. Archivos tocados: `src/components/editor/NoteEditor.tsx`, `src/index.css`.
- **F2 — BubbleToolbar con 5 botones de formato:** componente nuevo con `BubbleMenu` de `@tiptap/react/menus` (path v3) + `useEditorState` con selector de **primitivos** (5 booleans → shallow compare sin re-renders innecesarios). `shouldShow` definido **module-level** (referencia estable sin `useCallback`), bloquea si editor no editable / selección vacía / cursor en code block o sobre wikilink. Options API v3: `{ placement: 'top', offset: 8, flip: true, shift: { padding: 8 } }` — no acepta `middleware: [...]` como array. 5 botones tap target 44×44 con iconos Lucide, separador visual antes de Highlight, popup styling consistente con WikilinkMenu/SlashMenu. `@floating-ui/dom@^1.7.6` agregado como direct dep (ya transitivo vía `@base-ui/react`). Archivos tocados: `src/components/editor/menus/BubbleToolbar.tsx` (nuevo), `src/components/editor/NoteEditor.tsx`, `package.json`, `package-lock.json`.
- **F3 — Link en bubble + LinkInput + link-hover view:** botón Link como 6° en el toolbar default. State machine de 2 modos locales (`'default' | 'link-edit'`), con branch de render adicional cuando `selection.empty && isActive('link')` → `<LinkHoverView>` (URL truncada con `truncateHref(href, 32)` que strippea protocolo + Abrir/Editar/Desvincular). `LinkInput` nuevo con `useEffect` que enfoca + selecciona al mount, `handleKeyDown` con `e.preventDefault() + e.stopPropagation()` en Enter/Escape (sin esto el keydown burbujea al editor y dispara shortcuts), `normalizeUrl(raw)` que prefija `https://` si falta protocolo. Handlers usan `editor.chain().focus().extendMarkRange('link').setLink({ href }).run()` — `extendMarkRange` crítico para que `setLink`/`unsetLink` aplique al rango completo cuando se edita sin selección. `useEffect` de reset de `mode` a `'default'` cuando ya no hay link ni selección. Archivos tocados: `src/components/editor/menus/LinkInput.tsx` (nuevo), `src/components/editor/menus/BubbleToolbar.tsx`.

## Decisiones clave

1. **Link y Underline ya vienen en StarterKit v3** → configurar, no instalar. Verificado en `node_modules/@tiptap/starter-kit/dist/index.d.ts`.
2. **`@floating-ui/dom` como direct dep** aunque sea transitivo — contrato explícito y previene desaparición silenciosa si `@base-ui/react` migra.
3. **Tap targets 44×44 en todos los breakpoints**. Una sola convención > rama mobile vs desktop.
4. **Sin animación de entrada/salida.** Notion tampoco anima su bubble. Menos complejidad.
5. **2 estados locales** (`default` | `link-edit`), link-hover es branch del render en default — más simple que 3 estados.
6. **Botón Abrir** en mini-toolbar de link-hover — complementa `openOnClick: false`.
7. **`useEditorState` con selector de primitivos** (no objects anidados) — TipTap hace shallow compare.
8. **`shouldShow` module-level** — referencia estable sin overhead de `useCallback`.
9. **`extendMarkRange('link')`** antes de cualquier `setLink`/`unsetLink` cuando el cursor está sobre link sin selección.
10. **`e.stopPropagation()` + `e.preventDefault()` en Enter/Escape** dentro de LinkInput — evita que el keydown burbujee al editor o al BubbleMenu.

## Lecciones

- **StarterKit v3 incluye Link, Underline (con `Ctrl+U`) y Strike por default — no instalar `@tiptap/extension-*` por reflejo.** Confirmar primero leyendo `node_modules/@tiptap/starter-kit/dist/index.d.ts`. Si querés _deshabilitar_ una de estas (caso `underline: false` para no chocar con la convención de hyperlinks), hay que pasarla explícitamente en `configure({...})` — sin esto el shortcut sigue activo y el usuario puede activar marks que no tienen UI para quitar.
- **BubbleMenu v3 expone middlewares de Floating UI como keys individuales (`offset`, `flip`, `shift`, `arrow`, `size`, `autoPlacement`, `hide`, `inline`), NO acepta `middleware: [...]` como array.** Cualquier copy-paste de docs/ejemplos de Floating UI directo va a fallar el typecheck. Cada key es `Parameters<typeof X>[0] | boolean`.
- **`shouldShow` inline en el JSX remonta el BubbleMenu en cada render del padre.** Definir la función a **module-level** (fuera del componente) da referencia estable sin necesidad de `useCallback([])`. Patrón aplicable a cualquier prop function que no dependa de closures del componente.
- **Floating UI sub-deps transitivas son frágiles.** Si una librería del stack expone componentes que internamente dependen de `@floating-ui/dom`, agregarlo como **direct dep** del proyecto aunque parezca redundante — un upgrade del padre que cambie su backend de positioning hace desaparecer el subtree sin warning.
- **iOS Safari muestra su selection toolbar nativa encima de cualquier BubbleMenu — coexisten sin workaround confiable.** Documentado como known limitation en Notion, Linear, etc. El bubble custom aparece sobre la selección (`placement: 'top'`); el toolbar de iOS flota fijo en su posición. No vale la pena pelear.
- **Wikilinks (y cualquier Node atomic) bloquean marks automáticamente en ProseMirror — no hace falta lógica especial.** `editor.isActive('wikilink')` en `shouldShow` es suficiente para filtrar el bubble cuando el cursor cae sobre uno; ProseMirror se encarga de no aplicar marks aunque el usuario intente.
- **`extendMarkRange(markName)` antes de cualquier `setMark`/`unsetMark` cuando el cursor está dentro del mark sin selección.** Sin esto, `setLink({ href })` con cursor parado adentro de un link existente sólo afecta al carácter actual, dejando el resto del link sin actualizar. Aplica a cualquier mark editable con UI inline (link, color, underline custom, etc.).
