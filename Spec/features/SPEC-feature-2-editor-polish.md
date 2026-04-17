# SPEC — SecondMind · Feature 2: Editor Polish (Registro de implementación)

> Estado: **Completada** — Abril 2026
> Alcance: Menciones con `@` reemplazan `[[` wikilinks, slash commands `/` para insertar bloques (headings, listas, task list, code, quote, divider, mention, templates), y 2 templates Zettelkasten (Literature, Permanent) que setean `noteType` al aplicarse.
> Stack implementado: TipTap 3.x (StarterKit + Placeholder + Suggestion + TaskList + TaskItem), ProseMirror, React 19, lucide-react, listener pattern + `createPortal`.
> Para gotchas operativos consolidados → `Spec/ESTADO-ACTUAL.md` sección "Editor Polish (Feature 2)".

---

## Objetivo

El usuario escribe en el editor y tiene dos herramientas potentes: `@` para mencionar notas existentes (reemplaza los `[[wikilinks]]` con un patrón más natural e intuitivo), y `/` para insertar cualquier tipo de bloque (headings, listas, callouts, dividers, templates de nota). Ambos usan autocompletado con la misma infraestructura de Suggestion ya probada, sin migración de datos (los nodos ProseMirror `wikilink` existentes siguen siendo válidos).

---

## Prerequisitos descubiertos

- **Fix Vite `resolve.dedupe` React (pre-requisito bloqueador — commit `9dde562`).** Tras el `npm install` de TipTap TaskList/TaskItem, el dev server tiraba pantalla blanca con `Invalid hook call` + `Cannot read properties of null (reading 'useContext')` en el `<Provider>` de TinyBase. Causa: `extension/node_modules/` tiene su propia copia de React (Chrome Extension es un workspace separado con `node_modules` propio) y el re-optimizer de Vite eligió esa copia por accidente, duplicando el reconciler. Fix: agregar `'react', 'react-dom'` a `resolve.dedupe` en `vite.config.ts` — mismo patrón que Firebase ya tenía de Feature 1.
- **PluginKey explícito por Suggestion plugin (pre-requisito bloqueador — commit `9dde562`).** Al cargar el editor: `RangeError: Adding different instances of a keyed plugin (suggestion$)`. Dos instancias de `@tiptap/suggestion` (wikilink + slash) comparten el `pluginKey` default `suggestion$` de TipTap y ProseMirror rechaza keys duplicadas. Fix: `pluginKey: new PluginKey('wikilink-suggestion')` y `PluginKey('slash-command-suggestion')` en cada config.

Ambos fixes se descubrieron recién durante el testing E2E con Playwright (no los previó el plan). Están commiteados por separado para dejar trazabilidad del bug-fix.

---

## Features implementadas

### F1: Menciones con `@` (commit `587c95e`)

- `src/components/editor/extensions/wikilink-suggestion.ts`:
  - `char: '[['` → `char: '@'`.
  - `allow: ({ state, range })` custom: acepta si `range.from === 0` o si el char previo **no** matchea `/[a-zA-Z0-9]/`. Rechaza `sebas@gmail.com` (char previo alfanumérico) pero permite `(ver @nota)`, `"@nota"`, `según: @nota`, `—@nota`. Blacklist > whitelist para minimizar false negatives.
  - `allowSpaces: true` preservado → búsqueda por títulos con espacios sigue funcionando.
- `src/index.css` `.wikilink`:
  - `display: inline-block`, `padding: 0 .375rem`, `border-radius: .375rem`, `background: color-mix(in oklch, var(--primary) 12%, transparent)` → pill distinguible.
  - `::before { content: '@'; opacity: .6 }` agrega el prefijo visual sin tocar el Node ni el texto almacenado. Los nodos `wikilink` viejos (de pre-Feature 2) rehidratan con los nuevos estilos automáticamente — no hay migración de datos.
  - `:hover` intensifica el bg a 22%.
- Sin cambios en `extractLinks()` / `syncLinks()` — parsean `node.type`, no el trigger.

### F2: Slash commands (commit `8e8197d`)

- Deps agregadas (`--legacy-peer-deps`): `@tiptap/extension-task-list`, `@tiptap/extension-task-item`.
- `src/components/editor/extensions/slash-command.ts`:
  - `Extension.create<{ noteId: string }>({ name: 'slashCommand', addOptions: () => ({ noteId: '' }), addProseMirrorPlugins() { return [Suggestion({ editor: this.editor, ...slashCommandSuggestion({ noteId: this.options.noteId }) })] } })`.
  - `noteId` inyectado vía `SlashCommand.configure({ noteId })` desde `NoteEditor`. Stale-closure safe porque `page.tsx:53` remonta `<NoteEditor key={noteId}>`.
- `src/components/editor/extensions/slash-command-suggestion.ts`:
  - `char: '/'`, `allowSpaces: false`, `startOfLine: false`, mismo `allow()` que wikilink (blacklist alfanumérica) → evita disparo en URLs `https://foo/bar`.
  - `pluginKey: new PluginKey('slash-command-suggestion')` para no colisionar con wikilink.
  - `command`: `editor.chain().focus().deleteRange(range).run()` elimina `/query` tipeado → `props.action(editor, context)` ejecuta el comando del item con el `noteId`.
  - `render()` delega a `setSlashMenuListener({ onStart, onUpdate, onKeyDown, onExit })` — listener pattern idéntico al de WikilinkMenu.
- `src/components/editor/menus/SlashMenu.tsx`:
  - Listener global + `createPortal(<div role="listbox">, document.body)` + virtual anchor (`fixed top: rect.bottom + 6, left: rect.left, z-index: 60`).
  - Items agrupados por categoría con header uppercase 10px + botón por item con ícono lucide + label + description. Arrow↑↓ sobre el array plano filtrado (no salta headers porque los indexes son contiguos post-groupBy).
  - `max-w-[min(20rem,calc(100vw-1rem))]` evita overflow en viewports estrechos.
- `src/components/editor/menus/slashMenuItems.ts`:
  - 12 items en 5 categorías: Texto (Heading 1/2/3), Listas (Bullet/Numbered/Task), Bloques (Code/Blockquote/Divider), Menciones (Mencionar nota → inserta `@`), Templates (Literature, Permanent).
  - `keywords?: string[]` opcional por item → filter fuzzy contra `[label, id, ...keywords].join(' ')`. Permite `/h1`, `/h2`, `/h3`, `/ul`, `/ol`, `/tareas`, `/codigo`, `/cita`, `/hr`, etc. Agregado durante testing E2E al notar que `/h2` no matcheaba "Heading 2".
- `src/index.css`:
  - Estilos para `ul[data-type='taskList']`: `list-style: none`, `padding-left: 0`, items con `display: flex`, checkbox `accent-color: var(--primary)`, `data-checked='true']` con opacity + line-through.
- `src/components/editor/NoteEditor.tsx`:
  - Extensions: `StarterKit`, `TaskList`, `TaskItem.configure({ nested: true })`, `Placeholder`, `Wikilink`, `SlashCommand.configure({ noteId })`.
  - Monta `<WikilinkMenu />` + `<SlashMenu />` después de `<EditorContent />`.

### F3: Templates Zettelkasten (commit `1724698`)

- `src/components/editor/templates/literatureTemplate.ts`: `JSONContent[]` con 6 nodos — H2 "Fuente" / P "[Autor…]" / H2 "Ideas clave" / UL con 3 `listItem` vacíos / H2 "En mis palabras" / P "[Tu interpretación…]".
- `src/components/editor/templates/permanentTemplate.ts`: 6 nodos — H2 "Tesis" / P / H2 "Desarrollo" / P / H2 "Conexiones" / P "[…usa @ para mencionar]".
- `slashMenuItems.ts` agrega 2 items categoría "Templates":
  - Acción: `editor.chain().focus().insertContent(template).run()` → `void updateNoteType(ctx.noteId, 'literature' | 'permanent')`.
  - `updateNoteType()`: lee `auth.currentUser?.uid` en runtime (no freeze en config) → `notesStore.setPartialRow('notes', noteId, { noteType })` (optimista) → `await updateDoc(doc(db, 'users', uid, 'notes', noteId), { noteType })`. Try/catch loggea sin romper el flujo si falla.
  - Sobrescribe silenciosamente — aplicar Literature sobre nota `permanent` re-marca como `literature` sin confirmación (decisión validada con el usuario).

### Fix runtime + UX polish (commit `9dde562`)

- `vite.config.ts`: `resolve.dedupe += ['react', 'react-dom']` → elimina pantalla blanca post-install.
- `wikilink-suggestion.ts` + `slash-command-suggestion.ts`: `pluginKey: new PluginKey(...)` explícito en cada uno.
- `slashMenuItems.ts`: `keywords: string[]` por item + filter expandido (`label + id + keywords`).
- `SlashMenu.tsx`: `stateRef.current = state` movido a `useEffect(() => { stateRef.current = state }, [state])` para cumplir `react-hooks/refs`.
- `NoteEditor.tsx`: re-ordenado de imports por Prettier hook (sin cambio semántico).

---

## Desviaciones del plan original

- **`keywords` por item agregado durante testing** — no estaba en el plan. El filter original solo comparaba `label` + `id`, así que `/h1` no matcheaba "Heading 1" (ni "heading-1" contiene "h1" como substring). Agregar `keywords: ['h1', 'titulo']` y concatenar el haystack cubrió los aliases naturales en español y abreviaciones comunes.
- **Debug de dos bugs runtime no previstos** — `pluginKey` duplicado y React duplicada por `extension/node_modules/`. Ambos requirieron fix aislado (commit `9dde562`) antes de poder testear E2E. El plan no los anticipó porque el build pasaba sin errores (son bugs de runtime del dev server / ProseMirror plugin system).
- **Cursor positioning post-template skipeado (MVP YAGNI)**. El plan mencionaba opcionalmente dejar el cursor en el primer campo editable. Se descartó: el cursor queda al final del bloque insertado por default de `insertContent`, y el user puede hacer click donde quiera continuar. No hubo queja en la verificación.
- **`Mencionar nota` implementado como `insertContent('@')`**. El plan proponía esta opción como la más simple y se mantuvo — el Suggestion plugin del `@` se dispara automáticamente tras la inserción, sin acoplar menús.

---

## Gotchas descubiertos durante el dev

- **`extension/node_modules/react` (Chrome Extension workspace) rompe el dev server.** Sin `dedupe: ['react', 'react-dom']` en `vite.config.ts`, el optimizer de Vite elige la React del workspace extension al re-optimizar y duplica el reconciler → `Invalid hook call` en el primer componente que lee context (TinyBase `<Provider>`). Mismo gotcha que Firebase ya tenía documentado de Feature 1. **Reincidente tras cualquier `npm install` que mueva el lockfile** — si aparece `Invalid hook call` al arrancar dev, es esto.
- **Múltiples Suggestion plugins en TipTap colisionan por `pluginKey` default.** Ambos plugins asumen `suggestion$` como key y ProseMirror rechaza al montar el segundo: `RangeError: Adding different instances of a keyed plugin`. Fix: `pluginKey: new PluginKey('unique-name')` por cada config. Aplica a cualquier extensión futura que use `@tiptap/suggestion`.
- **Node atom + `contenteditable="false"` no emite textContent en el DOM.** El wikilink renderiza con `atom: true` → su texto NO aparece en `document.querySelector('.ProseMirror').textContent`. Sí aparece en `editor.getText()` porque TipTap serializa el nodo. Esto afecta solo testing E2E via Playwright (hay que usar `editor.getText()` desde TipTap API, no DOM textContent).
- **`--legacy-peer-deps` sigue siendo obligatorio para `@tiptap/extension-*`.** Vite 8 no está listado en peerDependencies; sin el flag, npm rechaza el install.
- **Pill styling via `::before` en CSS evita migración de datos.** Los nodos `wikilink` existentes en Firestore rehidratan con el prefijo `@` visual al abrirlos, sin tocar su ProseMirror JSON. El `::before` no afecta clipboard (Chrome/Firefox excluyen pseudo-elementos al copiar), así que `@título` no se pega como literal — solo el `título` real sale.
- **`allow()` con blacklist `[a-zA-Z0-9]` es más robusto que whitelist.** Cubre comillas, paréntesis, `:`, `—`, `¿¡`, emoji, comas sin enumerarlos. El riesgo de false negative (un caracter no cubierto) es menor que el de false positive (disparar el popup en medio de un email o URL).
- **`SlashCommand.configure({ noteId })` requiere remount por nota.** El `noteId` se captura en el closure de `slashCommandSuggestion()` al construirse la extension. Si el editor no se remonta al cambiar de ruta, los items de Template escribirían al `noteId` viejo. Funciona porque `src/app/notes/[noteId]/page.tsx:53` pasa `key={noteId}` al `<NoteEditor>`. Si en el futuro se comparte el editor entre notas sin remount, el contrato se rompe.

---

## Estructura de archivos creados/modificados

```
vite.config.ts                                                  # +dedupe ['react', 'react-dom']

src/
├── components/editor/
│   ├── NoteEditor.tsx                                          # +TaskList, +TaskItem, +SlashCommand, +<SlashMenu />
│   ├── extensions/
│   │   ├── wikilink-suggestion.ts                              # char '[[' → '@', allow() custom, PluginKey
│   │   ├── slash-command.ts                                    # NUEVO — Extension + Suggestion
│   │   └── slash-command-suggestion.ts                         # NUEVO — config factory con PluginKey
│   ├── menus/
│   │   ├── SlashMenu.tsx                                       # NUEVO — popup con grouping por categoría
│   │   └── slashMenuItems.ts                                   # NUEVO — 12 items + keywords + updateNoteType
│   └── templates/
│       ├── literatureTemplate.ts                               # NUEVO — JSONContent[] Fuente/Ideas/Palabras
│       └── permanentTemplate.ts                                # NUEVO — JSONContent[] Tesis/Desarrollo/Conexiones
└── index.css                                                   # .wikilink pill + ul[data-type='taskList']

package.json                                                     # +@tiptap/extension-task-list + task-item

Spec/features/SPEC-feature-2-editor-polish.md                    # este registro
Spec/ESTADO-ACTUAL.md                                            # +sección Editor Polish (Feature 2)
CLAUDE.md                                                        # +gotchas pluginKey, dedupe React, trigger @, Templates
```

---

## Checklist de completado (verificado)

- [x] `npm run build` OK sin errores TS (~4s, bundle 2.71MB + PWA SW regenerado).
- [x] Lint limpio en archivos nuevos (`src/components/editor/extensions/{slash-command,slash-command-suggestion}.ts`, `menus/{SlashMenu.tsx,slashMenuItems.ts}`, `templates/*.ts`, `NoteEditor.tsx`, `wikilink-suggestion.ts`).
- [x] F1 E2E: `@` abre popup con notas filtradas por título. Enter inserta pill con `::before: '@'`, bg primary/12%, padding 6px, border-radius 6px. `@` dentro de email no dispara popup (bloqueado por `allow()` blacklist).
- [x] F2 E2E: `/` abre slash menu con 12 items agrupados por 5 categorías. Filtro fuzzy `/h` → solo 3 headings; `/lit` → solo Template Literature. Arrow↑↓ + Enter navega/selecciona. Escape cierra.
- [x] F3 E2E: aplicar `/literature` en nota fleeting inserta 6 nodos (H2/P × 3 + UL vacía) + actualiza `noteType: 'literature'` en TinyBase + Firestore (verificado con card del listado mostrando badge "Literatura").
- [x] Regresión: wikilinks viejos renderizan con nuevos estilos sin abrir/editar la nota (CSS solo). `extractLinks()` + `syncLinks()` sin cambios.
- [x] Commits atómicos en `feat/editor-polish`:
  - `587c95e` — feat(editor): reemplazar [[ por @
  - `8e8197d` — feat(editor): slash commands / para insertar bloques
  - `1724698` — feat(editor): templates Literature/Permanent
  - `9dde562` — fix(editor): pluginKey + dedupe React + keywords
- [x] Merge `--no-ff` a main y push a origin.
- [x] Docs actualizados: este SPEC convertido a registro, ESTADO-ACTUAL con sección Editor Polish, CLAUDE.md con gotchas nuevos.

---

## Siguiente feature

Candidatos:

- **Feature 3: Búsqueda híbrida** — combinar Orama keyword FTS con embeddings semánticos (ya generados por la CF `generateEmbedding`) para surfacear notas relacionadas con wording diferente. Scope: UI de Command Palette con tabs "keyword" / "semántica" / "todo", re-ranking con score combinado, preview on-hover.
- **Bubble menu contextual sobre selección** — formato inline (bold/italic/link/highlight) + "convertir selección a callout/quote" + "crear nota desde selección" (atomización Zettelkasten).
- **Code blocks con syntax highlighting** — `@tiptap/extension-code-block-lowlight` + Prism o highlight.js.
- **Convertir task items del editor a Tasks reales** — hoy TipTap TaskItem es rich-text; un comando `Shift+Enter` sobre el item podría crear un `task` en el TaskStore con sourceId = noteId.
- **Drag & drop de imágenes al editor** — upload a Firebase Storage, Node custom `image` con attrs `{ src, alt, width }`.

Feature 2 consolida el listener pattern de Suggestion (ya reusado 2×) y el contexto `SlashCommandContext` que puede extenderse para items que necesiten `currentUid`, `currentProjectId`, etc. Features futuras del editor pueden sumar items al slash menu sin tocar la extensión.
