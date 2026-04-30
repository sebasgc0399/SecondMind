# SPEC — SecondMind · F34: Sidebar reorganización + dashboard cleanup

> Alcance: refactor del sidebar a 3 secciones (Ejecución/Captura/Conocimiento) con search+capture embebidos cuando el sidebar está visible, y dashboard limpio sin botón "Capturar" colgando.
> Dependencias: F31 (hidden mode), F32 (improvements), F33 (polish swap entry+exit).
> Estimado: ~1 sesión (4 sub-features, scope acotado, 0 archivos nuevos).
> Stack relevante: React 19 + lucide-react + Tailwind v4 + base-ui (no nuevas deps). Cero Firestore/CF/Tauri/Capacitor.
> Branch: `feat/sidebar-reorg`.

---

## Objetivo

Cuando el sidebar está visible (no oculto), el sidebar pasa a ser el centro único de navegación, búsqueda y captura — el dashboard queda limpio sin botón "Capturar" colgando. La nav se reorganiza visualmente en 3 grupos semánticos (Ejecución / Captura / Conocimiento) para reducir carga cognitiva. Modo hidden + TopBar siguen intactos (TopBar ya tiene Buscar + Capturar embebidos desde F32).

Las 3 deudas residuales del swap chrome (blip animate-in en toggle rápido, layout shift hidden→visible, pop del main visible→hidden) salen del scope de F34 y se abordan en F35 dedicada.

---

## Features

### F34.1: Reorganización del sidebar en 3 secciones agrupadas

**Qué:** Refactor de `navItems` de array plano a `navSections: { label, items }[]` con 3 grupos: **Ejecución** (Dashboard, Tareas, Proyectos, Objetivos, Hábitos), **Captura** (Inbox), **Conocimiento** (Notas, Grafo). `SidebarContent` renderiza un sub-heading muted uppercase tracking-wide por sección + items debajo. En modo `collapsed` (tablet) los labels de sección ocultos, items siguen icon-only.

**Criterio de done:**

- [ ] `navItems.ts` exporta `navSections: NavSection[]` y mantiene `navItems: NavItem[]` flat derivado vía `flatMap` para back-compat de `MobileHeader.getPageTitle`.
- [ ] Sidebar desktop muestra 3 sub-headings: "EJECUCIÓN", "CAPTURA", "CONOCIMIENTO" (uppercase, `text-xs`, `text-sidebar-foreground/50`, `tracking-wide`, padding consistente con items).
- [ ] Items mantienen su orden actual dentro de cada sección (Dashboard primero en Ejecución; Inbox solo en Captura; Notas antes de Grafo en Conocimiento).
- [ ] Tablet collapsed (`w-16`): labels de sección NO se renderizan; items icon-only intactos. Separación visual entre grupos opcional (e.g. divider sutil) si aporta.
- [ ] NavigationDrawer (mobile) hereda la nueva estructura sin cambios extra (vive de `SidebarContent`).
- [ ] `MobileHeader` `getPageTitle` sigue resolviendo títulos correctamente sobre todas las routes existentes (no regresión).

**Archivos a crear/modificar:**

- `src/components/layout/navItems.ts` — agregar export `navSections`; mantener `navItems` flat derivado vía `flatMap`.
- `src/components/layout/Sidebar.tsx` — `SidebarContent` itera `navSections` con sub-heading por grupo + items.

**Notas de implementación:**

- Mantener `navItems` (flat) export por back-compat con `MobileHeader.tsx:4`. Patrón: `export const navItems: NavItem[] = navSections.flatMap(s => s.items);`.
- Sub-heading semántico: usar `<h3>` visible para que screen readers anuncien el grouping. Alternativa con `role="presentation"` solo si UX confirma que el heading es ruido.
- Mapeo final de los 8 routes existentes: Ejecución = Dashboard, Tareas, Proyectos, Objetivos, Hábitos. Captura = Inbox. Conocimiento = Notas, Grafo.

---

### F34.2: Botón "Buscar" dentro del sidebar

**Qué:** Agregar un trigger del CommandPalette al inicio del `SidebarContent` (entre header de usuario y nav), estilizado como input bordered con placeholder "Buscar…" + kbd "⌘K" a la derecha. Click → `useCommandPalette().open()`. Paridad funcional con el botón existente del TopBar (post-F32).

**Criterio de done:**

- [ ] Sidebar desktop expandido muestra un `<button>` full-width con apariencia de input: borde `sidebar-border`, ícono `Search` izquierda, "Buscar…" placeholder, `<kbd>⌘K</kbd>` derecha.
- [ ] Click abre CommandPalette (mismo handler que `useCommandPalette().open()` que ya consumen TopBar y CommandPalette interno).
- [ ] Tablet collapsed (`w-16`): el botón se reduce a icon-only `<Search>` con `title="Buscar"` para tooltip.
- [ ] NavigationDrawer (mobile): el botón se renderiza también; click abre palette + cierra drawer (`onNavigate?.()` pattern existente al click).
- [ ] Foco visible (`focus-visible:ring-1` con `ring-sidebar-ring` o equivalente del design system).
- [ ] Cmd+K sigue funcionando como antes (no se duplica el shortcut handler — el sidebar solo agrega un trigger visual nuevo).

**Archivos a crear/modificar:**

- `src/components/layout/Sidebar.tsx` — agregar el trigger antes del `<nav>`. Importar `useCommandPalette`.

**Notas de implementación:**

- NO duplicar la implementación del CommandPalette ni del shortcut Cmd+K — ya viven en `CommandPalette.tsx` y `CommandPaletteProvider`. El sidebar solo agrega un trigger visual nuevo que invoca `useCommandPalette().open()`.
- `cn()` con boolean `collapsed` para alternar input-shaped vs icon-only.

---

### F34.3: Botón "Capturar" dentro del sidebar

**Qué:** Agregar `QuickCaptureButton` al `SidebarContent` (entre el trigger de Buscar y el primer grupo de nav), full-width primary button con "+ Capturar" + kbd "Alt+N". Reusa el componente existente con prop `fullWidth` (o variante).

**Criterio de done:**

- [ ] Sidebar desktop expandido muestra un primary button full-width: ícono `Plus`, "Capturar", `<kbd>Alt+N</kbd>`.
- [ ] Click abre QuickCapture (mismo handler que `useQuickCapture().open()`).
- [ ] Tablet collapsed (`w-16`): botón se reduce a icon-only `<Plus>` primary con `title="Capturar"`.
- [ ] NavigationDrawer (mobile): renderizado también; click abre QuickCapture + cierra drawer.
- [ ] Visualmente jerarquizado por encima de Buscar (Capturar = primary; Buscar = secondary input-style).
- [ ] Alt+N global sigue funcionando (no duplicar handler).

**Archivos a crear/modificar:**

- `src/components/dashboard/QuickCaptureButton.tsx` (o ubicación re-evaluada en D1) — agregar props opcionales `fullWidth?: boolean` y `compact?: boolean` (icon-only para collapsed).
- `src/components/layout/Sidebar.tsx` — importar y montar `<QuickCaptureButton fullWidth compact={collapsed} />`.
- (Opcional) `src/components/layout/TopBar.tsx` — actualizar import path si se reubica el componente.

**Notas de implementación:**

- El TopBar ya consume `QuickCaptureButton` (TopBar.tsx:64). La prop `fullWidth` debe ser opt-in para no afectar el TopBar (que lo usa inline).
- Considerar mover el componente fuera de `components/dashboard/` ahora que el dashboard deja de ser consumer — ver D1 abajo.

---

### F34.4: Eliminar QuickCaptureButton del Dashboard

**Qué:** Remover el bloque condicional `{!preferences.sidebarHidden && <QuickCaptureButton/>}` del header del dashboard. El header queda con solo `<Greeting>` (full-width sin botón a la derecha).

**Criterio de done:**

- [ ] `src/app/page.tsx` ya no importa `QuickCaptureButton` ni lee `preferences.sidebarHidden` para gating del botón.
- [ ] Header del dashboard simplificado a `<header><Greeting/></header>` (ajustar clases `flex flex-wrap items-center justify-between gap-3 md:mb-8` si justify-between ya no aporta).
- [ ] Visual regression: dashboard mobile/tablet/desktop sin botón "Capturar" en ningún viewport. El entrypoint queda en sidebar (desktop visible), TopBar (desktop hidden), FAB (mobile).
- [ ] No hay regresión en otros consumers de `usePreferences()` — el hook sigue usado por otras features (sidebar visibility hint, distillIntroSeen, etc.).

**Archivos a crear/modificar:**

- `src/app/page.tsx` — limpiar import + remover condicional + simplificar header.

**Notas de implementación:**

- Ordenar tras F34.3 done para que el sidebar SIEMPRE tenga el entrypoint cuando se elimine del dashboard (sino los users con sidebar visible quedarían sin botón visible momentáneamente entre commits).
- `preferences.sidebarHidden` puede dejar de leerse en `page.tsx`. Si era el único consumer del hook en ese archivo, eliminar también el `usePreferences()` import.

---

## Orden de implementación

1. **F34.1** → estructura de datos del sidebar (navSections + sub-headings). Base para F34.2/F34.3 (encajan visualmente con la nueva estructura de grupos).
2. **F34.2** → trigger de Buscar en el sidebar. Independiente de F34.3.
3. **F34.3** → trigger de Capturar en el sidebar. Crea el entrypoint visible en sidebar antes de removerlo del dashboard.
4. **F34.4** → eliminar el botón del dashboard. Depende explícitamente de F34.3 done.

F34.2 y F34.3 podrían paralelizarse en branches separados si el scope explotara, pero al ser sub-features chicos en el mismo archivo (`Sidebar.tsx`) van secuenciales en commits atómicos sobre el mismo branch.

---

## Estructura de archivos

```
src/
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx                  # MODIFY (F34.1/F34.2/F34.3): navSections + Buscar + Capturar
│   │   ├── navItems.ts                  # MODIFY (F34.1): export navSections + navItems flat
│   │   └── TopBar.tsx                   # MODIFY (F34.3, opcional): import path si se reubica QuickCaptureButton
│   └── dashboard/
│       └── QuickCaptureButton.tsx       # MODIFY (F34.3): props fullWidth + compact
└── app/
    └── page.tsx                         # MODIFY (F34.4): remove QuickCaptureButton + condicional
```

(0 archivos nuevos. Todos los cambios son edits sobre archivos existentes.)

---

## Definiciones técnicas

### D1: Ubicación canónica de `QuickCaptureButton`

- **Opciones:** (a) `components/dashboard/` (status quo, hereditario); (b) `components/layout/`; (c) `components/capture/`.
- **Recomendación inicial:** (c) `components/capture/QuickCaptureButton.tsx` — el botón es un trigger de captura, vive con el resto de capture infra (`QuickCapture.tsx`, `QuickCaptureProvider.tsx`, `useQuickCapture`).
- **Decisión final:** validar en plan mode con grep de imports actuales — si el costo de actualizar imports excede el valor semántico del move, dejar en `components/dashboard/` con comentario justificativo.

### D2: Sub-heading semántico de las 3 secciones

- **Opciones:** (a) `<h3>` visible con clases muted; (b) `<div role="presentation">` con texto visual; (c) `<h3 class="sr-only">` + `<div aria-hidden>` con texto visual (heading semántico oculto + visual mostrado).
- **Recomendación inicial:** (a) `<h3>` visible — la jerarquía Sidebar > Sección > Items es semánticamente real, screen readers se benefician del anuncio.
- **Decisión final:** validar en plan mode con audit a11y rápido. Aplicar tap-target rules si hay (no debería: el heading no es interactivo).

---

## Checklist de completado

- [ ] `npm run build` compila sin errores.
- [ ] `npm run lint` y `npm test` pasan sin regresión.
- [ ] **Sidebar desktop expandido (`1280×800`)** muestra en orden vertical: header de usuario → Buscar (input-shaped) → Capturar (primary full-width) → "EJECUCIÓN" + 5 items → "CAPTURA" + 1 item → "CONOCIMIENTO" + 2 items → PendingSyncIndicator → Settings + Sign out.
- [ ] **Sidebar tablet collapsed (`768×1024`)**: `w-16` con icon-only para Buscar + Capturar + nav items, sin sub-headings de sección.
- [ ] **NavigationDrawer mobile (`375×667`)** hereda nuevo layout (Buscar + Capturar visibles, 3 secciones agrupadas); FAB + BottomNav intactos.
- [ ] **Dashboard sin botón "Capturar"** en ningún viewport. Header simplificado a Greeting solo.
- [ ] **TopBar (modo hidden) intacto**: Mostrar menú + Logo + PendingSync + Buscar + Capturar siguen como hoy (F33 sin tocar).
- [ ] **Shortcuts intactos**: Cmd+B sigue toggleando sidebar↔TopBar; Cmd+K sigue abriendo CommandPalette desde sidebar+TopBar; Alt+N sigue abriendo QuickCapture global.
- [ ] **A11y**: foco visible en Buscar y Capturar; sub-headings anunciados por screen reader (si se eligió Opción A en D2); tap targets ≥44×44 en mobile drawer.
- [ ] Console limpia (0 errors, 0 warnings) en todo el flujo E2E.

---

## Siguiente fase

**F35 — Polish swap chrome.** Aborda las 3 deudas residuales del swap sidebar↔TopBar (out-of-scope de F33 y F34):

1. Layout shift horizontal hidden→visible (entrante empuja columna flex en 1 frame).
2. Pop del main visible→hidden (saliente unmount expande width "de golpe").
3. Blip animate-in en toggle rápido <200ms (componente que mantiene `shouldRender=true` re-recibe clase `animate-in` cuando `animateLayoutSwap` re-dispara).

F35 probablemente requiere refactor de `useMountedTransition` (exponer `justMounted`/`bothActive`) + `position: absolute` overlay durante la ventana de swap. SPEC dedicada se prepara post-merge de F34.
