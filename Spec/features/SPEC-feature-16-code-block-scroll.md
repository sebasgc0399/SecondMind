# SPEC — Feature 16: Code blocks con scroll horizontal (Registro de implementación)

> Estado: Completada Abril 2026
> Commits: `13ce365` feat(editor): preservar formato horizontal en code blocks con scroll-x · `484dbd8` Merge feat/code-block-scroll
> Gotchas operativos vigentes → `Spec/ESTADO-ACTUAL.md`

---

## Objetivo

Al pegar o escribir código con líneas largas en una nota, el usuario ve el código tal cual lo pegó — indentación preservada, sin saltos falsos que partan identificadores a la mitad — y puede scrollear horizontalmente dentro del bloque gris para leer el resto. Valor inmediato en mobile (375px), donde una sola línea de C#/TS con 60+ chars se partía en 3-4 líneas visuales y destruía la legibilidad (ver screenshot de dogfooding con `FCBasicBLL`).

---

## Qué se implementó

- **F1 — `white-space: pre` + `max-width: 100%` en el `<pre>` del editor:** se agregaron 3 propiedades CSS sobre los selectores existentes `.note-editor .ProseMirror pre` (`white-space: pre`, `max-width: 100%`) y `.note-editor .ProseMirror pre code` (`white-space: pre`). El `overflow-x: auto` ya estaba en el primer selector pero nunca se activaba: el Preflight de Tailwind v4 pisaba el `white-space: pre` nativo del `<pre>`, así que el contenido envolvía y nunca había overflow horizontal. Validado E2E con Playwright en 1280px y 375px sobre snippet C# del screenshot de dogfooding: scrollWidth `833` >> clientWidth `296` en mobile, body sin overflow horizontal, `scrollHeight (459) == expectedHeight no-wrap (459.2)` → demuestra matemáticamente que ninguna línea envuelve. Archivos tocados: `src/index.css`.

---

## Decisiones clave

| Decisión                                 | Opciones                                                                                                                                                         | Elegida   | Razón                                                                                                                                                                     |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Estrategia word-wrap                     | A: `white-space: pre` + `overflow-x: auto` (scroll) / B: `white-space: pre-wrap` (wrap respetando indent) / C: extension `@tiptap/extension-code-block-lowlight` | A         | Match con mental model de IDEs/GitHub/Notion. B sigue partiendo identificadores en líneas largas. C agrega syntax highlighting (otro SPEC).                               |
| Dónde aplicar el fix                     | CSS-first en `index.css` / config en TipTap extension                                                                                                            | CSS-first | Cero dependencia nueva, cero JS, alineado con el patrón de los 24 selectores `.note-editor .ProseMirror …` ya existentes.                                                 |
| Agregar `max-width: 100%`                | Solo `white-space: pre` / agregar también `max-width: 100%`                                                                                                      | Agregar   | Sin esto, una línea de 500px expande el `<pre>` mismo y desplaza el scroll al `<body>` entero — el `overflow-x: auto` solo funciona si el contenedor está acotado.        |
| `white-space: pre` también en `pre code` | Solo en `pre` (hereda) / en ambos                                                                                                                                | En ambos  | El reset puede aplicar al `<code>` independientemente del padre en algunos navegadores; sin el duplicado, el texto del code hereda word-wrap aunque el `<pre>` lo niegue. |

---

## Lecciones

- **Tailwind v4 Preflight pisa el `white-space: pre` nativo del `<pre>`.** Cualquier feature que asuma defaults HTML del `<pre>`/`<code>` necesita declarar `white-space` explícito. Aplicable a futuros renderers de code (markdown viewer, SPEC viewer, snippets en daily digest si alguna vez se muestran). Generalizable: antes de confiar en defaults de elementos HTML semánticos bajo Tailwind v4, verificar qué pisa Preflight.
- **`overflow-x: auto` necesita co-requisitos para ser útil.** En el bug original ya estaba presente y nunca se activaba, porque (1) el texto envolvía → cero overflow horizontal, y (2) sin `max-width: 100%`, el `<pre>` crecía hasta el ancho de la línea más larga y movía el scroll al `<body>`. Las tres propiedades son interdependientes, no opcionales — declarar `overflow-x: auto` aislado es código muerto.
- **Audit de scope antes de cambios CSS "globales" paga.** El Explore agent confirmó cero impacto colateral (0 matches de `<pre>` en `src/components`/`src/app` fuera del editor) y ausencia de `prose` / `@tailwindcss/typography`. Patrón reusable: antes de tocar `src/index.css`, grep el elemento HTML afectado en todo el árbol de componentes — un selector aparentemente scoped puede tocar renders no obvios.
