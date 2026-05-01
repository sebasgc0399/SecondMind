# UI y componentes

> Canon de gotchas del dominio. Índice ligero en `../ESTADO-ACTUAL.md` § "Gotchas por dominio (índice)".
> Cada gotcha vive como `## <título>`. El slug del título es el anchor estable referenciado desde el índice.
> Consolida UI general + Theme System (D2 SPEC F37).

## Base-UI `@base-ui/react` para Dialog y Popover

Ya en deps, usado en 7+ archivos. Convenciones: `Root/Trigger/Portal/Positioner/Popup` + data-attrs `data-starting-style`/`data-ending-style`. **NO implementar** dropdown manual con useState+click-outside+escape+portal — duplica ~60 líneas ya provistas.

## Base-UI usa `data-open` + `data-starting-style`/`data-ending-style`

NO `data-state` como Radix. Las clases `animate-in`/`animate-out` de `tw-animate-css` no aplican.

## `npx shadcn@latest add <componente>` con style `base-nova` genera Base UI primitives, NO Radix

Confirmado empírico en F18 con `alert-dialog`. `components.json:3` debe seguir con `"style": "base-nova"`. Si en algún futuro `add` produce un archivo con `import { ... } from '@radix-ui/...'`, descartarlo y construir manual sobre los primitives de `@base-ui/react/<componente>` siguiendo el patrón de `button.tsx`.

## `setIsOpen(true) → requestAnimationFrame → focus()` obligatorio para colapsables

Si un handler externo pide expandir + enfocar un disclosure, el input aún no existe en DOM en el mismo tick. Sin rAF, `ref.current` es null.

## Empty state con filtros activos: no hacer early return

Renderizar siempre los controles de filtro y diferenciar mensaje: "sin datos" vs "filtros sin resultados" con botón de reseteo.

## Quick Capture shortcut `Alt+N`

No `Ctrl+Shift+N` que choca con Chrome incógnito. El modal NO tiene selector de tipo/tags/proyecto — todo va al Inbox sin clasificar. Clasificación post-captura (AI o manual).

## Shortcuts globales con modificador: `event.code` (post-F31, universal post-F32.2)

Para cualquier nuevo shortcut global (Cmd/Ctrl+X), el listener debe matchear contra `event.code` (ej. `'KeyB'`, `'KeyK'`, `'KeyN'`), no `event.key.toLowerCase()`. `event.code` representa la tecla física en posición QWERTY equivalente — independiente del layout (Dvorak/AZERTY siguen funcionando); `event.key` representa el carácter producido y cambia con el layout. Los tres shortcuts del repo (Cmd+B sidebar toggle, Cmd+K palette, Alt+N QuickCapture) están migrados. **Guard de `activeElement` es opt-in según colisión con atajos del editor**, NO obligatorio: `useSidebarVisibilityShortcut` lo necesita porque Cmd+B colisiona con bold de TipTap; `CommandPaletteProvider` y `QuickCaptureProvider` no — abrir palette/QuickCapture desde un input es comportamiento esperado. Cuando se necesita, el selector canónico es `'input, textarea, select, [contenteditable=""], [contenteditable="true"]'` (cubre TipTap `.ProseMirror`, inputs nativos, textareas, selects). Patrón vivo en [src/hooks/useSidebarVisibilityShortcut.ts](../../src/hooks/useSidebarVisibilityShortcut.ts) (con guard) y [src/components/layout/CommandPalette.tsx](../../src/components/layout/CommandPalette.tsx) / [src/components/capture/QuickCaptureProvider.tsx](../../src/components/capture/QuickCaptureProvider.tsx) (sin guard, intencional).

## localStorage hint por uid para flags solo-UI con persistencia Firestore que afectan layout (post-F32.4)

Para flags donde el snapshot inicial llega ~100-300ms después de mount y el default de F31-style genera flash visual (sidebarHidden, futuro tema custom, modo focus, layout density, etc.), cachear el último valor en localStorage por uid permite hidratación síncrona pre-primer-onSnapshot. Patrón canónico: helpers `readXHint(uid)` y `writeXHint(uid, value)` con key prefixed por uid (`secondmind:flagName:${uid}`) y try/catch defensivo (private browsing iOS, storage deshabilitado → fallback silencioso al comportamiento sin hint). El hook React lee el hint en el effect de `[user]` ANTES de subscribir, hidrata el state de ese campo específico, y escribe hint en el cb solo cuando `loaded === true` (evita pisar hint válido con DEFAULT pre-snapshot del cache compartido). El AND-gate sobre `prefsLoaded` se REMUEVE para ese campo en consumers — el state ya arranca con el último valor persistido. **Limitación crítica**: solo aplica a flags que NO disparen side-effects pre-snapshot. Flags one-time como `distillIntroSeen` o `distillBannersSeen` NO califican porque marcarían como visto el banner contra hint stale, pisando el valor real al llegar. Sign-out NO limpia el hint (boolean trivial, sin pérdida de privacidad). Trade-off cross-device: hint stale (user cambió en otro device) genera UN flash inverso al llegar snapshot. Patrón vivo en [src/lib/preferences.ts](../../src/lib/preferences.ts) (`readSidebarHiddenHint`/`writeSidebarHiddenHint`) y [src/hooks/usePreferences.ts](../../src/hooks/usePreferences.ts).

## `Intl.DateTimeFormat('es', { weekday: 'narrow' })`

Devuelve "X" para miércoles, no "M". Usar resultado de Intl directamente, no hardcodear array.

## TypeScript infiere el tipo de evento en handlers inline (post React 19)

No hace falta anotar `React.FormEvent` ni importar el type. Patrón canónico: `onSubmit={(event) => { event.preventDefault(); void submit(); }}`.

## `overflow-x-auto` sin `overflow-y-hidden` explícito dispara scrollbar vertical fantasma en Chrome/Edge Windows (post-F15)

La spec CSS computa `overflow-y: auto` implícito cuando `overflow-x` es `auto`/`scroll`, y los navegadores renderean scrollbar vertical "por las dudas" aunque el elemento no tenga overflow real. Fix canónico: siempre parejar `overflow-x-auto overflow-y-hidden` en elementos cuyo único scroll intencional es horizontal (tabs, chips, carruseles). Aplica a cualquier `<nav>` o contenedor scrolleable del proyecto. Patrón vivo en [src/app/tasks/page.tsx:109](../../src/app/tasks/page.tsx#L109).

## Copy UI en imperativo neutro (post-F15)

El proyecto usa imperativo neutro (`Crea`, `Revisa`, `Escribe`, `Intenta`), NO voseo rioplatense (`Creá`, `Revisá`, `Escribí`). Decisión: evita marcar registro regional, forma más estándar en UIs de software en español. Cualquier string UI nueva debe seguir esta convención. Grep guardian: `rg "Creá|Revisá|Escribí|Intentá|Probá|Pegá|Hacé" src/` debe devolver 0 matches. Tildes siempre presentes en palabras básicas (revisión, próxima, aún, conexión, más, ningún, periódica, sincronizarán, mañana, días) — no omitirlas por ASCII compat, el stack ya acepta UTF-8 en todo el pipeline. **`vos` como pronombre tónico también marca rioplatense** (post-F22): frases tipo "explicarle a vos" tienen el mismo efecto que el imperativo voseante aunque el verbo sea neutro. Reemplazar por estructuras universales: "tu yo del futuro" / "te" / "vos mismo" → "vos mismo" todavía es marca; preferir "tú mismo" o reformular sin pronombre tónico. Patrón vivo en [SummaryL3.tsx](../../src/components/editor/SummaryL3.tsx) y [DistillIndicator.tsx](../../src/components/editor/DistillIndicator.tsx) `LEVEL_META[2-3].tip`.

## `useEffect` cleanup compartido entre side-effect y auto-dismiss timer = anti-patrón (post-F22, reconfirmado F28)

Si un componente tiene "show-then-auto-hide" (toast, banner, undo prompt, hover card con fade) **o un latch de status time-based** (badge "✓ Guardado" 1.5s, indicador de copia "✓ Copiado" 2s), poner el `setTimeout` en el mismo `useEffect` que el trigger es trampa: cuando una dep cambia (típicamente porque el side-effect persistió algo y `onSnapshot` actualizó preferences/state, o porque el queue cambió de status), el cleanup cancela el timer antes de que dispare. El badge/banner queda pegado para siempre. Patrón canónico: separar el timer en su propio `useEffect` con dep `[visibleState]` (o `[savedBadgeVisible]`). El cleanup solo corre cuando el state cambia (otro nivel a mostrar) o se desmonta el componente. Aplica a cualquier componente con state pair "trigger-driven" + "auto-cleanup time-based" — F28 confirmó que vale para latches de status del SaveIndicator también, no solo para banners visuales. Patrón vivo en [DistillLevelBanner.tsx](../../src/components/editor/DistillLevelBanner.tsx) (banner) y [useNoteSave.ts](../../src/hooks/useNoteSave.ts) (latch).

## `role="region"` para banners persistentes; `role="status" aria-live="polite"` solo para efímeros (post-F23)

Información persistente (banner accept/dismiss que vive hasta que el user actúe) → `role="region"` + `aria-label`. Notificación efímera (toast 3s, mini-banner de transición) → `role="status" aria-live="polite"`. Si una sugerencia persistente puede aparecer/desaparecer/reaparecer por race onSnapshot (ej. dismiss optimistic local + onSnapshot remoto idempotente con `arrayUnion`), `aria-live` provoca doble anuncio screen reader cada vez que reaparece. Patrón vivo en [EditorSuggestionBanner.tsx](../../src/components/editor/EditorSuggestionBanner.tsx) (region) vs [DistillLevelBanner.tsx](../../src/components/editor/DistillLevelBanner.tsx) (status).

## Optimistic state vive en una sola fuente (hook), no duplicado en componente (post-F23)

Si un hook expone state derivado (ej. `suggestions: Suggestion[]` filtrado por `dismissedSuggestions`) Y también handlers (`accept`/`dismiss`), el `Set<string>` del optimistic local debe vivir DENTRO del hook — no en el componente que lo consume. Razón: dos Sets paralelos (uno en hook, uno en componente) divergen en remounts y reconciliación, dejando sugerencias visibles cuando deberían ocultarse o viceversa. El componente queda stateless en accept/dismiss, solo invoca handlers del hook. Patrón vivo en [src/hooks/useNoteSuggestions.ts](../../src/hooks/useNoteSuggestions.ts) + [EditorSuggestionBanner.tsx](../../src/components/editor/EditorSuggestionBanner.tsx).

## H1 duplicado en mobile oculto con estrategia granular (post-F15)

`MobileHeader` en [src/components/layout/MobileHeader.tsx:36](../../src/components/layout/MobileHeader.tsx#L36) ya renderea `<h1>` sticky con `getPageTitle(pathname)` — las páginas duplicaban el título en un H1 interno. Regla: ocultar el H1 interno con `hidden md:block` (o `md:flex` en flex containers, `md:inline` si está inline con siblings). Si el `<header>` contiene solo el H1, aplicar al wrapper completo; si tiene siblings esenciales para mobile (botones críticos, nav flechas, Links), aplicar solo al H1 y preservar siblings. **Excepciones reconocidas**: Dashboard (`/` con saludo personalizado "Buenas noches, X" — copy distinto del label del nav). `/notes/graph` originalmente asumida como excepción por prefix-match (descartada en el plan) — pero `navItems` en [src/components/layout/Sidebar.tsx:38](../../src/components/layout/Sidebar.tsx#L38) la registra con exact match → devuelve "Grafo". Lección: **verificar `navItems` antes de asumir el label del MobileHeader para cualquier ruta con exact/prefix match ambiguo.** Patrón vivo en las 8 páginas bajo `src/app/*/page.tsx` y `src/app/notes/graph/page.tsx`.

## Anchor scroll en React Router NO es automático (post-F19)

Navegar a `/ruta#anchor` no scrollea al elemento — React Router solo cambia la URL. Implementación canónica en la página destino: `useEffect(() => { if (location.hash !== '#X') return; requestAnimationFrame(() => document.getElementById('X')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }, [location.key, location.hash])`. Dep en **`location.key`, NO solo `.hash`**, para re-trigger en navegaciones repetidas al mismo hash (sino la 2da vez no dispara). `requestAnimationFrame` porque el DOM puede no estar pintado al primer tick post-navigate (`getElementById` devuelve null sino). En la sección target, agregar `scroll-mt-14` para compensar `MobileHeader` sticky de `h-14` (sino el título queda tapado). Aplicable a cualquier deep-link interno con `#anchor` (settings, docs in-app, FAQs futuras). Vivo en [src/app/settings/page.tsx](../../src/app/settings/page.tsx).

## Tap target 44×44 en desktop también

Un solo tamaño facilita lectura y mantiene convención con TaskCard, HabitRow, DistillIndicator (Feature 5).

## Patrón `setState durante render` con state combinado `{ value, key }` para detectar cambios de prop en hooks reutilizables (post-F33)

Cuando un hook reutilizable necesita reaccionar a un cambio de input prop (visible flippea, triggerKey cambia, breakpoint flippea, etc.), el reflejo común es `useEffect` con `[input]` en deps + `useRef<boolean>(true)` para skipear el primer effect post-mount. Pero ese patrón requiere ref auxiliar, corre POST-paint (problemas de timing si el setState es source de una clase de animación pre-paint), y a menudo termina con `eslint-disable react-hooks/set-state-in-effect`. La alternativa idiomática React 19: state combinado `{ ...derived, prevInput }` + check durante render `if (state.prevInput !== input) setState(...)`. React re-ejecuta el render con state nuevo SIN commit intermedio (ver [React docs](https://react.dev/reference/react/useState#storing-information-from-previous-renders)). Skip-initial gratis (en mount `state.prevInput === input` por construcción), pre-paint timing gratis (mismo ciclo del render que dispara el paint), sin ref auxiliar, sin `eslint-disable`. Aplicable a cualquier futuro hook reutilizable que detecte cambios de prop. Patrones vivos: [src/hooks/useExpandThenCollapse.ts:19-38](../../src/hooks/useExpandThenCollapse.ts) (visibility toggle con timeout), [src/hooks/useMountedTransition.ts](../../src/hooks/useMountedTransition.ts) (delay unmount con timeout). Excepción reconocida: `layout.tsx:50` usa `useRef + isInitialMount` inline porque es workaround inline en consumer único, no hook reutilizable.

## `fill-mode-forwards` obligatorio en `animate-out` aplicado vía `cn()` con boolean (post-F33)

`tailwindcss-animate` (base de `tw-animate-css`) no aplica `animation-fill-mode: forwards` por default — el componente revierte a estado inicial al terminar la anim, lo que produce un flash visual de 1 frame antes del unmount post-anim. La utility `fill-mode-forwards` de tw-animate-css resuelve. Aplicable a cualquier futura `animate-out` aplicada vía `cn()` con boolean prop (no `data-*` gating de base-ui que tiene su propio fill-mode handling). F33.1 fue el primer caso del repo de `animate-out` aplicado vía `cn()` con boolean — `alert-dialog.tsx` usa `data-closed:` de base-ui con manejo distinto. Patrón vivo en [src/components/layout/Sidebar.tsx:127](../../src/components/layout/Sidebar.tsx) y [src/components/layout/TopBar.tsx:21](../../src/components/layout/TopBar.tsx).

## Drawer + modal nested: `onClose() + requestAnimationFrame(open)` handshake (post-F34)

Cuando un trigger interno a `NavigationDrawer` (o cualquier `Dialog.Popup` base-ui peer) abre OTRO modal/dialog (CommandPalette, QuickCapture, alert, etc.), abrir el segundo modal directamente coexiste con el drawer abierto: ambos viven en `Dialog.Popup` con `z-50`, último portal stacking gana, pero el drawer queda visible como fondo del nuevo modal — UX confusa. Patrón canónico: cerrar el drawer primero (`onNavigate?.()` o equivalente que dispare `onOpenChange(false)`), luego abrir el siguiente modal en `requestAnimationFrame(() => openX())` para diferir un frame y dejar que la animación de salida del drawer arranque antes del mount. Sin rAF, el setState del unmount drawer y el setState del open modal se baten en el mismo tick → drawer no alcanza a desmontar. Aplica a cualquier futuro entrypoint nested en NavigationDrawer (settings shortcut, share link, AI chat trigger, etc.). Patrón vivo en handlers `handleSearchClick`/`handleCaptureClick` de [src/components/layout/Sidebar.tsx](../../src/components/layout/Sidebar.tsx) (F34.2/F34.3). Detectado proactivamente por Plan agent step 2 SDD antes del primer commit.

## `@custom-variant dark (&:is(.dark *))` NO matchea `<html class="dark">` por sí mismo

Solo descendientes. Usar pattern canónico shadcn `(&:where(.dark, .dark *))`.

## `color-scheme: light/dark` property obligatoria

En `:root`/`.dark`. Sin ella, scrollbars nativos + autocomplete + form controls no respetan el tema (visible en Tauri WebView2 y Capacitor Android).

## Script inline anti-flash en `<head>` antes del `<script type="module">`

Única forma confiable en Vite SPA. Modules se defer-loadean; el script inline ejecuta sincrónicamente durante el parsing. Try-catch defensivo + IIFE para no polucionar global.

## `resolvedTheme` snapshot DEBE leer del DOM

`classList.contains('dark')`, no recomputar de `localStorage + matchMedia`. Elimina drift con el script inline que ya aplicó la clase antes de React mount.

## Custom event `sm-theme-change` para notificación same-tab

`storage` event solo dispara cross-tab. El setter dispatchea el custom event para que `useSyncExternalStore` en el mismo tab reaccione. Patrón generalizable para cualquier hook que persista en localStorage.

## Theme default = `auto`, no `dark`

Pre-F6 la app no tenía `.dark` setter — cambiar default sería cambio impuesto. `auto` respeta `prefers-color-scheme`.

## localStorage del tema es per-plataforma

Capacitor sirve desde `capacitor://localhost` (origen distinto al web deploy). Tauri también. Per-dispositivo es correcto; sync cross-device via Firestore si demanda aparece.

## Tokens `--shadow-modal`, `--background-deep`, `--border-strong`

Varían por tema. `--shadow-modal` reemplaza `shadow-[0_20px_40px_rgba(0,0,0,0.5)]` hardcoded (halo gris elefante en light). Cualquier Dialog/Popup nuevo debe usar estos tokens, no valores hardcoded.
