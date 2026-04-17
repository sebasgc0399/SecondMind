# SPEC — SecondMind · Feature 1: Responsive & Mobile UX (Registro de implementación)

> Estado: **Completada** — Abril 2026
> Alcance: SecondMind usable en mobile (<768px), tablet (768–1023px) y desktop (≥1024px) tanto en web (PWA) como en Capacitor Android. Navegación nativa por plataforma, touch targets ≥44×44, safe-area insets, sin scroll horizontal involuntario.
> Stack implementado: React 19, Tailwind CSS v4, `@base-ui/react` (Dialog), lucide-react, `useSyncExternalStore` + `matchMedia`.
> Para gotchas operativos consolidados → `Spec/ESTADO-ACTUAL.md` sección "Responsive & Mobile UX (Feature 1)".

---

## Objetivo

El usuario abre SecondMind desde su celular (PWA o APK Capacitor) y tiene una experiencia nativa: bottom nav para navegar entre secciones primarias, FAB para Quick Capture, content area que no se desborda ni requiere scroll horizontal involuntario, tap targets de 44px mínimo, y safe-area insets respetados (notch, gesture bar, status bar). En tablet la sidebar se colapsa a iconos de 64px con hamburger que abre un drawer overlay. En desktop el layout previo se preserva sin regresión.

---

## Prerequisitos descubiertos

- **Fix Vite `resolve.dedupe` Firebase (pre-requisito bloqueador — commit `b03483e`).** Sin él, el dev server fallaba al cargar con `Component auth has not been registered yet` porque el optimizer de Vite picks up paquetes `@firebase/*` desde `extension/node_modules/` (Chrome Extension tiene su propio npm install) y duplica el component registry. Agregado `dedupe: ['firebase', '@firebase/app', '@firebase/component', '@firebase/auth', '@firebase/firestore']` en `vite.config.ts`. Descubierto durante el audit inicial con Playwright — el dev server estaba roto después del merge de Fase 5.2.

---

## Features implementadas

### F1: Hook `useMediaQuery` + constantes de breakpoints (commit `1f915be`)

- `src/lib/breakpoints.ts`: `MOBILE_MAX = 767`, `TABLET_MAX = 1023`, queries string `(max-width: 767px)`, `(min-width: 768px) and (max-width: 1023px)`, `(min-width: 1024px)`, tipo `Breakpoint = 'mobile' | 'tablet' | 'desktop'`.
- `src/hooks/useMediaQuery.ts`:
  - `useMediaQuery(query)` con `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)` — mismo patrón que `useOnlineStatus` de Fase 5. `subscribe` usa `matchMedia.addEventListener('change', cb)`; `getSnapshot` devuelve `matchMedia.matches`; server snapshot devuelve `false`.
  - `useBreakpoint()` deriva de 2 queries (mobile + desktop): si isMobile → mobile, si isDesktop → desktop, else tablet. Fallback tablet evita flash en primer render (cuando ambos devuelven false por server snapshot) sin crear mismatch de hidratación.

### F2: Responsive shell — Layout refactor (commit `c33b093`)

- `index.html`: `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />` — el `viewport-fit=cover` es obligatorio para que `env(safe-area-inset-*)` resuelva en PWA/Capacitor con notch.
- `src/index.css`: vars `--sai-top/bottom/left/right: env(safe-area-inset-*, 0px)` en `:root`. El body aplica solo `padding-left/right` (globales); top/bottom se aplica granular en MobileHeader y BottomNav/FAB para no duplicar.
- `src/app/layout.tsx`: usa `useBreakpoint()` para decidir entre 3 shells:
  - **mobile**: sin Sidebar. `<MobileHeader onMenuClick={openDrawer}>` fijo arriba + `<main>` con `padding-bottom: calc(80px + var(--sai-bottom))` + `<BottomNav>` + `<FAB>` + `<MoreDrawer>` + `<NavigationDrawer>`.
  - **tablet**: `<Sidebar collapsed onExpandClick={openDrawer}>` 64px con iconos + `<NavigationDrawer>` (mismo drawer que mobile).
  - **desktop**: `<Sidebar>` 256px full, sin drawer ni bottom nav (comportamiento original).
- `src/components/layout/Sidebar.tsx`:
  - Exporta `navItems: NavItem[]` (reusado por MobileHeader y NavigationDrawer).
  - Nueva prop `collapsed?: boolean` → cuando true, `w-16` en aside, oculta labels y username, iconos centrados con `title={item.label}` para tooltip.
  - Nueva prop `onExpandClick?: () => void` → cuando `collapsed && onExpandClick`, renderiza botón hamburger arriba del nav que llama el callback.
  - Extrae `<SidebarContent>` (sin el `<aside>` wrapper) exportado para reuse en NavigationDrawer. Acepta prop `onNavigate?` que se llama en cada NavLink click para cerrar el drawer.
- `src/components/layout/MobileHeader.tsx` (nuevo):
  - `sticky top-0 z-40` + `padding-top: var(--sai-top)` para respetar status bar Android.
  - Hamburger `h-11 w-11` izquierdo + `<h1>` con título dinámico de la ruta. Título derivado de `navItems` con map estático (match exacto primero, prefijo después, fallback 'SecondMind').
- `src/components/layout/NavigationDrawer.tsx` (nuevo):
  - `Dialog.Root` de `@base-ui/react` con `Dialog.Popup` `fixed inset-y-0 left-0 w-72` + transición `data-ending-style:-translate-x-full data-starting-style:-translate-x-full` (slide-in desde izquierda).
  - Renderiza `<SidebarContent user={user} onSignOut={signOut} onNavigate={() => onOpenChange(false)} />` — cada click en NavLink cierra el dialog.
  - `Dialog.Close` absoluto top-right con ícono `X`. Padding-top respeta `--sai-top`.

### F3: BottomNav + MoreDrawer + FAB (commit `cbc61b6`)

- `src/components/layout/BottomNav.tsx`:
  - `fixed inset-x-0 bottom-0 z-40`, altura `calc(64px + var(--sai-bottom))`, `padding-bottom: var(--sai-bottom)`.
  - 4 `<NavLink>` (Dashboard con `end`, Notas, Tareas, Inbox) + 1 `<button>` "Más". Cada item: icono 20×20 + label 10px, `flex-col items-center justify-center`.
  - Badge del Inbox: dot circular `bg-primary` posicionado absolute top-right del item cuando `usePendingInboxCount() > 0`.
  - Active state: `text-primary`; inactive: `text-muted-foreground`.
- `src/components/layout/MoreDrawer.tsx`:
  - `Dialog.Popup` bottom sheet: `fixed inset-x-0 bottom-0 rounded-t-2xl` + transición `data-ending-style:translate-y-full data-starting-style:translate-y-full`.
  - Handle visual `<div class="h-1 w-10 rounded-full bg-border">` arriba.
  - 5 `<NavLink>` (Proyectos, Objetivos, Hábitos, Grafo, Settings). Cada click → `onOpenChange(false)` cierra el sheet + navegación.
  - `padding-bottom: calc(16px + var(--sai-bottom))`.
- `src/components/layout/FAB.tsx`:
  - `<button>` circular `h-14 w-14 rounded-full bg-primary` con ícono Plus. `fixed right-4 z-30`, `bottom: calc(80px + 16px + var(--sai-bottom))` — por encima de BottomNav.
  - `onClick={() => open()}` llama a `useQuickCapture().open()`. Active state `active:scale-95`.
- Layout: los tres se montan solo cuando `isMobile`. State local `drawerOpen` (NavigationDrawer) + `moreOpen` (MoreDrawer) en el Layout. NavigationDrawer también se monta en tablet.

### F4: Tap targets 44×44 + QuickCapture con botones en mobile (commit `264b046`)

- `src/components/capture/QuickCapture.tsx`:
  - Extrae `submit()` como función reusable. `handleKeyDown` (Enter) ahora llama `submit()`; botón mobile también.
  - Hints de teclado (`Enter guardar · Shift+Enter · Esc`) con `className="hidden md:inline"` — ocultos en mobile.
  - Botones mobile "Cancelar" + "Guardar" (`className="ml-auto flex gap-2 md:hidden"`): `<button onClick={submit}>` deshabilitado cuando `rawContent.trim()` es vacío. Sin teclado físico el botón es el único path funcional.
- `src/components/tasks/TaskCard.tsx`:
  - Checkbox `<input h-4 w-4>` wrapeado en `<label class="flex h-11 w-11 items-center justify-center">` con `-my-2 -ml-2` negative margin para compensar el extra height sin desbalancear el card. Hit area 44×44, visual 16×16.
  - Botón expand (`MoreHorizontal`/`ChevronUp`) con `flex h-11 w-11 items-center justify-center` + `-my-2 -mr-2`. Mismo patrón.
- `src/components/habits/HabitGrid.tsx`: primera columna (`<th>` "Hábito") con `sticky left-0 z-10 bg-background` para mantenerla visible al scrollear horizontal.
- `src/components/habits/HabitRow.tsx`:
  - Primera celda (`<td>` con nombre del hábito) con `sticky left-0 z-10 bg-background`.
  - Celdas del grid: `<button class="flex h-11 w-11">` wrapper + `<span class="h-7 w-7 rounded border">` visual interno. Hit area 44×44, visual 28×28 — mantiene densidad visual sin sacrificar touch.
- `src/components/capture/InboxItem.tsx`: botones "Nota" y "Descartar" con `min-h-11 px-3 py-2` (antes `px-2.5 py-1`) → hit area ≥44px.
- FAB montado condicionalmente en mobile (`src/app/layout.tsx`).
- Dashboard: `QuickCaptureButton` del header con `className="hidden md:block"` — en mobile el FAB lo cubre. El kbd "Alt+N" dentro del botón ya tenía `hidden sm:inline` (preexistente).

### F5: Layouts por página + fix grid implícito (commit `d98456e`)

- **Fix crítico — dashboard grid `1489px` en mobile.** `src/app/page.tsx`: `grid gap-4 lg:grid-cols-2` → `grid grid-cols-1 gap-4 lg:grid-cols-2`. Sin `grid-cols-1` explícito, el implicit grid con children de content largo (títulos de notas) estiraba la columna auto a 1489px en viewport 375. Descubierto en E2E con Playwright (`mainScrollW=1505` aunque visualmente sin overflow).
- **Fix `truncate` en cards del dashboard** (`DailyDigest`, `ProjectsActiveCard`, `RecentNotesCard`, `TasksTodayCard`): span con `className="min-w-0 flex-1 truncate"` (antes solo `truncate`). Sin `min-w-0` el span flex-child no achicaba y rompía el layout en mobile. Post-fix: `mainScrollW=360` < viewport 375.
- **Dashboard header**: `flex flex-wrap items-center justify-between gap-3` + `QuickCaptureButton` con `hidden md:block` (FAB cubre mobile).
- **Notas lista** (`src/app/notes/page.tsx`): header con `flex-wrap` + labels "Ver como grafo" y "Nueva nota" con `hidden sm:inline` / `sm:hidden` para alternar entre texto completo y abreviado.
- **Tareas** (`src/app/tasks/page.tsx`): nav con `overflow-x-auto` + tabs con `shrink-0 px-4 py-3 md:py-2` → 46px alto en mobile (≥44 target), 38px desktop (densidad original).
- **Inbox** (`src/app/inbox/page.tsx`): header `flex-wrap` para que "Procesar" caiga a row 2 si no cabe al lado del contador.
- **Grafo** (`src/app/notes/graph/page.tsx` + `src/components/graph/GraphFilters.tsx`):
  - Header con `flex-wrap gap-x-3 gap-y-1 px-4 py-3 md:px-6 md:py-4`. Título "Grafo" (antes "Knowledge Graph") con `text-base md:text-lg`. Botón fullscreen con `h-9 w-9`.
  - GraphFilters: padding responsive `px-4 md:px-6` + `gap-3 md:gap-4` en el flex de controles. Toggle accordion con `useState` preservado (decisión YAGNI — ya era funcional, no migrar a `<details>` nativo).

### Docs y cleanup (commits `f483ca2`, `453ffed`)

- `Spec/ESTADO-ACTUAL.md`: Feature 1 en fases completadas + nueva sección "Responsive & Mobile UX (Feature 1)" con 11 patrones/decisiones vigentes + gotcha 25 (Vite dedupe Firebase) + siguiente fase reescrita.
- `CLAUDE.md`: 8 gotchas nuevos al final de la sección Gotchas (Vite dedupe, useBreakpoint, SidebarContent reusable, HabitGrid sticky, tap targets via label, grid-cols-1 explícito, min-w-0 flex-1 truncate, safe-area granular) + Feature 1 en lista de fases.
- `Spec/ESTADO-ACTUAL.md` (commit `453ffed`): gotcha adicional descubierto en testing Android — SW cache del WebView persiste entre reinstalaciones del APK y sirve el bundle viejo en la primera apertura. Resolución: borrar caché de la app en Ajustes de Android, o desinstalar completo antes de `adb install -r`.

---

## Desviaciones del plan original

- **Pre-requisito descubierto — Vite dedupe Firebase.** El plan no lo mencionaba. Durante el audit inicial con Playwright el dev server devolvía página en blanco por conflicto de `@firebase/component` entre `node_modules/` raíz y `extension/node_modules/`. Commit aislado (`b03483e`) como primer paso antes del F1.
- **Tablet NO usa sidebar expandible "overlay push"**, como sugería el SPEC original. En su lugar, reusa el mismo `NavigationDrawer` que mobile. Cuando el user clickea hamburger en la sidebar collapsed, se abre el drawer full-screen — una sola superficie en lugar de dos estados de sidebar (collapsed 64 + expanded overlay). Simplificación YAGNI validada durante implementación.
- **Graph filters: toggle con `useState` preservado**, no migrado a `<details>/<summary>` nativo. El plan original sugirió `<details>` por YAGNI, pero el componente existente ya tenía accordion funcional con React state — refactorizarlo no agregaba valor. Solo ajuste de paddings responsive.
- **MobileHeader sin back button dinámico.** El plan original planteaba opcionalmente un registry de rutas padre para que MobileHeader mostrara "← Proyectos" en el detalle. Se descartó por YAGNI — los back links inline existentes en cada página funcionan bien.
- **Dashboard grid bug descubierto en E2E.** No estaba en el plan. `display: grid` sin `grid-cols-1` explícito deja que children con content largo estiren la implicit column auto. Fix no trivial de detectar sin audit en viewport real (`mainScrollW` en Playwright lo expuso).
- **`truncate` en cards del dashboard requirió `min-w-0 flex-1`.** Tampoco estaba en el plan. Aplica a cualquier `<span class="truncate">` dentro de un flex container sin `min-w-0` en la cadena de padres.
- **HabitGrid sticky column NO migró a CSS grid** — mantuvo `<table>` HTML con `th/td:first-child { position: sticky; left: 0 }`. El plan mencionaba "sticky column" pero no especificaba tabla vs grid. La table existente funcionó tal cual con menos cambios.

---

## Gotchas descubiertos durante el dev

- **SW cache del WebView Capacitor persiste entre reinstalaciones del APK.** Al reinstalar con `adb install -r` o vía transferencia manual, el `vite-plugin-pwa` Service Worker retiene el bundle del install anterior y lo sirve al abrir — el user ve la versión pre-Feature 1. `registerType: 'autoUpdate'` resuelve en reloads subsiguientes pero la primera apertura engaña. Resolución: Ajustes → Apps → SecondMind → Almacenamiento → Borrar caché. Para testing E2E confiable, desinstalar completo antes de cada install.
- **`display: grid` sin `grid-cols-1` explícito deja children estirar la implicit column.** Con content largo (títulos de notas, breadcrumbs), la column auto crece a miles de píxeles invisibles (no hay overflow horizontal pero `main.scrollWidth` lo delata). Siempre empezar con `grid grid-cols-1 md:…` o `lg:grid-cols-N` — el `grid-cols-1` del base es obligatorio.
- **`truncate` no funciona sin `min-w-0 flex-1` en el span flex-child.** El span se expande a content-size cuando el padre flex no tiene `min-w-0` en la cadena. Aplica a DailyDigest, ProjectsActiveCard, RecentNotesCard, TasksTodayCard.
- **Radix/base-ui checkbox hit area via label wrapper.** `<input type="checkbox" h-4 w-4>` wrapeado en `<label class="h-11 w-11 flex items-center justify-center">` da 44×44 sin cambiar el visual. El label recibe el click del browser y toggles el input por herencia. Patrón aplicable a cualquier control pequeño de Radix (radio, switch).
- **`useSyncExternalStore` server snapshot `false` no causa flash visible.** Primer render con ambas media queries `false` → `useBreakpoint()` devuelve `'tablet'` (fallback). En el WebView de Capacitor la hidratación es sincrónica (sin SSR real), el primer paint usa el snapshot real inmediatamente. No vimos flash en ningún device testeado.

---

## Estructura de archivos creados/modificados

```
vite.config.ts                                   # +resolve.dedupe Firebase
index.html                                        # +viewport-fit=cover

src/
├── hooks/
│   └── useMediaQuery.ts                         # NUEVO — useMediaQuery + useBreakpoint
├── lib/
│   └── breakpoints.ts                           # NUEVO — constantes + queries
├── index.css                                    # +--sai-top/bottom/left/right vars, body padding lat
├── app/
│   ├── layout.tsx                               # shell condicional mobile/tablet/desktop + drawers
│   ├── page.tsx                                 # grid-cols-1 lg:grid-cols-2 + header flex-wrap
│   ├── inbox/page.tsx                           # header flex-wrap
│   ├── notes/page.tsx                           # header flex-wrap + labels responsive
│   ├── notes/graph/page.tsx                     # header flex-wrap + paddings responsive
│   └── tasks/page.tsx                           # tabs overflow-x-auto + py-3 mobile
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx                          # +prop collapsed, +onExpandClick, +SidebarContent exportado
│   │   ├── MobileHeader.tsx                     # NUEVO — sticky header con hamburger + título
│   │   ├── NavigationDrawer.tsx                 # NUEVO — Dialog slide-in izquierda, reusa SidebarContent
│   │   ├── BottomNav.tsx                        # NUEVO — fixed bottom, 5 items + badge Inbox
│   │   ├── MoreDrawer.tsx                       # NUEVO — Dialog bottom sheet con secciones secundarias
│   │   └── FAB.tsx                              # NUEVO — botón flotante con Plus → QuickCapture.open()
│   ├── capture/
│   │   ├── QuickCapture.tsx                     # extract submit(), hints hidden md:inline, botones mobile
│   │   └── InboxItem.tsx                        # botones min-h-11
│   ├── tasks/
│   │   └── TaskCard.tsx                         # checkbox + expand wrapeados en h-11 w-11
│   ├── habits/
│   │   ├── HabitGrid.tsx                        # th:first-child sticky left-0
│   │   └── HabitRow.tsx                         # td:first-child sticky + button h-11 w-11 con visual 28×28
│   ├── graph/
│   │   └── GraphFilters.tsx                     # paddings responsive px-4 md:px-6
│   └── dashboard/
│       ├── DailyDigest.tsx                      # span min-w-0 flex-1 truncate
│       ├── ProjectsActiveCard.tsx               # idem
│       ├── RecentNotesCard.tsx                  # idem
│       └── TasksTodayCard.tsx                   # idem

Spec/
└── ESTADO-ACTUAL.md                             # nueva sección + gotchas 25 + SW cache

CLAUDE.md                                        # 8 gotchas responsive + Feature 1 en fases
```

---

## Checklist de completado (verificado)

- [x] `npm run build` OK sin errores TS ni warnings bloqueantes (6.34s, bundle 2.7MB principal)
- [x] E2E Playwright 375×812: MobileHeader + BottomNav (5 items, badge Inbox) + FAB + NavigationDrawer + MoreDrawer funcionales. `main.scrollWidth ≤ viewport` en dashboard, notas, editor, tareas, hábitos, proyectos, inbox, grafo.
- [x] E2E Playwright 768×1024: Sidebar collapsed 64px con iconos, hamburger abre NavigationDrawer, grid dashboard 2 cols sin scroll horizontal (`mainScrollW=689 < 704`).
- [x] E2E Playwright 1280×800: Sidebar 256px full, sin BottomNav/FAB, layout idéntico al original. Regresión visual zero.
- [x] Editor de nota a 375px: ProseMirror 311px ancho, texto legible wrapeado. Backlinks panel en `flex-col` mobile ya soportado por `lg:flex-row` previo.
- [x] HabitGrid a 375px: wrapper overflow-x-auto funciona, primera columna sticky al scrollear, celdas 44×44 tap targets.
- [x] Tap targets verificados: TaskCard checkbox label 44×44 (input 16×16 visual), tabs tareas 46px, HabitRow celdas 44×44, InboxItem botones ≥44px, FAB 56px.
- [x] Safe-area insets: `viewport-fit=cover` en index.html; MobileHeader `padding-top: var(--sai-top)`; BottomNav + FAB usan `--sai-bottom`.
- [x] QuickCapture en mobile: botones Cancelar/Guardar funcionales, hints de teclado ocultos (`hidden md:inline`), `submit()` reutilizable entre Enter y click.
- [x] Deploy a Firebase Hosting: `npm run build` genera PWA SW actualizado (29 precache entries), SecondMind.web.app sirve Feature 1.
- [x] APK Capacitor Android 8.3MB generado, instalado en Samsung S918B (Android 16), viewport 384×823 DPR 3.75, `matchMedia` reporta `m:1 t:0 d:0`, shell mobile activo. Validado con debug badge temporal (commit `f483ca2` → después removido en branch local al terminar el test).
- [x] Commits atómicos en `feat/responsive-mobile` (8 commits) y merged a `main` vía `--no-ff` (merge commit `313eca0`); pushed a `origin/main`.
- [x] Docs actualizados: ESTADO-ACTUAL (Feature 1 + 11 patrones + 2 gotchas nuevos), CLAUDE.md (8 gotchas + fase), este SPEC convertido a registro.

---

## Siguiente feature

Con Feature 1 completada, SecondMind es usable end-to-end en todos los viewports soportados. Candidatos para la siguiente iteración:

- **Feature 2: Polish UX del editor** — templates de notas, slash commands en TipTap, búsqueda semántica híbrida (Orama + embeddings)
- **Distribución Android**: Release keystore + Play Store publish (requiere AAB firmado + $25 one-time developer + privacy policy + screenshots)
- **iOS via Capacitor**: requiere macOS + Apple Developer ID ($99/año) + Share Extension nativa (más compleja que Android intent filter)
- **Code signing Windows** para el MSI de Tauri (auto-updater futuro)
- **Offline-queue para share intent** en Android (edge case: si no hay red al share + forzar-cierre, el item se pierde antes del sync de Firestore)

Feature 1 habilita que el polish UX del editor y features nuevas se diseñen **mobile-first desde el inicio** — las reglas de tap targets, safe-area y breakpoints ya están consolidadas en ESTADO-ACTUAL y CLAUDE.md.
