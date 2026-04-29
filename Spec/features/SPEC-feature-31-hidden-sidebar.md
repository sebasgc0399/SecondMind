# SPEC F31 — Hidden sidebar mode

> Estado: Pendiente
> Branch: `feat/hidden-sidebar`
> Alcance: solo desktop (≥1024px). Tablet (`w-16` collapsed) y mobile (drawer) sin cambios.
> Patrón base: `UserPreferences` (F22 pattern) + extensión de `QUICK_ACTIONS` + monto condicional Sidebar/TopBar en layout.

## Objetivo

Permitir al usuario ocultar completamente el sidebar en desktop para maximizar el área de trabajo, conservando la navegación y la captura rápida vía un TopBar minimalista, el shortcut ⌘B/Ctrl+B, y el Command Palette enriquecido. La preferencia persiste cross-device en `users/{uid}/settings/preferences.sidebarHidden`. Tablet y mobile quedan idénticos — la decisión solo afecta el chrome de desktop.

## Pre-requisitos / patrones canónicos a reusar

| Patrón                          | Path canónico                                                                         | Cómo se usa en F31                                                                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preferences en Firestore        | `src/types/preferences.ts` + `src/lib/preferences.ts` + `src/hooks/usePreferences.ts` | Agregar `sidebarHidden: boolean` siguiendo el shape de `distillIntroSeen`: campo en type → guard en `parsePrefs` → setter directo `setPreferences(uid, { sidebarHidden })` |
| QUICK_ACTIONS extensible        | `src/components/layout/CommandPalette.tsx:49-54`                                      | Sumar 4 items al array (Dashboard, Hábitos, Objetivos, Settings). `getItemUrl` ya soporta `{ kind: 'action' }` sin cambio                                                  |
| Shortcut global keydown         | Patrón inline en `CommandPaletteProvider` (`CommandPalette.tsx:21-30`)                | Replicar `useEffect` con `window.addEventListener('keydown')` para ⌘/Ctrl+B. Guard en `document.activeElement` para no chocar con TipTap bold                              |
| Settings selector               | `src/components/settings/TrashAutoPurgeSelector.tsx` + `ThemeSelector.tsx`            | 2 botones-cards con `aria-pressed`, hook `usePreferences()`, `setPreferences(uid, ...)`. Sección `<section>` en `settings/page.tsx` con header `h2 + p`                    |
| Layout condicional desktop-only | `src/app/layout.tsx:49-56` (`!isMobile && <Sidebar/>`)                                | Extender condición: `showSidebar = !isMobile && !(breakpoint === 'desktop' && sidebarHidden)`. `<TopBar/>` solo cuando `breakpoint === 'desktop' && sidebarHidden`         |
| `<kbd>` para shortcut hint      | `src/components/dashboard/QuickCaptureButton.tsx:14-16`                               | Replicar para "Buscar ⌘K" en TopBar                                                                                                                                        |

Labels canónicos de navegación viven en `src/components/layout/navItems.ts` — usar tal cual ("Dashboard", "Hábitos", "Objetivos", etc.) y los iconos lucide ya importados ahí.

## Sub-features

### F31.1 — Pref `sidebarHidden` en `UserPreferences`

**Qué:** Agregar campo booleano persistido cross-device en `users/{uid}/settings/preferences`.

**Criterio de done:**

- [ ] `UserPreferences.sidebarHidden: boolean` en `src/types/preferences.ts`
- [ ] `DEFAULT_PREFERENCES.sidebarHidden = false`
- [ ] `parsePrefs(data)` retorna `sidebarHidden: data?.sidebarHidden === true` (defensive coercion como `distillIntroSeen`)
- [ ] Tests unitarios en `src/lib/preferences.test.ts` cubren: default false cuando el doc no existe, true cuando data trae literal `true`, false cuando data trae truthy no-boolean (string, number)
- [ ] `npm test` verde

**Archivos a tocar:**

- `src/types/preferences.ts` — campo + DEFAULT
- `src/lib/preferences.ts` — guard en `parsePrefs`
- `src/lib/preferences.test.ts` — 3 tests nuevos

**Notas:** Sin helper específico (a diferencia de `markDistillBannerSeen`). Boolean simple → `setPreferences(uid, { sidebarHidden: value })` directo.

---

### F31.2 — Enriquecer `QUICK_ACTIONS` del CommandPalette

**Qué:** Sumar 4 destinos faltantes para que el palette cubra TODA la nav lateral cuando el sidebar esté oculto.

**Criterio de done:**

- [ ] Array `QUICK_ACTIONS` incluye 8 entries: Dashboard (`/`), Notas (`/notes`), Tareas (`/tasks`), Proyectos (`/projects`), Inbox (`/inbox`), Hábitos (`/habits`), Objetivos (`/objectives`), Settings (`/settings`)
- [ ] Cada entry usa el icon canónico correspondiente de `navItems.ts` (`LayoutDashboard`, `Repeat`, `Target`, `Settings` agregados a los imports de `CommandPalette.tsx`)
- [ ] Labels coinciden literal con `navItems.ts` ("Dashboard", "Hábitos", "Objetivos", "Settings"). Mantener "Ir a Inbox" si Sebastián considera que el verbo agrega claridad — opcional armonizar a sólo "Inbox" para consistencia con el resto
- [ ] Verificación manual: Cmd+K sin query → sección "Acciones" lista las 8 entradas; Enter en cada una navega correctamente

**Archivos a tocar:**

- `src/components/layout/CommandPalette.tsx` — extender `QUICK_ACTIONS` (~líneas 49-54), sumar imports `LayoutDashboard, Repeat, Target, Settings` de `lucide-react`

**Notas:** Excluido `Grafo` (`/notes/graph`) por ser vista secundaria de Notas — sumar si surge demanda. `getItemUrl` ya maneja `kind: 'action'` sin cambios.

---

### F31.3 — Componente `TopBar` minimalista

**Qué:** Componente nuevo `src/components/layout/TopBar.tsx` que sustituye visualmente al sidebar cuando hidden=true.

**Criterio de done:**

- [ ] Renderiza barra horizontal `h-12` (o equivalente acordado en design) con `border-b border-sidebar-border bg-sidebar`
- [ ] Izquierda: logo "SecondMind" como `<Link to="/">` con icono (sugerido `Brain` o coherente con el branding del repo si existe asset)
- [ ] Derecha (orden L→R): `<PendingSyncIndicator compact />` + botón "Buscar ⌘K" + `<QuickCaptureButton />`
- [ ] `<PendingSyncIndicator compact />` reusa la prop `compact` ya soportada por el componente desde F30 (chip 44×44 con dot + tooltip vía `title`). Paridad funcional con el indicator del sidebar — el feedback de writes pendientes no se pierde en hidden mode
- [ ] Botón "Buscar ⌘K" llama `useCommandPalette().open()`. `<kbd>⌘K</kbd>` hardcoded (paridad con `Alt+N` de QuickCaptureButton)
- [ ] `<QuickCaptureButton />` reusado tal cual (sin variante específica TopBar)
- [ ] No accept de props que dependan del breakpoint — el monto condicional vive en `layout.tsx`
- [ ] Estilos coherentes con el sidebar (mismo `bg-sidebar` y `text-sidebar-foreground`) para sensación de continuidad visual al toggear

**Archivos a tocar:**

- `src/components/layout/TopBar.tsx` — nuevo

**Notas:** TopBar siempre `w-full` del content area (sin sidebar a la izquierda en hidden mode). No reusa `MobileHeader` porque éste tiene hamburger + título dinámico de página + lógica de drawer; TopBar es una silueta distinta. Orden L→R en la derecha justifica jerarquía visual: indicator es status pasivo (visible solo cuando hay writes pendientes), Buscar es CTA secundario, Captura es CTA primario.

---

### F31.4 — Monto condicional Sidebar / TopBar en layout

**Qué:** Modificar `src/app/layout.tsx` para que en `desktop + sidebarHidden=true` se monte `<TopBar/>` en lugar del `<Sidebar/>`.

**Criterio de done:**

- [ ] Layout consume `usePreferences()` y deriva: `showSidebar = !isMobile && !(breakpoint === 'desktop' && preferences.sidebarHidden)`, `showTopBar = breakpoint === 'desktop' && preferences.sidebarHidden && isLoaded`
- [ ] `<Sidebar/>` se monta solo cuando `showSidebar`
- [ ] `<TopBar/>` se monta dentro de `<div className="flex flex-1 flex-col overflow-hidden">` ANTES del `<main>` cuando `showTopBar`
- [ ] Pre-snapshot (`isLoaded === false`) → tratar `sidebarHidden` como `false` (mostrar sidebar). Evita flash sidebar→TopBar al cargar
- [ ] Tablet sigue rindiendo `<Sidebar collapsed={true} />` igual (sin cambios)
- [ ] Mobile sigue rindiendo `MobileHeader + NavigationDrawer + BottomNav + FAB` igual (sin cambios)
- [ ] El `QuickCaptureButton` del Dashboard (`src/app/page.tsx:16-18`) NO se duplica visualmente cuando `showTopBar=true`. Default decidido: ocultarlo via `usePreferences()` en `page.tsx` con un guard simple `{!showTopBar && <QuickCaptureButton/>}`. Aceptar 1 línea de coupling antes que 2 botones idénticos visibles
- [ ] Resize mid-sesión (desktop ↔ tablet ↔ mobile) re-monta correctamente: el hook `useBreakpoint()` ya emite reactivo via `matchMedia` listeners

**Archivos a tocar:**

- `src/app/layout.tsx` — wiring condicional, importar TopBar, consumir usePreferences
- `src/app/page.tsx` — gate del `QuickCaptureButton` del Dashboard cuando hidden mode (mismo patrón `usePreferences().preferences.sidebarHidden`)

**Notas:** El gate de `QuickCaptureButton` en page.tsx es la mejor opción analizada vs. mover el botón al TopBar y eliminarlo del Dashboard — la segunda opción rompe la consistencia visual del Dashboard cuando el sidebar está visible. Mantener el botón en ambos lugares con gate condicional preserva el header del Dashboard.

---

### F31.5 — Shortcut ⌘B/Ctrl+B toggle sidebar

**Qué:** Hook nuevo `useSidebarVisibilityShortcut` con listener global de keydown que toggea `sidebarHidden`.

**Criterio de done:**

- [ ] Hook nuevo `src/hooks/useSidebarVisibilityShortcut.ts` con `useEffect` que monta `window.addEventListener('keydown', ...)`
- [ ] Match: `(event.metaKey || event.ctrlKey) && event.code === 'KeyB' && !event.shiftKey && !event.altKey`. `event.code` es independiente del layout físico (Dvorak/AZERTY siguen funcionando), a diferencia de `event.key`
- [ ] Guard 1 (foco): `document.activeElement?.matches('input, textarea, select, [contenteditable=""], [contenteditable="true"]')` → skip (no `preventDefault`, no toggle). Cubre TipTap (`.ProseMirror` tiene `contenteditable="true"`), search inputs, QuickCapture textarea, selects. `'select'` agregado por consistencia con el guard de `inbox/process/page.tsx`
- [ ] Guard 2 (auth): `if (!user) return` antes del `setPreferences` — el hook puede ejecutarse antes que `useStoreInit` complete; sin sesión no debemos llamar `setPreferences(user.uid, ...)` (uid undefined)
- [ ] Guard 3 (breakpoint): solo dispara cuando `breakpoint === 'desktop'`. En tablet/mobile el shortcut es no-op
- [ ] Tras pasar guards: `event.preventDefault()` + llama `setPreferences(user.uid, { sidebarHidden: !current })`
- [ ] Hook montado una sola vez en `src/app/layout.tsx` (después de `useStoreInit`)
- [ ] Verificación manual: con foco fuera del editor, ⌘B alterna sidebar/TopBar. Con foco DENTRO del editor TipTap, ⌘B aplica bold y NO toggea el sidebar

**Archivos a tocar:**

- `src/hooks/useSidebarVisibilityShortcut.ts` — nuevo
- `src/app/layout.tsx` — invocar el hook

**Notas:** Cmd+B en TipTap está mapeado a `toggleBold()` por el keymap default de `@tiptap/starter-kit`. El guard de `activeElement` evita la intercepción. Sin el guard, el sidebar toggea Y el bold se aplica simultáneamente — comportamiento confuso aún si "funciona" técnicamente.

---

### F31.6 — Selector "Visibilidad del sidebar" en Settings

**Qué:** Sección nueva en `/settings` con 2 botones-cards (Visible / Oculto) que controla `sidebarHidden`. Sólo visible en desktop.

**Criterio de done:**

- [ ] Componente nuevo `src/components/settings/SidebarVisibilitySelector.tsx` siguiendo el shape de `TrashAutoPurgeSelector.tsx` (`grid grid-cols-1 sm:grid-cols-2 gap-3`, cards con `aria-pressed`, `min-h-[100px]`, ring activo)
- [ ] 2 opciones: "Visible" (`sidebarHidden=false`) y "Oculto" (`sidebarHidden=true`)
- [ ] Cada card incluye descripción breve: visible → "El menú lateral aparece en pantallas grandes", oculto → "Maximiza espacio. Usá Cmd/Ctrl+B o Cmd/Ctrl+K para navegar"
- [ ] Iconos lucide (sugerido `PanelLeft` para visible, `PanelLeftClose` para oculto)
- [ ] Click usa `setPreferences(uid, { sidebarHidden: value })` con guard `if (!user || value === current) return` (mismo patrón que `TrashAutoPurgeSelector:26`)
- [ ] Sección renderizada en `src/app/settings/page.tsx` con `<header>` análoga a las otras (h2 "Visibilidad del menú" + p descriptiva mencionando que aplica a desktop)
- [ ] Sección sólo visible en desktop: wrapper `hidden lg:block` en el `<section>`. En tablet/mobile la sección no aparece — el selector no aplica visualmente

**Archivos a tocar:**

- `src/components/settings/SidebarVisibilitySelector.tsx` — nuevo
- `src/app/settings/page.tsx` — importar y renderizar (probablemente entre Apariencia y Papelera, o al final antes de `AppInfoSection`)

**Notas:** `hidden lg:block` en Tailwind matchea el breakpoint `≥1024px` que coincide con desktop según `src/lib/breakpoints.ts`. Si el threshold canónico cambia en el futuro, esta sección lo seguirá vía la utility class — coherente.

---

## Orden de implementación

Orden refinado tras step 2 SDD (Plan agent priorizó camino crítico + facilidad de testing):

1. **F31.1** (pref `sidebarHidden`) — cimiento. Todas las demás dependen.
2. **F31.3** (TopBar) — componente standalone, mountable visual antes del wiring. Incluye `<PendingSyncIndicator compact />` + `<QuickCaptureButton />` + botón Buscar.
3. **F31.4** (layout condicional) — combina F31.1 + F31.3. Primer momento donde "hidden mode" funciona end-to-end. Sin toggle UI todavía: prueba manual editando Firestore o devtools.
4. **F31.6** (Settings selector) — provee toggle UI estable para validar F31.4 sin necesitar el shortcut. Reordenado antes de F31.5: testear F31.4 con el selector es más predecible que con el shortcut + 4 guards.
5. **F31.5** (shortcut ⌘B) — depende de F31.1. Implementado al final permite verificar que los guards (TipTap, activeElement, auth, breakpoint) funcionan con el flujo ya estable.
6. **F31.2** (CommandPalette enriched) — al final. NO bloquea camino crítico ni QA visual de hidden mode: los 4 destinos faltantes (Dashboard, Hábitos, Objetivos, Settings) son accesibles por URL directa durante el dev. Sumarlos al final completa la cobertura de fallback de navegación.

## Decisiones cerradas pre-codeo

| ID  | Decisión                                                                                                                                                                   | Por qué                                                                                                                                                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Sólo desktop (≥1024px). Tablet/mobile no afectados.                                                                                                                        | Tablet ya tiene su solución (`w-16` collapsed + drawer expandible). Mobile ya tiene drawer + bottom nav + FAB. Hidden mode resuelve un gap específico de desktop.                                                            |
| D2  | Persistencia en `UserPreferences` (Firestore), no localStorage.                                                                                                            | Cross-device. Patrón ya establecido en F22 (`distillIntroSeen`). Boolean simple no justifica fragmentar persistencia.                                                                                                        |
| D3  | TopBar nuevo en lugar de reusar `MobileHeader`.                                                                                                                            | `MobileHeader` tiene hamburger + título dinámico + lógica de drawer. TopBar minimalista (logo + buscar + captura) es otra silueta. Reuso forzaría flags y prop bloat.                                                        |
| D4  | Shortcut ⌘B con guard de `activeElement`.                                                                                                                                  | TipTap mapea Mod+B a bold cuando el editor tiene foco. Guard preserva el bold y solo capta el toggle si el foco está en el chrome.                                                                                           |
| D5  | `QUICK_ACTIONS` extendido in-array (hardcoded), no sistema extensible.                                                                                                     | F22-F30 nunca pidieron extensibilidad runtime. Hardcoded es 4 entries. Refactor a registry si surge demanda real (plugins). Fuera de scope.                                                                                  |
| D6  | Settings selector con 2 cards (Visible / Oculto), no toggle switch.                                                                                                        | Paridad visual con `TrashAutoPurgeSelector` y `ThemeSelector`. Switch boolean rompe el patrón "selector de cards" del repo.                                                                                                  |
| D7  | `usePreferences().isLoaded === false` → tratar `sidebarHidden` como false.                                                                                                 | Conservar default "sidebar visible" pre-snapshot evita flash de TopBar→Sidebar al cargar. Mismo principio que F22 (banners no disparan pre-isLoaded).                                                                        |
| D8  | `QuickCaptureButton` montado en TopBar cuando `sidebarHidden=true` (visible global). En Dashboard, gate `{!sidebarHidden && <QuickCaptureButton/>}` para evitar duplicado. | Cubre ambos modos sin duplicación: con sidebar visible el botón vive en el header del Dashboard como hoy; con sidebar oculto el botón vive en el TopBar global. La gate condicional en `page.tsx` aporta la mutua exclusión. |
| D9  | Sin animación en la transición sidebar↔TopBar (v1).                                                                                                                        | Animar slide-out con flexbox sin lib adicional da resultado pobre. `tw-animate-css` ya está en repo — sumar `animate-in slide-in-from-left` puede ser un follow-up trivial post-merge.                                       |

## Gotchas detectados en discovery

- **G1 — Cmd+B vs TipTap bold.** Sin guard de `activeElement`, el shortcut global pisa el bold del editor. Guard `document.activeElement?.matches('input, textarea, [contenteditable], [contenteditable="true"]')` cubre TipTap (`.ProseMirror` tiene `contenteditable="true"`) + cualquier input/textarea de la app.
- **G2 — Flash visual pre-snapshot.** Si `layout.tsx` asume `sidebarHidden=true` antes de `isLoaded=true`, el primer paint mostrará TopBar y luego flickeará a Sidebar (o viceversa). Mitigación: `showTopBar` AND-ea con `isLoaded`. Antes del primer `onSnapshot` la app rinde como si sidebar estuviera visible.
- **G3 — Tablet con `sidebarHidden=true` heredado de desktop.** Si el user activa hidden en desktop y luego abre la app en tablet, la pref persiste pero NO debe aplicar visualmente. Cubierto por `breakpoint === 'desktop'` en la guard del monto. Tablet sigue con `w-16 collapsed`.
- **G4 — Resize mid-sesión.** `useBreakpoint()` re-emite via `matchMedia` listeners → React re-renderiza layout.tsx → guard se re-evalúa. Sin acción adicional, pero verificar manual con `browser_resize` en el E2E.
- **G5 — `kbd` con `⌘` en cross-platform.** En Windows/Linux el `⌘` se renderiza pero no es semántico (es `Ctrl`). Si el repo no tiene un util `getModKey()`, hardcodear `⌘K` y aceptarlo como ya hace `QuickCaptureButton.tsx` con `Alt+N`. Follow-up real si surge feedback de usuarios Windows confundidos.

## Verificación E2E

Playwright MCP en viewports `1280×800` (desktop), `768×1024` (tablet), `375×667` (mobile).

**Golden path (desktop, 1280×800):**

1. App load → sidebar `w-64` visible.
2. `/settings` → "Visibilidad del menú" → click "Oculto" → sidebar desaparece, TopBar aparece arriba con logo + Buscar + Captura.
3. Click logo → navega a `/`.
4. Click "Buscar ⌘K" → CommandPalette abre.
5. Sin query, sección "Acciones" muestra 8 entries. Cmd+K → escribir cada destino → Enter → navega correctamente a Dashboard / Notas / Tareas / Proyectos / Inbox / Hábitos / Objetivos / Settings.
6. Click "+ Captura rápida" del TopBar → QuickCapture modal abre.
7. Cmd+B (foco fuera del editor) → sidebar reaparece. Cmd+B otra vez → sidebar desaparece.
8. Refresh → sidebar oculto persiste (pref leída de Firestore, TopBar montado correctamente tras isLoaded).

**Edge cases:**

- En `/notes/{noteId}` con foco en el editor TipTap, Cmd+B aplica bold y NO toggea sidebar.
- Resize a `800×600` (tablet): TopBar desaparece. Sidebar se monta en modo `w-16 collapsed`.
- Resize a `400×800` (mobile): TopBar/Sidebar desaparecen. Aparece MobileHeader + BottomNav + FAB + NavigationDrawer.
- Resize de tablet → desktop con `sidebarHidden=true` persistido: TopBar aparece (no sidebar).
- Sin login: layout redirige a `/login`, nunca llega a evaluar `sidebarHidden`.
- Con foco en input de búsqueda del CommandPalette, Cmd+B no toggea (cubre el guard de `activeElement`).
- Con foco en search del Notes/Tasks page, Cmd+B no toggea.

**Regresiones a vigilar:**

- `OfflineBadge`, `InstallPrompt`, `QuickCapture` modal siguen visibles globalmente (overlays, no afectados por sidebar).
- En tablet, el `onExpandClick` del sidebar collapsed sigue abriendo el `NavigationDrawer`.
- En mobile, el `BottomNav` y el `FAB` siguen funcionando idénticos.
- `PendingSyncIndicator` sigue funcional en sidebar (tablet, desktop sidebar visible) Y en TopBar (desktop hidden mode, vía prop `compact`). F31.3 cubre el wiring del TopBar.

## Out of scope (deuda explícita)

- **Animación de transición.** Sidebar/TopBar swap es instantáneo. `tw-animate-css` ya en repo permitiría `animate-in slide-out-to-left` etc. Follow-up trivial post-merge si Sebastián lo pide.
- **Toggle desde el Command Palette.** Sumar "Ocultar sidebar" / "Mostrar sidebar" como quick action es 2 entries más. v1 con shortcut + Settings alcanza. Follow-up.
- **Hover edge / FAB para des-ocultar.** Solo ⌘B + Settings + (botón en TopBar pendiente?). El logo del TopBar lleva al Dashboard pero NO toggea — si Sebastián quiere un botón explícito "mostrar menú" en el TopBar, sumarlo en F31.3 antes del merge. Default actual: NO mostrar botón (paridad con la decisión "des-ocultar = ⌘B o Settings").
- **`getModKey()` util cross-platform** para renderizar `⌘` en mac y `Ctrl` en win/linux dinámicamente. Hoy hardcodeamos. Follow-up si llega feedback de UX.
- **Atajo para abrir el TopBar específicamente.** Solo hay toggle. Sin shortcut "force-show".
- **Persistencia local-first** del estado del sidebar mientras `isLoaded=false`. Hoy mostramos sidebar siempre pre-snapshot. Aceptable pero genera flash si el user trabaja con hidden=true habitualmente. Mitigación futura: cachear última pref en `localStorage` como hint sincrónico.

## Checklist de cierre

- [ ] `npm test` verde (incluyendo los 3 tests nuevos en `preferences.test.ts`)
- [ ] `npm run lint` verde
- [ ] `npm run build` verde (sin errores TS)
- [ ] E2E playwright cubrió golden path + edge cases
- [ ] Cmd+B no rompe bold de TipTap (verificado manual)
- [ ] Refresh persiste estado correctamente
- [ ] Tablet/mobile no presentan regresiones visuales
- [ ] En hidden mode (Dashboard, desktop), solo UN `<QuickCaptureButton />` visible (en TopBar). El del header del Dashboard se oculta vía gate `{!sidebarHidden && ...}` — riesgo #1 de regresión flagueado por el Plan agent
- [ ] PR `feat/hidden-sidebar` → `main` con merge `--no-ff`
- [ ] Deploy hosting `npm run build && npm run deploy`
- [ ] No requiere `npm run deploy:functions`, `tauri:build` ni `cap:build` (cambio 100% client-side)
- [ ] Conversión del SPEC a registro de implementación (step 8 SDD) tras merge

## Plan de commits propuesto

| #   | Commit                                                                                | Sub-feature                                |
| --- | ------------------------------------------------------------------------------------- | ------------------------------------------ |
| 1   | `feat(spec): SPEC F31 hidden sidebar mode`                                            | (este archivo, primer commit en la branch) |
| 2   | `feat(prefs): agregar sidebarHidden a UserPreferences con tests`                      | F31.1                                      |
| 3   | `feat(layout): TopBar minimalista para hidden sidebar mode`                           | F31.3                                      |
| 4   | `feat(layout): montar Sidebar/TopBar condicional según preferences.sidebarHidden`     | F31.4                                      |
| 5   | `feat(settings): SidebarVisibilitySelector en /settings (desktop)`                    | F31.6                                      |
| 6   | `feat(hooks): useSidebarVisibilityShortcut con guard de activeElement`                | F31.5                                      |
| 7   | `feat(palette): enriquecer QUICK_ACTIONS con dashboard, hábitos, objetivos, settings` | F31.2                                      |

(Si surgen fixes intermedios durante implementación, agregarlos como `fix(...)` adicionales — los siete commits arriba son la secuencia happy-path.)
