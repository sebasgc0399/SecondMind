# SPEC — Feature 16: Code blocks con scroll horizontal (sin word-wrap)

> Alcance: los bloques `<pre><code>` dentro del editor preservan el formato horizontal original del código y muestran scrollbar horizontal cuando exceden el ancho del contenedor, en lugar de envolver palabras que rompen indentación y parsing visual.
> Dependencias: ninguna. Se apoya en el extension `codeBlock` que ya viene en `@tiptap/starter-kit` v3 (slash menu `/code-block` ya lo dispara).
> Estimado: 1 sesión corta (15–30 min dev + E2E).
> Stack relevante: TipTap StarterKit (codeBlock default), CSS-first en `src/index.css`.

---

## Objetivo

Al pegar o escribir código con líneas largas en una nota, el usuario ve el código tal cual lo pegó — indentación preservada, sin saltos falsos que partan identificadores a la mitad — y puede scrollear horizontalmente dentro del bloque gris para leer el resto. Valor inmediato en mobile (375px), donde una sola línea de C#/TS con 60+ chars hoy se parte en 3–4 líneas visuales y destruye la legibilidad (ver screenshot de dogfooding con `FCBasicBLL`).

---

## Features

### F1: Forzar `white-space: pre` y activar scroll horizontal en `<pre>` del editor

**Qué:** Agregar `white-space: pre` y `max-width: 100%` al selector `.note-editor .ProseMirror pre`, y `white-space: pre` al child `pre code`. El `overflow-x: auto` ya está pero no se activa hoy porque el reset de Tailwind Preflight pisa el `white-space: pre` nativo del `<pre>` → el texto envuelve y nunca desborda horizontalmente.

**Criterio de done:**

- [ ] En mobile (375px), pegar un bloque de código con líneas de ≥60 chars produce scroll horizontal dentro del bloque gris, no saltos de línea falsos.
- [ ] En desktop (1280px), el mismo bloque respeta el ancho del editor y muestra scroll solo si la línea excede el contenedor.
- [ ] El contenedor `pre` NO desborda el ancho del editor (no genera scroll en el `body` de la página).
- [ ] El `code` inline (`` `algo` ``) sigue haciendo wrap normal — el fix NO afecta marks inline, solo el bloque `pre`.
- [ ] Visual regression: el resto de estilos del editor (headings, lists, blockquote, task list, highlight, links) no cambia.

**Archivos a crear/modificar:**

- `src/index.css` — modificar los 2 selectores `.note-editor .ProseMirror pre` (línea ~222) y `.note-editor .ProseMirror pre code` (línea ~229). No se crean archivos nuevos.

**Notas de implementación:**

- El `overflow-x: auto` ya está en el selector — el fix es únicamente agregar `white-space: pre` (pisa el Preflight de Tailwind) y `max-width: 100%` (evita que un bloque con línea de 500px expanda el contenedor del editor y genere scroll en la página entera).
- `white-space: pre` también debe estar en `pre code` porque el reset puede aplicarse al `<code>` hijo independientemente del padre `<pre>` — sin esto, el texto del code hereda el word-wrap aunque el `pre` lo niegue.
- **No tocar** `.note-editor .ProseMirror code` (inline, línea ~214) — el inline code debe seguir envolviéndose con el párrafo.
- Verificar el scrollbar en dark mode y light mode — los scrollbars nativos del OS son suficientes (no hace falta `::-webkit-scrollbar` custom en esta feature). Si se ve feo en Windows, evaluar como polish posterior.
- Extension: NO requiere cambios. `StarterKit` ya incluye `codeBlock` y el slash menu F2 ya registra `/code-block` → `toggleCodeBlock().run()` (confirmado en [slashMenuItems.ts:115-121](../../src/components/editor/menus/slashMenuItems.ts#L115-L121)).
- BubbleToolbar: ya se oculta dentro de codeBlock (guard en [BubbleToolbar.tsx:20](../../src/components/editor/menus/BubbleToolbar.tsx#L20)). Sin cambios.

---

## Orden de implementación

1. **F1** → único cambio. Editar los 2 selectores, E2E en Playwright (viewport 375 + 1280) con bloque de código largo, commit, deploy-only-hosting.

---

## Estructura de archivos

No hay archivos nuevos. Solo modificación in-place de `src/index.css`.

---

## Definiciones técnicas

### Alternativas consideradas para word-wrap

- **Opción A (elegida):** `white-space: pre` + `overflow-x: auto` + `max-width: 100%`. Comportamiento estándar de IDEs/GitHub/Notion. Scroll horizontal explícito.
- **Opción B:** `white-space: pre-wrap`. Mantiene wrap pero respeta indentación/newlines. Descartada: el user pidió explícitamente scroll horizontal, no wrap bonito. Además en mobile con líneas muy largas sigue partiendo identificadores.
- **Opción C:** Extension custom (`@tiptap/extension-code-block-lowlight`). Fuera de scope — agrega syntax highlighting, feature distinta que el user NO pidió. Ya está listada en `ESTADO-ACTUAL > Candidatos próximos` como feature futura independiente.

**Decisión:** A. Match con el mental model estándar de bloques de código en productos similares, cero JS, cero dependencia nueva.

### Scope explícito: fuera

- Syntax highlighting (candidato de backlog separado).
- Indent con Tab key dentro de code blocks (StarterKit default del codeBlock acepta Tab como char, no indent — si hiciera falta mejorar, otro SPEC).
- Botón "Copy code" en el bloque (otro SPEC, no pedido).
- Custom scrollbar styling (si visualmente molesta, se agrega en polish posterior).

---

## Checklist de completado

- [ ] `src/index.css` modificado con las 3 líneas nuevas (2 en `pre`, 1 en `pre code`).
- [ ] `npm run lint` + `npm run build` verdes.
- [ ] E2E con Playwright en 375px: pegar bloque C# del screenshot de dogfooding → bloque muestra scrollbar horizontal, `FCBasicBLL(int empresaID)` en una sola línea visual.
- [ ] E2E en 1280px: mismo bloque entra completo sin scroll, el mismo bloque con línea de 200 chars muestra scroll horizontal, no rompe layout del editor.
- [ ] Regression: bubble menu, slash menu, task list, highlights, wikilinks funcionan igual en una nota con code block mezclado con texto normal.
- [ ] Deploy solo-hosting: `npm run build && npm run deploy`. No requiere `tauri:build` ni `cap:sync` (cambio 100% client-side CSS — auto-updater desktop/mobile recoge la web nueva).
- [ ] Commit atómico: `feat(editor): preservar formato horizontal en code blocks con scroll-x`.
- [ ] Merge `--no-ff` a `main`, push sin preguntar.
- [ ] SPEC convertido a registro de implementación (step 8 SDD).

---

## Siguiente fase

Habilita dogfooding con snippets reales de código en notas Zettelkasten — desbloquea uso para notas técnicas/references de programación sin perder legibilidad. Candidatos naturales que se construyen sobre esto (no en este SPEC): syntax highlighting (lowlight + highlight.js), botón copy-to-clipboard en el bloque, selector de lenguaje.
