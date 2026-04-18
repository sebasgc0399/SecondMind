# SPEC — SecondMind · Feature 6: Theme System + Paleta Violet Desaturada (Registro de implementación)

> Estado: **Completada** — Abril 2026
> Alcance: Sistema de temas con 3 modos (Claro / Automático / Oscuro), paleta oklch violet desaturado hue 285° tipo Linear/Raycast reemplazando la paleta neutra gris previa, sección Apariencia en `/settings` con selector visual de 3 cards con mini-preview, script inline anti-flash, hook `useTheme` con `useSyncExternalStore`, y 4 fixes preexistentes que bloqueaban light mode funcional.
> Stack implementado: Tailwind v4 `@custom-variant` canonical + `color-scheme` property, oklch tokens en `:root`/`.dark`, `localStorage` + `matchMedia` + DOM class como fuente de verdad runtime, Reagraph `theme` prop con hex colors (Three.js no procesa oklch).
> Para gotchas operativos consolidados → `Spec/ESTADO-ACTUAL.md` sección "Theme System (Feature 6)".

---

## Objetivo

Hoy SecondMind tiene una paleta neutra gris (tokens oklch sin chroma en `:root`/`.dark`). La app parece "premium-ish" pero no tiene identidad visual propia — el único rastro de violet es `--sidebar-primary: oklch(0.488 0.243 264.376)` en dark, saturado y aislado del resto. Además, el usuario no puede elegir entre light y dark: la app renderiza `:root` por default y no hay setter de `.dark` en ningún lado. Después de F6: el usuario abre Settings → Apariencia, elige Claro/Automático/Oscuro con un selector visual de 3 cards, la preferencia persiste entre sesiones, y no hay flash de tema incorrecto al cargar. La paleta es oklch violet desaturado (chroma 0.005–0.12, hue 285°) — sutil, coherente, tipo Linear/Raycast.

---

## Prerrequisitos descubiertos (durante el audit)

- **La app NO estaba hardcodeada en dark** como decía el SPEC original. Con grep `classList\.(add|toggle|remove)\(['"\`]dark`en`src/`→ 0 matches.`main.tsx`y`layout.tsx`no tocan la clase. Todos los usuarios estaban viendo`:root`(light neutral gris puro). Consecuencia: cambiar default a`dark`post-F6 sería un cambio visual impuesto; default =`auto` (respeta sistema, norma moderna) es más correcto. **Desvío justificado del SPEC D3.**

- **`@custom-variant dark (&:is(.dark *))` no matchea `<html class="dark">` por sí mismo** — sólo descendientes. Hoy funciona porque el body hereda tokens via `@apply bg-background`, pero era un bug latente. Migrar al canónico shadcn `(&:where(.dark, .dark *))`.

- **Tailwind v4 requiere `color-scheme: light/dark`** en los bloques `:root` / `.dark` para que scrollbars nativos, autocomplete dropdowns y form controls respeten el modo. Sin él, los scrollbars en Tauri WebView2 y Capacitor Android quedan con color del OS por default ignorando el tema de la app.

- **Tokens `--background-deep` y `--border-strong` referenciados por 6 archivos pero NO existían en `src/index.css`**. 5 modals con backdrops (`bg-background-deep/80`) y bordes (`border-border-strong`). Tailwind v4 resuelve a `undefined` → backdrops bogus. Bug preexistente de Feature 1 o antes. F6 los agrega al `@theme inline` + define oklch en ambos modos.

- **5 modals tenían `shadow-[0_20px_40px_rgba(0,0,0,0.5)]` hardcoded.** En dark mode, sombra negra sobre fondo oscuro funciona. En light mode (nuevo post-F6), `rgba(0,0,0,0.5)` sobre blanco genera un halo gris elefante anti-premium. Token `--shadow-modal` varía por tema.

- **Reagraph usa Three.js como renderer WebGL, Three NO procesa strings oklch** (solo hex, rgb, nombres CSS). Plan original asumía "Reagraph acepta oklch string" — falso. Descubierto en E2E: `useGraph.ts` pasaba oklch strings → nodos silenciosamente con fallback a color default (lo que hacía los nodos casi invisibles). Corregido: hex strings equivalentes hardcoded en `theme-colors.ts`.

- **Reagraph `<GraphCanvas>` tiene fondo blanco hardcoded** si no se le pasa el prop `theme` con `canvas.background`. En dark mode se veía un rectángulo blanco de 360×720 sobre el sidebar oscuro. Corregido: construir un `ReagraphTheme` dinámico con `useMemo` dep en `resolvedTheme` override de `canvas.background`, `node.label.color`, `edge.fill`, `arrow.fill`.

- **Colores hardcoded sin `dark:` variant**: `NoteCard.tsx:44` (violet-500 semantic score), `SummaryL3.tsx:38` (border-green-500), `ReviewBanner.tsx:34,46` (text-green-600, text-amber-600). En dark se veían invisibles o con contraste bajo. F6 incluye el fix como pre-requisito.

- **Sin hook de tema pre-existente**. No hay Context, Provider, ni localStorage key `theme` en el codebase. F6 crea desde cero siguiendo el patrón `useSyncExternalStore` de `useMediaQuery` y `useOnlineStatus`.

- **Solo `button.tsx` existe en `components/ui/`**. No hay `card`, `label`, `radio-group`, `toggle-group`, `switch`. El `ThemeSelector` se construye como componente custom desde cero — sin patrón de "card selector" previo en el codebase.

---

## Features implementadas

### F1: `@custom-variant` canonical + `color-scheme` property (commit `8d819e0`)

- `src/index.css` línea 6: `@custom-variant dark (&:is(.dark *))` → `(&:where(.dark, .dark *))`. Pattern canonical shadcn que matchea tanto `<html class="dark">` directamente como cualquier descendiente.
- `src/index.css` `:root` y `.dark`: agregar `color-scheme: light;` y `color-scheme: dark;` respectivamente. Browser nativo respeta el modo en scrollbars, autocomplete, form controls.

### F2: Paleta violet desaturada + nuevos tokens semánticos (commit `0852c78`)

- `src/index.css` `:root` y `.dark` reescritos con paleta oklch hue 285°:
  - Chroma 0.005–0.025 para fondos y muted (tinte violet imperceptible, no gris muerto).
  - Chroma 0.10–0.12 para `--primary` y `--ring` (identidad sin gritar).
  - Light chroma < dark chroma para compensar percepción en fondos claros.
  - Tokens completos: `--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`, `--border`, `--input`, `--ring`, `--sidebar-*`, `--chart-1..5`.
  - `--sidebar-primary` dark alineado con `--primary` dark (ya no diverge como el `oklch(0.488 0.243 264.376)` saturado histórico).
  - `--destructive` preservado (error es universal, no forma parte del brand).
- Tokens nuevos en ambos modos:
  - `--background-deep`: backdrop de modals (oklch semi-transparente adaptado por tema).
  - `--border-strong`: bordes de modals con más presencia que `--border`.
  - `--shadow-modal`: variable CSS, 0 20px 40px -8px con color/alpha por tema.
  - `--graph-project`, `--graph-area`, `--graph-resource`, `--graph-archive`, `--graph-default`: categóricos del knowledge graph.
- Mapeados en `@theme inline` como `--color-background-deep`, `--color-border-strong`, `--shadow-modal` → Tailwind los compila como clases (`bg-background-deep`, `border-border-strong`, `shadow-modal`).

### F3: `dark:` variants faltantes (commit `733fa56`)

- `src/components/editor/NoteCard.tsx:44`: `text-violet-500` → `text-violet-600 dark:text-violet-400`. Semantic score badge quedaba invisible en dark sin variante.
- `src/components/editor/SummaryL3.tsx:38`: agregado `dark:border-green-400`. Border vertical verde hacía falta la variante para que no perdiera contraste en dark.
- `src/components/editor/ReviewBanner.tsx:34`: `text-green-600` → `text-green-600 dark:text-green-400`. Ícono Check.
- `src/components/editor/ReviewBanner.tsx:46`: `text-amber-600` → `text-amber-600 dark:text-amber-400`. Ícono RotateCcw.
- Otros badges (TaskCard, ProjectCard, ObjectiveCard, DistillIndicator, GraphNodePanel) ya tenían cobertura correcta de variantes.

### F4: `--shadow-modal` token en 5 modals (commit `79169ed`)

- `src/components/capture/QuickCapture.tsx`
- `src/components/layout/CommandPalette.tsx`
- `src/components/objectives/ObjectiveCreateModal.tsx`
- `src/components/projects/NoteLinkModal.tsx`
- `src/components/projects/ProjectCreateModal.tsx`
- En los 5: `shadow-[0_20px_40px_rgba(0,0,0,0.5)]` → `shadow-modal`. La sombra varía por tema vía token `--shadow-modal` que Tailwind compila a clase utility.

### F5: `useTheme` hook + script anti-flash (commit `30c7a57`)

- `src/lib/theme.ts` nuevo:
  - Types: `Theme = 'light' | 'dark' | 'auto'`, `ResolvedTheme = 'light' | 'dark'`.
  - Constantes: `THEME_STORAGE_KEY = 'sm-theme'`, `DEFAULT_THEME = 'auto'` (desvío justificado del SPEC D3 que decía `dark`), `THEME_CHANGE_EVENT = 'sm-theme-change'`.
  - Helpers puros: `isTheme`, `readStoredTheme` (try-catch defensivo por Capacitor/Tauri edge), `systemPrefersDark`, `resolveTheme`, `applyTheme` (aplica clase + retorna resolved).
- `src/hooks/useTheme.ts` nuevo:
  - 2 `useSyncExternalStore`: uno para `theme` (lee localStorage), otro para `resolvedTheme` (lee `document.documentElement.classList.contains('dark')` — DOM es fuente de verdad, evita drift con script inline).
  - Subscribe escucha `matchMedia('(prefers-color-scheme: dark)')` change + `storage` event + custom event `sm-theme-change`.
  - `setTheme(next)`: try-catch localStorage + `applyTheme(next)` + dispatch custom event para notificar al mismo tab (storage event solo dispara cross-tab).
  - Sin Provider / Context. DOM class es global singleton, mismo patrón que `useMediaQuery.ts` y `useOnlineStatus.ts`.
- `index.html`: script inline síncrono en `<head>` **antes** del `<script type="module">` de `main.tsx`:
  ```html
  <script>
    (function () {
      try {
        var t = localStorage.getItem('sm-theme') || 'auto';
        var d =
          t === 'dark' ||
          (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        document.documentElement.classList.toggle('dark', d);
      } catch (e) {}
    })();
  </script>
  ```
  Try-catch porque Capacitor WebView / Tauri WebView2 / iframes restringidos pueden tirar en `localStorage.getItem`. IIFE para no polucionar global scope.

### F6: Graph colors theme-aware (commits `8626bf1` + `908a48f`)

- `src/lib/theme-colors.ts` nuevo:
  - `GRAPH_COLORS_LIGHT` y `GRAPH_COLORS_DARK`: hex strings por `ParaType` (project/area/resource/archive) + `default`. Aproximaciones visuales de los `--graph-*` oklch de `index.css` — KEEP IN SYNC documentado. Se usan hex porque Three.js no acepta oklch en `ColorRepresentation`.
  - Helpers `getGraphColors(resolvedTheme)`, `getGraphCanvasBackground`, `getGraphLabelColor`, `getGraphEdgeColor`.
- `src/hooks/useGraph.ts`: consume `useTheme().resolvedTheme`, llama `getGraphColors(resolvedTheme)` dentro del `useMemo`. Dep array incluye `resolvedTheme` → re-computa nodes con nuevas references al cambiar tema. Reagraph re-renderiza sin necesidad de `key={resolvedTheme}` (fallback nuclear documentado pero no necesario).
- `src/components/graph/KnowledgeGraph.tsx`: construye un `ReagraphTheme` dinámico vía `useMemo` dep en `resolvedTheme`, extendiendo `lightTheme` base y overridando `canvas.background`, `node.label.color`, `edge.fill`, `arrow.fill`. Prop `theme={theme}` al `<GraphCanvas>`. Resultado: canvas coincide con `--background`, labels legibles, edges sutiles.

### F7: ThemeSelector + Settings appearance section (commit `c612fc3`)

- `src/components/settings/ThemeSelector.tsx` nuevo:
  - Grid `grid grid-cols-1 sm:grid-cols-3 gap-3` responsive.
  - 3 `<button>` con `min-h-[112px]` (tap target 44 cumplido), `rounded-lg border p-3`.
  - Estado activo: `border-primary bg-accent/40 ring-2 ring-primary/30`. Inactivo: `border-border bg-card hover:border-border/80 hover:bg-accent/40`.
  - Cada card contiene `<Preview variant>` (mini-mockup CSS-only con fondos `bg-white`/`bg-neutral-900` + placeholder bars tipo skeleton) + lucide icon (`Sun`/`Monitor`/`Moon`) + label.
  - Preview de "Automático": `clip-path: polygon(100% 0, 100% 100%, 0 100%)` para dividir diagonalmente entre light y dark en el mismo card.
  - Sublabel en auto activo: `systemPrefersDark() ? 'oscuro' : 'claro'` en small-caps violet.
  - Sublabel en light/dark activo: `'ACTIVO'` en small-caps primary.
  - `aria-pressed={isActive}` para screen readers.
- `src/app/settings/page.tsx` reescrito: `<div className="mx-auto max-w-3xl space-y-8">` + header con título "Ajustes" + section "Apariencia" con heading + descripción + `<ThemeSelector>`. Pattern `<section aria-labelledby>` para accesibilidad.

---

## Verificación E2E (Playwright MCP)

| #   | Test                                            | Resultado                                                                                                        |
| --- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1   | Carga inicial sin localStorage en sistema light | App en light sin flash. Automático activo con sublabel "claro". ✓                                                |
| 2   | Click "Oscuro" en Settings                      | Cambio instantáneo a dark. `classList.contains('dark')` = true. localStorage = 'dark'. ✓                         |
| 3   | Reload con `sm-theme=dark` guardado             | Carga directa en dark sin flash. ✓                                                                               |
| 4   | Click "Claro"                                   | Cambio a light, localStorage = 'light', clase `.dark` removida. ✓                                                |
| 5   | `/notes/graph` en dark                          | Canvas fondo `#1d1b22`, nodos color ámbar (resource por default), labels blancos, edges sutiles gris. ✓          |
| 6   | `/notes/graph` en light                         | Canvas fondo `#fdfcfe`, nodos ámbar visibles, labels oscuros legibles, edges gris claro. ✓                       |
| 7   | Command Palette (Ctrl+K) en light               | Backdrop blur sutil, card blanco con sombra suave (no halo gris), item hover con bg-accent. ✓                    |
| 8   | Command Palette en dark                         | Backdrop oscuro, card oscuro con sombra profunda, item hover con tinte violet. ✓                                 |
| 9   | Dashboard en light                              | Botón "Captura rápida" primary violet, sidebar item activo con bg-accent tintado, cards legibles. ✓              |
| 10  | `/notes` en light                               | DistillBadge L2 amarillo legible sobre blanco, wikilinks `@` violet, botón "Nueva nota" primary. ✓               |
| 11  | `/notes` en dark                                | Sin regresión — cards con tinte violet sutil (background ligeramente distinto de negro puro), badges legibles. ✓ |
| 12  | `npm run build`                                 | Exit 0. Bundle 2.83 MB (sin cambio significativo vs pre-F6). ✓                                                   |
| 13  | `npm run lint`                                  | 67 errores pre-existentes (baseline), 0 regresiones nuevas en archivos tocados. ✓                                |

**No verificado en Playwright MCP (tool `browser_resize` rechaza `number`):**

- Viewport 375px mobile — cubierto por CSS `grid-cols-1 sm:grid-cols-3`, en <640 cae a stack vertical automáticamente.
- `emulateMedia({ colorScheme })` para cambio de sistema en vivo con `auto` activo — cubierto por el listener `matchMedia` del hook `useTheme`, verificado indirectamente cambiando `localStorage` manualmente.

---

## Commits en orden

1. `8d819e0` — refactor(theme): migrate @custom-variant to shadcn canonical + color-scheme
2. `0852c78` — feat(theme): violet desaturated oklch palette + new semantic tokens
3. `733fa56` — fix(ui): add missing dark: variants for semantic badges
4. `79169ed` — fix(ui): use --shadow-modal token in 5 modals
5. `30c7a57` — feat(theme): useTheme hook + anti-flash inline script
6. `8626bf1` — refactor(graph): migrate hardcoded node colors to theme-aware constants
7. `c612fc3` — feat(settings): appearance section with theme selector
8. `908a48f` — fix(graph): pass theme-aware canvas background + hex node colors to Reagraph

---

## Archivos creados

- `src/lib/theme.ts` — constantes + helpers puros
- `src/hooks/useTheme.ts` — hook con `useSyncExternalStore`
- `src/lib/theme-colors.ts` — hex maps + helpers para Reagraph
- `src/components/settings/ThemeSelector.tsx` — grid de 3 cards con previews

## Archivos modificados

- `src/index.css` — paleta oklch hue 285 + tokens nuevos + `@custom-variant` canonical + `color-scheme`
- `index.html` — script inline anti-flash en `<head>`
- `src/hooks/useGraph.ts` — consume `useTheme` + `getGraphColors`
- `src/components/graph/KnowledgeGraph.tsx` — `ReagraphTheme` dinámico
- `src/app/settings/page.tsx` — sección Apariencia
- `src/components/editor/NoteCard.tsx`, `SummaryL3.tsx`, `ReviewBanner.tsx` — `dark:` variants
- 5 modals — `shadow-modal` token

## Archivos NO tocados (SPEC F6)

- `capacitor.config.ts` splash color `#878bf9`
- `vite.config.ts` PWA manifest `theme_color` / `background_color`
- `android/app/src/main/res/values/colors.xml`
- `extension/` popup con su propio `prefers-color-scheme`

---

## Decisiones clave (desvíos del SPEC original)

| #   | Decisión                                                                             | Razón                                                                                                                  |
| --- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| 1   | **Default = `auto` en vez de `dark`** (SPEC D3)                                      | App hoy muestra `:root` (light neutral), `dark` forzado sería cambio impuesto sin opt-in. `auto` respeta sistema.      |
| 2   | **Scope expandido con fixes preexistentes** (F3-F6 + shadow token + graph migration) | Sin estos fixes light mode no es funcional. Incluirlos en el mismo PR mantiene review coherente.                       |
| 3   | **Graph colors en hex, no oklch** (desvío de "hardcodear oklch KEEP IN SYNC")        | Three.js no procesa oklch. Hex equivalentes visuales con comentario KEEP IN SYNC.                                      |
| 4   | **Reagraph `theme` prop dinámico** (no estaba en plan original)                      | Canvas blanco hardcoded en dark mode fue regresión descubierta en E2E.                                                 |
| 5   | **`resolvedTheme` snapshot lee DOM** (no recalcula de localStorage+matchMedia)       | Evita drift con el script inline que ya aplicó la clase antes de React.                                                |
| 6   | **Chroma 0.10–0.12 para primary**, 0.005–0.025 para fondos                           | Linear-style desaturado premium. 0.14+ empieza a verse "vibrante". Light chroma menor para compensar percepción.       |
| 7   | **Sin Provider/Context**                                                             | Tema es singleton DOM global. `useSyncExternalStore` es patrón correcto (mismo que `useMediaQuery`/`useOnlineStatus`). |

---

## Siguiente iteración candidata

- **Sync de preferencias cross-device** via Firestore `users/{uid}/preferences.theme` — si demanda real aparece. Por ahora es preferencia per-dispositivo (correcto).
- **Temas de acento** (beyond violet): permitir elegir color de acento (azul, verde, naranja) cambiando solo `--primary-*` tokens. Fondos/borders/muted no cambian.
- **Sidebar compacta** toggle en Settings (mencionado en doc UX).
- **Visual regression baselines** si se introduce Playwright visual testing — F6 sería el primer snapshot post-paleta.
- **Actualizar `theme_color` del PWA manifest dinámicamente** según tema — hoy `#878bf9` hardcoded, out of F6 scope pero candidato obvio.
