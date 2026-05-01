# Knowledge Graph y WebGL

> Canon de gotchas del dominio. Índice ligero en `../ESTADO-ACTUAL.md` § "Gotchas por dominio (índice)".
> Cada gotcha vive como `## <título>`. El slug del título es el anchor estable referenciado desde el índice.

## Ruta `notes/graph` ANTES de `notes/:noteId` en router.tsx

Si va después, React Router captura "graph" como noteId. Orden crítico en flat routes con parámetros dinámicos.

## Three.js NO procesa strings `oklch()`

Solo hex, rgb, nombres CSS. Reagraph pasa `GraphNode.fill` directo a Three. Workaround: [`src/lib/theme-colors.ts`](../../src/lib/theme-colors.ts) expone hex equivalentes con comentario `// KEEP IN SYNC WITH src/index.css`. Aplica a cualquier lib WebGL (Three, regl, pixi).

## Reagraph `<GraphCanvas>` tiene canvas blanco hardcoded

Si no se pasa `theme` prop con `canvas.background`. Construir `ReagraphTheme` dinámico con `useMemo` dep en `resolvedTheme`, extendiendo `lightTheme` base y overridando `canvas.background` / `node.label.color` / `edge.fill` / `arrow.fill`.
