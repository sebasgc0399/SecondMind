# SPEC — Feature 14: Editor UX polish (paste hygiene + slash menu viewport + breathing room)

> Estado: En progreso
> Rama: `feat/editor-ux-polish`
> Plan aprobado: `~/.claude/plans/el-an-lisis-de-claude-distributed-brook.md`

## Objetivo

Dogfooding del editor TipTap expuso tres issues UX en una misma sesión de escritura extensa con paste desde un IDE: (1) texto pegado con `font-size` gigante heredado del clipboard HTML, (2) slash menu invisible cuando el cursor está cerca del borde inferior del viewport, (3) sin aire para escribir al final de una nota larga — el cursor queda pegado al borde inferior. F14 resuelve los tres con cambios client-side acotados al editor, sin introducir dependencias nuevas ni ampliar el schema de ProseMirror.

## Sub-features

### F14.1 — Paste sanitization (strip total de `style` / `class` inline)

- **Qué:** agregar `editorProps.transformPastedHTML` al `useEditor()` que stripea atributos `style` y `class` del HTML pegado vía regex defensivo (cubre comillas simples y dobles).
- **Por qué:** el stack NO tiene extensiones `TextStyle`/`FontSize`/`Color`. Sin sanitización, el HTML del clipboard (`<span style="font-size: 24px; line-height: 1.5; font-family: Consolas">`) se persiste como atributo inline del nodo y gana specificity contra el CSS del editor. Strip total alinea con la filosofía Zettelkasten (notas atómicas uniformes) y deja que el schema de ProseMirror haga el resto — marks no registrados se descartan automáticamente al reconstruir el documento.
- **Criterio de done:** pegar código desde VS Code resulta en texto plano con `font-size: 1rem`, sin colores inline. `linkOnPaste` sigue activo (pegar URL plano se convierte en link). JSON persistido en Firestore sin `style="..."` ni `class="..."`.
- **Archivo:** [src/components/editor/NoteEditor.tsx](../../src/components/editor/NoteEditor.tsx).
- **Snippet:**
  ```ts
  editorProps: {
    transformPastedHTML: (html) => html.replace(/\s(style|class)=["'][^"']*["']/gi, ''),
  },
  ```

### F14.2 — Slash menu con flip dinámico vía @floating-ui

- **Qué:** refactorizar el posicionamiento manual de `SlashMenu` (`position: fixed; top: rect.bottom + 6`) a `@floating-ui/dom` con `computePosition` + middlewares `offset(6)`, `flip()`, `shift({ padding: 8 })`, envuelto en `autoUpdate` para re-cálculo automático en scroll/resize.
- **Por qué:** bug puro de visibilidad — cuando el cursor está a <250px del borde inferior, el menú se pinta fuera del viewport. `@floating-ui/dom@1.7.6` ya está instalado ([package.json:32](../../package.json#L32)) y BubbleToolbar ya usa el mismo patrón `flip: true, shift: { padding: 8 }` via `@tiptap/react/menus`. Reusar la dependencia existente, no introducir tippy ni cálculo manual.
- **Criterio de done:** cursor cerca del borde inferior + `/` → menú aparece **arriba** del cursor. Cursor cerca del tope → menú aparece abajo (behavior default). Viewport angosto (375px) → menú no desborda horizontalmente. Scroll con menú abierto → re-posiciona automáticamente vía `autoUpdate`.
- **Archivo:** [src/components/editor/menus/SlashMenu.tsx](../../src/components/editor/menus/SlashMenu.tsx).
- **Nota de implementación:** `autoUpdate(virtualRef, menuEl, update)` maneja ciclo de vida (scroll, resize, IntersectionObserver) con un único handle de cleanup en el `useLayoutEffect` cleanup. Estado local `{ top, left }` inicializado a `null` + render con `visibility: hidden` hasta el primer `update()` para evitar flash de posición incorrecta.

### F14.3 — Breathing room al final del editor

- **Qué:** agregar `padding-bottom: 50vh` al selector `.note-editor .ProseMirror` existente.
- **Por qué:** `.ProseMirror` tiene `min-height: 60vh` pero no `padding-bottom` — la última línea queda pegada al borde inferior del viewport al escribir. El padding funciona como spacer invisible que permite que el scroll del `<main>` corra aunque el contenido real termine antes. Efecto: al escribir al final siempre hay ~50vh de aire debajo del cursor. Beneficio secundario: reduce la frecuencia con la que F14.2 necesita disparar el flip (más espacio abajo → menú cabe abajo más seguido).
- **Criterio de done:** al final de una nota larga, al presionar Enter queda ≥50vh de aire debajo del cursor. Notas cortas no rompen layout ni agregan scroll horizontal.
- **Archivo:** [src/index.css](../../src/index.css) (selector existente en líneas 159-167).

## Orden de implementación

1. **F14.3** (CSS only, cero riesgo — baseline).
2. **F14.2** (fix de bug vía refactor del posicionamiento).
3. **F14.1** (cambio de behavior — validado último con editor en forma definitiva).

Un commit atómico por sub-feature en `feat/editor-ux-polish`.

## Fuera de scope

- **Control de font-size a nivel nota** (zoom, tamaño de lectura en settings). Scope creep — contradice uniformidad Zettelkasten. Descartado explícitamente.
- **Whitelist conservador de estilos inline** (preservar color/background). Innecesario dado que no hay marks que los gobiernen — habría estilos "huérfanos" sin UI de control.
- **Typewriter active scrolling** (listener sobre `selectionUpdate` que centra el cursor). Candidato futuro si dogfooding lo demanda; requiere toggle en settings para no ser intrusivo.
- **Paste de imágenes con data URLs.** Tema ortogonal, no reportado.

## Verificación E2E

Dev server en background: `npm run dev`. UID de tests Firebase: `gYPP7NIo5JanxIbPqMe6nC3SQfE3`.

- **F14.1:** pegar código desde VS Code en una nota → texto con font-size base + sin colores. Reload → JSON persistido sin `style="..."`. Regresión: URL pegado se convierte en link.
- **F14.2:** nota larga (≥3 pantallas) + cursor cerca del borde inferior + `/` → menú aparece arriba. Cursor cerca del tope → menú abajo. Scroll con menú abierto → re-posiciona.
- **F14.3:** nota larga + Enter al final → ≥50vh de aire debajo del cursor. Notas cortas sin regresión.
- **Cross-issue:** pegar código en nota larga + abrir slash menu cerca del borde inferior → todo limpio.

## Deploy

F14 es 100% client-side en `src/`. Pipeline mínimo:

- `npm run build && npm run deploy` (hosting).
- Tauri/Android **opcionales** — sin cambios en `src-tauri/` ni `android/`, el auto-updater sirve la web actualizada y el APK puede omitirse.

## Checklist

- [ ] Rama `feat/editor-ux-polish` creada.
- [ ] F14.3 implementada + commit.
- [ ] F14.2 implementada + commit.
- [ ] F14.1 implementada + commit.
- [ ] `npm run build` pasa.
- [ ] `npm run lint` pasa.
- [ ] E2E manual de los 3 escenarios.
- [ ] Merge `--no-ff` a main + push origin.
- [ ] Deploy hosting.
- [ ] Step 8 SDD: archivar SPEC como registro de implementación + escalar gotchas (candidato claro: "TipTap sin `transformPastedHTML` preserva `style` inline que gana por specificity" → ESTADO-ACTUAL sección editor).
