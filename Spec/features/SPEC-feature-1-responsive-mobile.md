# SPEC — SecondMind · Feature 1: Responsive & Mobile UX

> Alcance: La app se adapta correctamente a mobile (<768px), tablet (768–1024px) y desktop (>1024px) con navegación nativa por plataforma, touch targets adecuados y layouts adaptados por pantalla.
> Dependencias: Fases 0–5.2 completadas
> Estimado: 1–2 semanas solo dev
> Stack relevante: React 19, Tailwind CSS v4, @base-ui/react (Drawer), lucide-react

---

## Objetivo

El usuario abre SecondMind desde su celular (PWA o Capacitor) y tiene una experiencia nativa: bottom nav para navegar, FAB para captura rápida, contenido que no se desborda ni requiere scroll horizontal involuntario, y tap targets de 44px mínimo. En tablet la sidebar se colapsa a iconos. En desktop todo queda igual.

---

## Features

### F1: Hook `useMediaQuery` + Constantes de breakpoints

**Qué:** Hook reutilizable que expone el breakpoint actual como estado reactivo. Centraliza la lógica de detección para que los componentes decidan qué renderizar (no solo esconder con CSS, sino condicional en JSX cuando el árbol de componentes difiere entre plataformas).

**Criterio de done:**

- [ ] `useMediaQuery(query)` retorna `boolean` reactivo basado en `window.matchMedia`
- [ ] `useBreakpoint()` retorna `'mobile' | 'tablet' | 'desktop'` derivado de 2 media queries
- [ ] Los breakpoints coinciden con doc 02-flujos-ux: mobile <768px, tablet 768–1024px, desktop >1024px
- [ ] Funciona con SSR-safe (default `false` / `'mobile'` en server, hydration sin mismatch)
- [ ] No causa re-renders innecesarios (usa `useSyncExternalStore` como `useOnlineStatus`)

**Archivos a crear/modificar:**

- `src/hooks/useMediaQuery.ts` — hook genérico + `useBreakpoint` derivado
- `src/lib/breakpoints.ts` — constantes `MOBILE_MAX = 767`, `TABLET_MAX = 1023`, queries string

**Notas de implementación:**
Patrón idéntico a `useOnlineStatus` de Fase 5: `useSyncExternalStore` con `subscribe` → `matchMedia.addEventListener('change', cb)` y `getSnapshot` → `matchMedia.matches`. Evita el clásico `useEffect` + `useState` que causa flash en hydration.

---

### F2: Responsive Shell — Layout refactor

**Qué:** Refactorizar `layout.tsx` para que el shell de la app cambie según breakpoint: desktop muestra Sidebar fija, tablet muestra Sidebar colapsada (solo iconos 64px), mobile oculta Sidebar y muestra `MobileHeader` + `BottomNav`. El content area ocupa el 100% del ancho disponible en mobile.

**Criterio de done:**

- [ ] Desktop (>1024px): Sidebar 240px fija a la izquierda, content area ocupa el resto — comportamiento actual preservado
- [ ] Tablet (768–1024px): Sidebar colapsada a 64px con solo iconos, expandible con botón hamburger (overlay, no push)
- [ ] Mobile (<768px): Sidebar no se renderiza. `MobileHeader` fijo arriba con título de página + botón hamburger (abre drawer con navegación completa). `BottomNav` fijo abajo
- [ ] El content area tiene `padding-bottom` suficiente en mobile para no quedar tapado por BottomNav (80px + safe-area-inset-bottom)
- [ ] `safe-area-inset-*` aplicados para notch/gesture bar en iOS y Android edge-to-edge
- [ ] Transición suave al cambiar entre breakpoints (resize de ventana)

**Archivos a crear/modificar:**

- `src/app/layout.tsx` — refactor: condicional desktop/tablet/mobile usando `useBreakpoint()`
- `src/components/layout/Sidebar.tsx` — agregar prop `collapsed?: boolean` para modo iconos (tablet)
- `src/components/layout/MobileHeader.tsx` — nuevo: título dinámico + hamburger menu
- `src/components/layout/NavigationDrawer.tsx` — nuevo: drawer overlay con nav completa (reusa items de Sidebar)
- `src/index.css` — agregar `env(safe-area-inset-*)` al theme

**Notas de implementación:**
`MobileHeader` lee el título de la ruta actual. Opciones: un map `path → title` estático o un context `usePageTitle`. El map estático es más simple (YAGNI) — las rutas son fijas. `NavigationDrawer` usa `@base-ui/react` `Dialog` con `data-starting-style`/`data-ending-style` para slide-in desde la izquierda, mismo patrón que QuickCapture y ProjectCreateModal. La Sidebar existente en modo collapsed ya está parcialmente pensada (el doc 02-flujos-ux lo describe) pero nunca se implementó — agregar la prop `collapsed` y condicionar labels vs solo iconos.

---

### F3: Bottom Nav + Drawer "Más"

**Qué:** Barra de navegación fija en la parte inferior para mobile con 5 items: Dashboard, Notas, Tareas, Inbox, Más. "Más" abre un drawer con las secciones secundarias: Proyectos, Objetivos, Hábitos, Grafo, Settings.

**Criterio de done:**

- [ ] `BottomNav` visible solo en mobile (<768px), fijo en la parte inferior
- [ ] 5 items: Dash (LayoutDashboard), Notas (FileText), Tareas (CheckSquare), Inbox (Inbox icon), Más (MoreHorizontal)
- [ ] Item activo: icono + label con color primario, items inactivos en `muted-foreground`
- [ ] Inbox muestra badge numérico cuando `pendingInboxCount > 0` (reusa `usePendingInboxCount`)
- [ ] "Más" abre `MoreDrawer` desde abajo (bottom sheet) con: Proyectos, Objetivos, Hábitos, Grafo, Settings
- [ ] Al navegar desde "Más", el drawer se cierra automáticamente
- [ ] Altura del BottomNav: 64px + `env(safe-area-inset-bottom)`
- [ ] z-index encima del contenido pero debajo de modales (QuickCapture, CommandPalette)

**Archivos a crear/modificar:**

- `src/components/layout/BottomNav.tsx` — nuevo
- `src/components/layout/MoreDrawer.tsx` — nuevo: bottom sheet con items secundarios
- `src/app/layout.tsx` — montar BottomNav condicionalmente en mobile

**Notas de implementación:**
BottomNav usa `NavLink` de React Router con `end` prop en Dashboard para matching exacto. Badge del Inbox: `usePendingInboxCount()` ya existe y está optimizado (no causa re-render de todo el nav). El `MoreDrawer` usa Base UI `Dialog` con animación slide-up (`translateY(100%)` → `translateY(0)`). Items del drawer son `NavLink` wraps — al click navegan y el `onClick` cierra el dialog. z-index stack: BottomNav `z-40`, modales `z-50` (ya existente en QuickCapture/CommandPalette).

---

### F4: FAB Quick Capture + Touch Targets

**Qué:** Botón flotante (FAB) en mobile para Quick Capture que reemplaza el shortcut `Alt+N` (inaccesible en móvil). Además, ajuste global de tap targets a mínimo 44×44px y spacing touch-friendly en botones, cards, y controles interactivos.

**Criterio de done:**

- [ ] FAB circular visible en mobile (<768px), posición: bottom-right, encima del BottomNav (bottom: 80px + safe-area + 16px)
- [ ] FAB abre `QuickCapture` modal al tap (reusa `useQuickCapture().open()`)
- [ ] FAB no visible en desktop/tablet (el botón del dashboard y `Alt+N` cubren esos casos)
- [ ] Botones de acción en cards (completar tarea, descartar inbox, etc.) tienen mínimo 44×44px de hit area
- [ ] Checkboxes del habit tracker tienen hit area de 44×44px en mobile (actualmente son muy pequeños)
- [ ] Cards clickeables (NoteCard, TaskCard, ProjectCard) tienen padding touch-friendly en mobile (`p-4` mínimo)
- [ ] `QuickCaptureButton` del dashboard oculta hint "Alt+N" en mobile (ya existe, verificar)

**Archivos a crear/modificar:**

- `src/components/layout/FAB.tsx` — nuevo: botón flotante con ícono Plus
- `src/app/layout.tsx` — montar FAB condicionalmente en mobile
- `src/components/tasks/TaskCard.tsx` — ajustar hit areas de checkbox y botones
- `src/components/habits/HabitRow.tsx` — ajustar hit area de celdas del grid
- `src/components/capture/InboxItem.tsx` — ajustar botones "Nota" y "Descartar"
- `src/index.css` — clase utilitaria `touch-target` si se repite el patrón (o inline)

**Notas de implementación:**
FAB es un `<button>` absoluto con `rounded-full w-14 h-14 bg-primary text-primary-foreground shadow-lg`. Animación sutil de scale en press (`active:scale-95`). Para hit areas: en muchos casos basta con agregar `min-h-11 min-w-11` (44px = 2.75rem ≈ Tailwind's `h-11`) a los botones existentes. En el habit grid, cada celda ya es un `<button>` — solo necesita sizing mínimo. No crear una clase `@apply` — usar la utilidad inline.

---

### F5: Layouts de contenido responsive

**Qué:** Adaptar los layouts de cada página para que funcionen en mobile: stacked en vez de side-by-side, scroll horizontal donde aplique, tipografía escalada, y spacing ajustado.

**Criterio de done:**

- [ ] Dashboard: cards en stack vertical en mobile, 2 columnas en tablet+, títulos con `text-lg` en mobile vs `text-xl` en desktop
- [ ] Tareas: tabs Hoy/Pronto/Completadas como pills scrollables horizontalmente en mobile. TaskInlineCreate full-width
- [ ] Proyectos lista: cards en stack vertical en mobile (ya usan grid, verificar que colapsa)
- [ ] Detalle proyecto: secciones en stack vertical en mobile (tareas arriba, notas abajo). Selects y botones full-width
- [ ] Objetivos: cards en stack vertical, progress bar y selects full-width en mobile
- [ ] Hábitos: grid con scroll horizontal en mobile (`overflow-x-auto`), columna de nombre fija (sticky left)
- [ ] Inbox: cards full-width, botones de acción en row (no overflow)
- [ ] Inbox Processor: card centrada full-width en mobile, campos del form en stack vertical
- [ ] Notas lista: NoteCards en stack, search bar full-width
- [ ] Editor de nota: toolbar compacta en mobile (iconos sin labels), backlinks como collapsible debajo del editor (no sidebar)
- [ ] Graph: canvas full viewport en mobile, controles overlay compactos, panel de nodo como bottom sheet
- [ ] Settings: secciones en stack, full-width
- [ ] Command Palette: full-width en mobile con `max-w-full` y `mx-4` (ya parcialmente diseñado en doc 02-flujos-ux)
- [ ] `max-w-5xl` del content area se remueve o se ajusta a `max-w-full px-4` en mobile

**Archivos a crear/modificar:**

- `src/app/page.tsx` — dashboard grid responsive
- `src/app/tasks/page.tsx` — tabs responsive
- `src/app/projects/page.tsx` — grid responsive
- `src/app/projects/[projectId]/page.tsx` — stack vertical mobile
- `src/app/objectives/page.tsx` — grid responsive
- `src/app/habits/page.tsx` — scroll horizontal
- `src/components/habits/HabitGrid.tsx` — sticky column + overflow
- `src/app/inbox/page.tsx` — cards full-width
- `src/app/inbox/process/page.tsx` — form stack
- `src/app/notes/page.tsx` — search + cards
- `src/app/notes/[noteId]/page.tsx` — editor layout
- `src/components/editor/BacklinksPanel.tsx` — collapsible en mobile vs sidebar en desktop
- `src/app/notes/graph/page.tsx` — canvas + controls
- `src/components/layout/CommandPalette.tsx` — full-width mobile
- `src/app/settings/page.tsx` — stack sections

**Notas de implementación:**
La mayoría de estos cambios son ajustes de clases Tailwind (mobile-first). Convención del proyecto: estilos base son mobile, breakpoints agregan complejidad (`flex flex-col md:flex-row`). El habit grid sticky column usa `sticky left-0 bg-background z-10` en la primera columna. El backlinks panel en mobile cambia de sidebar (`lg:flex-row` con panel 288px) a collapsible vertical debajo del editor — ya existe el toggle, solo cambiar la dirección del layout condicionalmente. El graph panel de nodo en mobile puede ser un drawer bottom sheet (reusa patrón de `MoreDrawer`). Para `max-w-5xl`: en mobile cambiar a `w-full px-4 sm:px-6 lg:max-w-5xl lg:mx-auto`.

---

## Orden de implementación

1. **F1** → Base: todos los demás features dependen de `useBreakpoint()` para condicionales
2. **F2** → Shell: sin esto la app es inutilizable en mobile (sidebar tapa todo). Habilita la navegación
3. **F3** → Navegación mobile completa: BottomNav + drawer "Más" dan acceso a todas las secciones
4. **F4** → Touch: FAB da acceso a Quick Capture en mobile + sizing correcto para dedos
5. **F5** → Content: con la navegación ya funcional, se pulen los layouts de cada pantalla

---

## Estructura de archivos

```
src/
├── hooks/
│   └── useMediaQuery.ts              # NUEVO — useMediaQuery + useBreakpoint
├── lib/
│   └── breakpoints.ts                # NUEVO — constantes de breakpoints
├── components/
│   └── layout/
│       ├── Sidebar.tsx               # MOD — prop collapsed, modo iconos
│       ├── MobileHeader.tsx          # NUEVO — header mobile con título + hamburger
│       ├── NavigationDrawer.tsx      # NUEVO — drawer overlay con nav completa
│       ├── BottomNav.tsx             # NUEVO — barra inferior 5 items
│       ├── MoreDrawer.tsx            # NUEVO — bottom sheet con secciones secundarias
│       ├── FAB.tsx                   # NUEVO — floating action button
│       └── CommandPalette.tsx        # MOD — full-width en mobile
├── app/
│   ├── layout.tsx                    # MOD — condicional shell por breakpoint
│   ├── page.tsx                      # MOD — grid responsive
│   ├── tasks/page.tsx                # MOD — tabs responsive
│   ├── projects/page.tsx             # MOD — grid responsive
│   ├── projects/[projectId]/page.tsx # MOD — stack mobile
│   ├── objectives/page.tsx           # MOD — grid responsive
│   ├── habits/page.tsx               # MOD — scroll horizontal
│   ├── inbox/page.tsx                # MOD — cards full-width
│   ├── inbox/process/page.tsx        # MOD — form stack
│   ├── notes/page.tsx                # MOD — search + cards
│   ├── notes/[noteId]/page.tsx       # MOD — editor layout
│   └── notes/graph/page.tsx          # MOD — canvas + controls
├── components/
│   ├── habits/HabitGrid.tsx          # MOD — sticky column + overflow
│   ├── habits/HabitRow.tsx           # MOD — touch targets
│   ├── tasks/TaskCard.tsx            # MOD — touch targets
│   ├── capture/InboxItem.tsx         # MOD — touch targets
│   └── editor/BacklinksPanel.tsx     # MOD — collapsible mobile
└── index.css                         # MOD — safe-area-inset variables
```

---

## Definiciones técnicas

### Safe Area Insets

Para que el contenido no quede detrás del notch, status bar, o gesture bar en iOS/Android:

```css
/* src/index.css */
:root {
  --sai-top: env(safe-area-inset-top, 0px);
  --sai-bottom: env(safe-area-inset-bottom, 0px);
  --sai-left: env(safe-area-inset-left, 0px);
  --sai-right: env(safe-area-inset-right, 0px);
}
```

El `<meta name="viewport">` en `index.html` necesita `viewport-fit=cover` para que `env()` funcione:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

### z-index Stack

| Capa           | z-index  | Componente                                       |
| -------------- | -------- | ------------------------------------------------ |
| Content        | `z-0`    | Páginas normales                                 |
| Sticky headers | `z-10`   | Habit grid sticky column                         |
| FAB            | `z-30`   | Floating action button                           |
| BottomNav      | `z-40`   | Barra inferior                                   |
| MobileHeader   | `z-40`   | Header superior                                  |
| Drawers/Sheets | `z-50`   | NavigationDrawer, MoreDrawer                     |
| Modales        | `z-50`   | QuickCapture, CommandPalette, ProjectCreateModal |
| Toast          | `z-[60]` | Notificaciones (ya existente)                    |

### Decisión: Renderizado condicional vs CSS hiding

- **Sidebar en mobile:** No se renderiza (condicional JSX). Reducir DOM innecesario + evitar listeners de TinyBase del badge.
- **BottomNav en desktop:** No se renderiza (condicional JSX). Mismo motivo.
- **Layouts de contenido:** Solo clases Tailwind responsive (CSS hiding/showing). El DOM es el mismo, solo cambia el layout. No requiere condicional JSX.

---

## Checklist de completado

Al terminar esta feature, TODAS estas condiciones deben ser verdaderas:

- [ ] La app compila sin errores (`npm run build`)
- [ ] En mobile (<768px): sidebar no visible, bottom nav funcional, FAB visible, todas las secciones accesibles via bottom nav + drawer "Más"
- [ ] En tablet (768–1024px): sidebar colapsada a iconos, expandible con hamburger
- [ ] En desktop (>1024px): comportamiento idéntico al actual (no regression)
- [ ] Todas las páginas son usables en viewport de 375px de ancho (iPhone SE) sin scroll horizontal involuntario
- [ ] Tap targets de botones interactivos ≥ 44×44px en mobile
- [ ] Safe area insets respetados (contenido no se oculta detrás de notch/gesture bar)
- [ ] Quick Capture accesible en mobile via FAB
- [ ] Inbox badge visible en BottomNav
- [ ] Command Palette funcional y full-width en mobile
- [ ] Habit grid scrollable horizontalmente en mobile con nombre del hábito sticky
- [ ] Deploy a Firebase Hosting funciona
- [ ] PWA y Capacitor Android muestran los cambios correctamente

---

## Siguiente feature

**Feature 2: Polish UX** — Templates de notas, slash commands del editor TipTap, mejoras de búsqueda. Scope por definir. Feature 1 (responsive) habilita que el polish UX se diseñe mobile-first desde el inicio.
