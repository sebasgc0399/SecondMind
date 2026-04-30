# SPEC — SecondMind · F35: Polish swap chrome (sidebar↔TopBar)

> Alcance: cierre de las 3 deudas residuales del swap sidebar↔TopBar — blip animate-in en toggle rápido + layout shift hidden→visible + pop del main visible→hidden.
> Dependencias: F31 (hidden mode), F32 (improvements), F33 (entry+exit anim), F34 (sidebar reorg).
> Estimado: ~1 sesión (2 sub-features, una compleja).
> Stack relevante: React 19 + Tailwind v4 (transition-[padding] + position:absolute). Cero deps nuevas. Cero Firestore/CF/Tauri/Capacitor.
> Branch: `feat/swap-chrome-polish`.

---

## Objetivo

El swap sidebar↔TopBar pasa de "funcionalmente correcto pero con artifacts visuales" a "fluido sin shifts ni pops". El usuario no percibe layout jumps en ningún escenario — el main mantiene su geometría estable mientras el chrome lateral entra y sale por overlay. Los toggles rápidos consecutivos (<200ms) no re-disparan animaciones espurias sobre componentes que ya estaban visibles. Cierra el alcance del modo hidden iniciado en F31.

---

## Features

### F35.1: Hook `useMountedTransition` expone `justMounted` + guard contra blip animate-in en toggle rápido

**Qué:** Extender `useMountedTransition(visible, durationMs)` para que retorne también `justMounted: boolean`. El flag es `true` durante el primer render donde `shouldRender` flippea de `false → true` (mount o re-mount tras unmount completo). Es `false` cuando `shouldRender` se mantiene `true` a través de un toggle rápido (segundo flip antes del unmount del primer exit). El consumer (`layout.tsx`) pasa `animateEntry={animateLayoutSwap && transition.justMounted}` en lugar de solo `animateLayoutSwap && !isExiting` — eso evita aplicar la clase `animate-in slide-in-from-X` a un componente que nunca llegó a desmontarse.

**Criterio de done:**

- [ ] `useMountedTransition` retorna `{ shouldRender, isExiting, justMounted }`.
- [ ] `justMounted` es `true` en el primer render tras un flippeo `shouldRender false → true` (mount inicial cuando `visible=true` desde el arranque, Y re-mount tras un exit completado).
- [ ] `justMounted` es `false` cuando `shouldRender` se mantiene `true` durante un toggle rápido (`visible: true → false → true` antes del durationMs del exit).
- [ ] Tests unit nuevos: (a) `justMounted=true` en primer render visible=true, (b) `justMounted=false` en renders subsequent del mismo "vida", (c) toggle rápido (<durationMs) NO marca `justMounted=true` en el segundo flip, (d) re-mount tras exit completado SÍ marca `justMounted=true`.
- [ ] `layout.tsx` `animateEntry` deriva de `animateLayoutSwap && transition.justMounted` (no `!transition.isExiting`).
- [ ] Test 5 F33 (sampling DOM 30ms en toggle rápido): el componente que mantiene `shouldRender=true` durante el segundo toggle ya NO recibe clase `animate-in slide-in-from-X` en ningún frame.
- [ ] Tests 1, 2, 4 F33 (animaciones normales + skip-initial bilateral) sin regresión — `justMounted=true` en el mount post-toggle normal sigue activando la clase animate-in.

**Archivos a crear/modificar:**

- `src/hooks/useMountedTransition.ts` — extender state interno con flag derivable a `justMounted`.
- `src/hooks/useMountedTransition.test.ts` — agregar tests (c) y (d) específicos del nuevo flag; ajustar tests existentes si la signature cambió.
- `src/app/layout.tsx` — actualizar las 2 props `animateEntry` (líneas ~102, ~109) para consumir `justMounted`.

**Notas de implementación:**

- El patrón canónico en este repo (post-F33) para hooks reutilizables que detectan cambios de prop es `setState durante render` con state combinado (`{ ...derived, prevInput }` + check `if (state.prevInput !== input) setState(...)`). `justMounted` deriva de eso: en la rama de update donde `prevVisible !== visible` y `visible=true`, marcar `justMounted: true`. En cualquier otro render, `justMounted: false`.
- Cuidado con el ciclo del setState durante render que vuelve a re-correr el render: `justMounted` debe ser `true` en EL render que el consumer ve, no en uno transitorio. Plan mode validará la fórmula concreta.
- Excepción reconocida: `layout.tsx:69-81` sigue usando `useRef + isInitialMount` inline para `animateLayoutSwap` (toggle-only entry-anim). Eso NO se toca en F35 — es un workaround inline para consumer único, no patrón replicable. Solo el guard nuevo (`&& transition.justMounted`) se suma.

---

### F35.2: Layout overlay del sidebar durante swap — fin del shift horizontal y del pop del main

**Qué:** Refactor del `Layout` para que el sidebar se renderice como overlay (`position: absolute` ocupando el slot izquierdo) durante la ventana del swap (`isExiting || justMounted`). El main column toma su `padding-left` derivado del estado _target_ del sidebar (256px cuando `showSidebar`, 0 cuando hidden), con `transition-[padding-left] duration-200`. El main width es estable a través del swap — no hay shift al montar el entrante (escenario B) ni pop al desmontar el saliente (escenario A). Tablet collapsed (`w-16` permanente) y mobile (drawer) sin cambios.

**Criterio de done:**

- [ ] Sampling DOM 30ms durante **escenario B (hidden → visible)**: `<main>` mantiene `getBoundingClientRect().width` estable (±2px tolerancia rendering) desde t=0 hasta t=200ms+. El sidebar entrante anima `translateX(-100%) → translateX(0)` SIN empujar la columna flex.
- [ ] Sampling DOM 30ms durante **escenario A (visible → hidden)**: `<main>` mantiene width estable; transición de `padding-left: 256px → 0` smooth en 200ms (no salto instantáneo). El sidebar saliente anima `translateX(0) → translateX(-100%)` overlay sin afectar layout del main.
- [ ] Tablet (`768×1024`): sidebar `w-16` collapsed renderiza inline en flex como antes (NO overlay). Sin regresión.
- [ ] Mobile (`375×667`): NavigationDrawer + MobileHeader + BottomNav + FAB intactos. Sin regresión.
- [ ] TopBar swap (vertical, h-12) — validar si genera pop visual del main al unmount: si NO se observa, dejar como está; si SÍ, aplicar el mismo patrón con `padding-top` transition. Decisión final en plan mode con sampling DOM.
- [ ] Tests F33 1-7 sin regresión: animaciones in/out simétricas, mutua exclusión G1, breakpoints intactos, console limpia.
- [ ] Cmd+B + botón "Mostrar menú" + selector Settings siguen operando funcionalmente. State `preferences.sidebarHidden` sin cambios.
- [ ] No hay overflow horizontal del body durante el swap (el sidebar overlay con `translateX(-100%)` queda fuera del viewport pero no causa horizontal scroll).

**Archivos a crear/modificar:**

- `src/app/layout.tsx` — refactor del wrapper del Sidebar para soportar overlay condicional + cálculo del `padding-left` del column flex con transition. Los props `animateEntry`/`animateExit` del Sidebar se mantienen.
- `src/components/layout/Sidebar.tsx` — agregar prop opcional `floating?: boolean` que aplica `absolute inset-y-0 left-0 z-30` (o equivalente) cuando `true`. El gating de animate-in/out con `cn()` boolean sigue como F33.

**Notas de implementación:**

- Approach principal a validar en plan mode: durante `floating={transition.justMounted || transition.isExiting}` + `transition.shouldRender`, el sidebar es overlay. Cuando el swap termina (`!floating && shouldRender && !justMounted`), volver al modo inline en flex para que el sidebar aporte width al layout estable normal. Trade-off: una transición más compleja, pero el "estado normal" sigue siendo flex declarativo.
- Alternativa más simple a evaluar: sidebar SIEMPRE `position: absolute` cuando `showSidebar` (no solo durante swap). Main siempre con `padding-left: 256px` cuando `showSidebar`. Eso elimina la lógica condicional de `floating`. Costo: mayor distancia del modo "flex declarativo" original. Beneficio: menos code paths, menos riesgos de edge cases.
- `bothActive` (saliente + entrante simultáneos) probablemente NO necesario si el overlay aplica solo al sidebar. Cuando ambos transitions están activos (`sidebarTransition.isExiting && topBarTransition.justMounted` o viceversa), el sidebar overlay y el TopBar mount inline coexisten naturalmente sin conflicto de width.
- `z-index` del sidebar overlay: encima del main pero debajo de modales (`z-50` de base-ui dialogs). Usar `z-30` o equivalente.
- Validar con Playwright `browser_evaluate` + sampling DOM 30ms: medir `main.getBoundingClientRect().width` por frame en ambos escenarios para confirmar estabilidad.

---

## Orden de implementación

1. **F35.1** → ganancia rápida (closes blip toggle <200ms), refactor acotado al hook + 2 líneas en consumer + tests. Despeja Test 5 F33 sin tocar layout.
2. **F35.2** → refactor más complejo (layout overlay). Requiere plan agent para validar el approach exacto (overlay condicional vs siempre-absolute). Validación E2E con sampling DOM intensivo. Cierra escenarios A y B.

F35.1 y F35.2 son técnicamente independientes (F35.2 no necesita `justMounted`), pero hacerlos en orden permite cerrar la deuda más simple primero y validar que el hook extendido no rompe nada antes de meter el refactor pesado.

---

## Estructura de archivos

```
src/
├── hooks/
│   ├── useMountedTransition.ts          # MODIFY (F35.1): expone justMounted
│   └── useMountedTransition.test.ts     # MODIFY (F35.1): +2 tests para justMounted
├── components/
│   └── layout/
│       └── Sidebar.tsx                  # MODIFY (F35.2): prop floating opcional
└── app/
    └── layout.tsx                       # MODIFY (F35.1+F35.2): justMounted guard + overlay wrapper
```

(0 archivos nuevos. Todos los cambios son edits sobre archivos existentes.)

---

## Definiciones técnicas

### D1: `justMounted` derivado en render vs en state

- **Opciones:** (a) flag persistido en `InternalState` y reseteado en el siguiente render; (b) flag derivado puramente de la comparación `prevVisible !== visible && visible` durante render.
- **Recomendación inicial:** (b) — paridad con el patrón `setState durante render` ya canónico en el repo (`useExpandThenCollapse`, `useMountedTransition` existente). Sin necesidad de un effect para resetear el flag.
- **Decisión final:** validar en plan mode con tests de re-render forzado (e.g. parent re-render que no cambia `visible` no debería re-flippear `justMounted` a true).

### D2: Sidebar overlay siempre `absolute` vs solo durante swap

- **Opciones:** (a) overlay condicional al período de swap (`floating={isExiting || justMounted}`); (b) overlay permanente cuando `showSidebar` (sidebar siempre `absolute`).
- **Recomendación inicial:** TBD — depende del audit. (a) preserva el modo "flex declarativo" en estado estable; (b) elimina condicional pero distancia más del original.
- **Decisión final:** validar en plan mode con prototipo rápido en ambos approaches y sampling DOM. Plan agent + Phase 1 audit decide.

### D3: TopBar overlay vertical (in scope o defer)

- **Opciones:** (a) aplicar mismo patrón overlay+padding-top al TopBar; (b) dejar TopBar como F33 (inline en column flex).
- **Recomendación inicial:** (b) hasta que sampling DOM confirme un pop visible en el escenario A (visible→hidden, donde TopBar entra). Magnitud (48px) probablemente subliminal vs sidebar (256px).
- **Decisión final:** medir en plan mode con Playwright. Si el pop existe y es perceptible, sumar a F35.2. Si no, deferrir a backlog.

---

## Checklist de completado

- [ ] `npm run build` compila sin errores.
- [ ] `npm run lint` y `npm test` (incluyendo nuevos tests de `useMountedTransition`) pasan sin regresión.
- [ ] **Sampling DOM 30ms escenario B (hidden→visible)** confirma `<main>` width estable (±2px) durante todo el swap de 200ms.
- [ ] **Sampling DOM 30ms escenario A (visible→hidden)** confirma `<main>` width estable o transition smooth de padding-left, sin pop instantáneo al unmount.
- [ ] **Sampling DOM 30ms toggle rápido <200ms** confirma 0 frames con clase `animate-in slide-in-from-X` espuria sobre componente ya mounted.
- [ ] **Tests F33 1-7 sin regresión** (animaciones simétricas, mutua exclusión G1, breakpoints, console limpia).
- [ ] **Tablet collapsed** (`768×1024`): sidebar inline `w-16`, sin overlay, sin regresión visual.
- [ ] **Mobile drawer** (`375×667`): NavigationDrawer + MobileHeader + BottomNav + FAB intactos.
- [ ] **Sidebar reorg F34** (3 secciones agrupadas + Buscar + Capturar): sin regresión visual durante el swap.
- [ ] **Shortcuts intactos:** Cmd+B toggle, Cmd+K palette, Alt+N QuickCapture.
- [ ] Console limpia (0 errors, 0 warnings) en todo el flujo E2E.
- [ ] No hay overflow horizontal del body durante el swap (el overlay con `translateX(-100%)` queda fuera del viewport sin causar scroll).

---

## Siguiente fase

F35 cierra el alcance del modo hidden (F31-F35). Después: feature work de dominio (Tags como entidad first-class si surge la necesidad — el screenshot de F34 lo sugería), o polish móvil (MobileHeader como entrypoint search, FAB long-press menu). Sin compromiso de orden — definir post-merge según prioridad.
