# Knowledge Graph y WebGL

> Canon de gotchas del dominio. Índice ligero en `../ESTADO-ACTUAL.md` § "Gotchas por dominio (índice)".
> Cada gotcha vive como `## <título>`. El slug del título es el anchor estable referenciado desde el índice.

## Ruta `notes/graph` ANTES de `notes/:noteId` en router.tsx

Si va después, React Router captura "graph" como noteId. Orden crítico en flat routes con parámetros dinámicos.

## Three.js NO procesa strings `oklch()`

Solo hex, rgb, nombres CSS. Reagraph pasa `GraphNode.fill` directo a Three. Workaround: [`src/lib/theme-colors.ts`](../../src/lib/theme-colors.ts) expone hex equivalentes con comentario `// KEEP IN SYNC WITH src/index.css`. Aplica a cualquier lib WebGL (Three, regl, pixi).

## Reagraph `<GraphCanvas>` tiene canvas blanco hardcoded

Si no se pasa `theme` prop con `canvas.background`. Construir `ReagraphTheme` dinámico con `useMemo` dep en `resolvedTheme`, extendiendo `lightTheme` base y overridando `canvas.background` / `node.label.color` / `edge.fill` / `arrow.fill`.

## Reagraph en Tauri requiere CSP de 3 canales: `worker-src` + `blob:` en `script-src` + `cdn.jsdelivr.net` en `connect-src` (post-F39)

Reagraph 4.x ([`src/components/graph/KnowledgeGraph.tsx`](../../src/components/graph/KnowledgeGraph.tsx)) tiene 3 canales que el CSP de Tauri bloquea por default. Sintomatología compartida: header `/notes/graph` reporta "N notas · M conexiones" pero canvas vacío. Web (Firebase Hosting sin meta CSP) y Capacitor Android (sin policy) no aplican restricción — bug 100% Tauri-only.

**Canal 1 — Web Workers desde `blob:` URIs.** `graphology-layout-forceatlas2` ([`node_modules/graphology-layout-forceatlas2/helpers.js:251-261`](../../node_modules/graphology-layout-forceatlas2/helpers.js)) crea workers vía `URL.createObjectURL(new Blob([code], {type: 'text/javascript'}))` + `new Worker(objectUrl)`. Aunque el `layoutType` activo (`forceDirected2d`, sync con `d3-force-3d`) no use el supervisor, el código se incluye en el bundle Vite y algún code path lo invoca al montar `<GraphCanvas>`. Síntoma: `Creating a worker from 'blob:http://tauri.localhost/<uuid>' violates Content Security Policy directive: "script-src ...". Note that 'worker-src' was not explicitly set, so 'script-src' is used as a fallback`. Encadenado: `Attribute undefined is not a number for node <noteId>` (Graphology con nodos sin coords).

**Canal 2 — `importScripts()` desde dentro del worker.** Troika-three-text usa `importScripts()` heredado del contexto del worker para cargar módulos JS adicionales. Hereda `script-src` y necesita `blob:`. **Es requisito, no defensivo.**

**Canal 3 — Fetch a CDN de fonts Unicode.** Troika-three-text ([`node_modules/troika-three-text/`](../../node_modules/troika-three-text/)) carga el index de fonts Unicode y archivos OTF/WOFF2 desde `https://cdn.jsdelivr.net/gh/lojjic/unicode-font-resolver@v1.0.1/...` para typesetting de caracteres no cubiertos por la font default (acentos en español, símbolos, emojis). El parámetro `unicodeFontsUrl` permite self-host pero el corpus completo pesa ~300 MB → inviable. Reagraph no expone esta prop al consumer. Síntoma en release (no en dev — Tauri inyecta CSP estricto solo en build): `Connecting to 'https://cdn.jsdelivr.net/...' violates Content Security Policy directive: "connect-src ..."` + `Fetch API cannot load ...` + `THREE.WebGLRenderer: Context Lost`. Las fonts se cachean tras la primera carga en el WebView2 storage, así que offline funciona después.

**Fix completo en [`src-tauri/tauri.conf.json`](../../src-tauri/tauri.conf.json) `app.security.csp`:**

```json
"connect-src": "ipc: http://ipc.localhost ... https://cdn.jsdelivr.net",
"script-src": "'self' 'unsafe-inline' blob: https://apis.google.com",
"worker-src": "'self' blob:"
```

Riesgo de seguridad: `blob:` URIs solo pueden ser creadas por código ya cargado en la página (la app ya tiene `'unsafe-inline'` heredado de F3 Fase 5.1). `cdn.jsdelivr.net` es CDN público confiable y solo se permite `connect-src` (fetch/XHR), no `script-src` ni `frame-src` — surface attack no se amplía.

**Aplica a cualquier futuro upgrade de Reagraph o cambio de lib WebGL** (Sigma.js, deck.gl, regl): los 3 canales son patrones genéricos, no Reagraph-specific. **Antes de validar release Tauri, no confiar solo en dev**: Tauri inyecta nonces y aplica CSP estricto solo en build release (no en dev), y troika cachea fonts entre sesiones — un dev recién levantado puede heredar el cache de un MSI viejo y enmascarar el canal 3.
