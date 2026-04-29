# SPEC F33 — Hidden Sidebar Mode Polish

> Alcance: cerrar dos deudas residuales del out-of-scope de F32 — exit-anim simétrico del swap sidebar↔TopBar y entrypoint mouse-only en TopBar para mostrar el sidebar oculto.
> Dependencias: F31 (hidden sidebar mode) + F32 (improvements). Sin cambios en schema Firestore, security rules, ni Cloud Functions.
> Estimado: 1 sesión de trabajo (2 sub-features chicas, paralelizables).
> Stack relevante: tw-animate-css (ya en repo, plugin Tailwind), React hooks (`useState` + `useEffect` + `useRef`), prop threading. Cero deps nuevas.

---

## Objetivo

Pulir los dos gaps visuales/UX más visibles de F32: el saliente del swap layout desmonta instantáneo (asimetría con el entrante que sí desliza), y en hidden mode no hay forma mouse-only de mostrar el sidebar desde el TopBar (logo navega al Dashboard, no togglea). Resultado: swap sidebar↔TopBar simétrico (ambos sentidos animan entrada y salida, ~200ms) + botón explícito "Mostrar menú" en el TopBar como paridad funcional con Cmd+B / Command Palette / Settings.

---

## Sub-features

### F33.1 — Exit-anim simétrico del swap sidebar↔TopBar

**Qué:** El componente que se desmonta tras un toggle de `preferences.sidebarHidden` debe deslizar fuera del viewport (`animate-out slide-out-to-left` para Sidebar, `animate-out slide-out-to-top` para TopBar) durante 200ms antes del unmount real, en paralelo con el `animate-in` del entrante. Hoy el saliente desaparece en 1 frame; F33.1 introduce un wrapper de transición que retarda el unmount lo suficiente para que la clase de salida termine.

**Criterio de done:**

- [ ] Toggle Cmd+B con sidebar visible → sidebar desliza a la izquierda fuera del viewport (~200ms) Y simultáneamente TopBar entra desde arriba.
- [ ] Toggle Cmd+B con TopBar visible → TopBar desliza hacia arriba fuera del viewport (~200ms) Y simultáneamente sidebar entra desde la izquierda.
- [ ] Mount inicial post-reload (con `sidebarHidden=true` o `false`) NO dispara animación de salida — solo cambios subsecuentes animan, paridad con el comportamiento toggle-only de F32.3.
- [ ] Tras la animación de exit (200ms + buffer), el componente se desmonta del DOM (verificable en DevTools).
- [ ] Sampling DOM cada 30ms con Playwright confirma que durante los 200ms el saliente tiene la clase `animate-out slide-out-to-X`, y desaparece del árbol en el frame ≥200ms post-toggle.
- [ ] Sin layout shift visual durante el exit — el slot del saliente sigue ocupado hasta el unmount; el "pop" del main expand al final del exit es aceptado como tradeoff (ver D2).
- [ ] `npm run lint` + `npm run build` limpios.

**Archivos a crear/modificar:**

- `src/hooks/useMountedTransition.ts` — **nuevo.** Hook puro `useMountedTransition(visible: boolean, durationMs: number): { shouldRender: boolean; isExiting: boolean }`. Encapsula el patrón "retardar unmount con setTimeout + state intermedio" mencionado en F32 D7 como follow-up.
- `src/components/layout/Sidebar.tsx` — agregar prop `animateExit?: boolean`; cuando `true` aplicar `animate-out slide-out-to-left duration-200 fill-mode-forwards` vía `cn()`. Mutuamente exclusiva con `animateEntry` por construcción del coordinador (Layout decide).
- `src/components/layout/TopBar.tsx` — agregar prop `animateExit?: boolean`; idem con `animate-out slide-out-to-top duration-200 fill-mode-forwards`.
- `src/app/layout.tsx` — reemplazar los gates `{showSidebar && <Sidebar/>}` y `{showTopBar && <TopBar/>}` por un coordinador con `useMountedTransition`. El `animateLayoutSwap` actual se mantiene para la entrada; la salida la gobierna `useMountedTransition` (sin necesidad de `useLayoutEffect` adicional — el `isExiting` se sincroniza pre-paint porque el hook hace el setState en respuesta al cambio de prop, no en effect post-paint).

**Notas de implementación:**

- **Patrón `setState durante render` (paridad `useExpandThenCollapse`). CRÍTICO — resuelve el skip-initial sin `useRef`.** El hook usa state combinado `{ shouldRender, isExiting, prevVisible }` y detecta cambios de `visible` durante render con un check `if (state.prevVisible !== visible)`. React re-ejecuta el render con state nuevo SIN commit intermedio (ver [React docs](https://react.dev/reference/react/useState#storing-information-from-previous-renders)). Esto resuelve dos problemas a la vez:
  1. **Skip-initial gratis.** En mount inicial `state.prevVisible === visible` (inicializado igual), la rama de update nunca corre. Cero ref auxiliar, cero `eslint-disable`.
  2. **Pre-paint timing.** El `setIsExiting(true)` ocurre durante el render que ya está corriendo, no en `useEffect` post-paint. Sin desfase con el `animate-in` del entrante (cero gap entre exit-anim y entry-anim del swap simultáneo).

  Implementación obligatoria:

  ```ts
  const [state, setState] = useState<InternalState>({
    shouldRender: visible,
    isExiting: false,
    prevVisible: visible,
  });

  if (state.prevVisible !== visible) {
    setState({ shouldRender: true, isExiting: !visible, prevVisible: visible });
  }

  useEffect(() => {
    if (!state.isExiting) return;
    const id = window.setTimeout(() => {
      setState((prev) =>
        prev.isExiting
          ? { shouldRender: false, isExiting: false, prevVisible: prev.prevVisible }
          : prev,
      );
    }, durationMs);
    return () => window.clearTimeout(id);
  }, [state.isExiting, durationMs]);
  ```

  Molde: `src/hooks/useExpandThenCollapse.ts:19-38` (hook canónico del repo). Ver D7 para el rationale completo del patrón sobre la alternativa `useRef + isInitialMount`.

- **`fill-mode-forwards` obligatorio.** Sin `animation-fill-mode: forwards`, al terminar la animación de salida el componente revierte 1 frame a estado inicial antes del unmount → flash visual. tw-animate-css expone la utility `fill-mode-forwards`. Usar siempre.
- **El timer del hook debe limpiarse en cada cambio de `visible`.** Si el user togglea rápido (visible: true → false → true en <200ms), el timer del primer flip no debe disparar el unmount cuando ya volvió a `true`. Patrón canónico: `useEffect` con cleanup que `clearTimeout` el timer pendiente. Con el skip-initial agregado arriba, el cleanup vive en la rama `else` (post-mount visible=false) y se limpia tanto en re-run del effect como en unmount del consumer.
- **`isExiting` vs `animateEntry` son mutuamente exclusivos por contrato.** Cuando un componente está en exit, no puede estar entrando. El Layout pasa `animateEntry={animateLayoutSwap && shouldRender && !isExiting}` para evitar combinar las dos clases (el primer toggle durante un exit-pendiente del swap previo es un edge case; resolver con priority a `animateExit`).
- **Verificación E2E con Playwright sampling DOM cada 30ms.** Mismo método que F32.3 (gotcha consolidado en CLAUDE.md). Ver F32 lección 4 sobre instrumentación con `mcp__playwright__browser_evaluate`. **Cubrir explícitamente reload con `sidebarHidden=true` Y reload con `sidebarHidden=false`** para verificar que el skip-initial funciona en ambas direcciones — sin la verificación bilateral, el bug de mount con `visible=false` pasa silencioso.

---

### F33.2 — Botón "Mostrar menú" en TopBar

**Qué:** Agregar un botón explícito en el TopBar (a la izquierda del logo) que al click setea `preferences.sidebarHidden = false`. Cierra el gap actual donde no hay entrypoint mouse-only en el TopBar para des-ocultar el sidebar (logo navega al Dashboard, no togglea; las únicas vías hoy son Cmd+B, Settings, y la 9ª entry del Command Palette de F32.1).

**Criterio de done:**

- [ ] Botón visible a la izquierda del logo en el TopBar, icono `PanelLeftOpen` de lucide.
- [ ] `aria-label="Mostrar menú"` + `title="Mostrar menú"` para descubribilidad mouse y accesibilidad screen-reader.
- [ ] Click → `setPreferences(user.uid, { sidebarHidden: false })`. Sin re-fetch ni navigate; el snapshot reactivo de `usePreferences` propaga el cambio y el Layout re-renderiza con sidebar visible (con la animación de F33.1).
- [ ] Guard `if (!user) return` defensivo (paridad con `useSidebarVisibilityShortcut`), aunque el botón solo se renderiza dentro del TopBar que ya implica sesión activa.
- [ ] Solo aplicable cuando el TopBar está montado (es decir, `breakpoint === 'desktop' && sidebarHiddenEffective`); no requiere gates extra porque vive en el TopBar mismo.
- [ ] Hover state visible (`hover:bg-sidebar-accent hover:text-sidebar-accent-foreground`, paridad con Link logo y botón Buscar del TopBar).
- [ ] `npm run lint` + `npm run build` limpios.

**Archivos a crear/modificar:**

- `src/components/layout/TopBar.tsx` — agregar el botón antes del `<Link to="/">`. Importar `PanelLeftOpen` de lucide y `setPreferences` de `@/lib/preferences`. Consumir `useAuth()` para `user.uid`.

**Notas de implementación:**

- **Import order quirk preexistente.** Si al sumar el import de `@/lib/preferences` el linter dispara `import/order` (mismo quirk de F32.1 con inline type imports), aplicar `// eslint-disable-next-line import/order` con comentario explicativo. Patrón ya canonizado en `CommandPalette.tsx`.
- **No mostrar `kbd` con shortcut Cmd+B en el botón.** El button es entrypoint mouse-only; agregar el kbd ahí confunde (el shortcut Cmd+B funciona globalmente, no anclado al botón). El tooltip nativo `title="Mostrar menú"` alcanza para descubribilidad.
- **Posición a la izquierda del logo, no a la derecha.** Convención de header layout (hamburger / menu toggle típicamente vive a la izquierda; logo y branding a continuación; acciones contextuales a la derecha). Mover el toggle a la derecha rompería patrón visual de chrome global.

---

## Orden de implementación

1. **F33.1 primero.** Es la deuda con más impacto visual y mayor riesgo de regresión (toca el ciclo de mount del chrome global). Validar en E2E antes de seguir; si la animación de exit se siente mal o introduce layout shift inaceptable, ajustar approach antes de F33.2.
2. **F33.2 después.** Independiente; solo agrega un botón en TopBar. Una vez F33.1 está estable, F33.2 valida automáticamente que la animación del entrante (sidebar slide-in-from-left) sigue funcionando cuando el toggle viene de un click en el TopBar (path nuevo respecto a Cmd+B / Settings / Palette).

Las dos sub-features son paralelizables si se tiene contexto fresco; mantener el orden secuencial reduce la superficie de E2E al cierre.

---

## Estructura de archivos

```
src/
├── hooks/
│   └── useMountedTransition.ts          # nuevo (F33.1)
├── components/
│   └── layout/
│       ├── Sidebar.tsx                  # +prop animateExit (F33.1)
│       └── TopBar.tsx                   # +prop animateExit (F33.1) + botón "Mostrar menú" (F33.2)
└── app/
    └── layout.tsx                       # coordinador useMountedTransition (F33.1)
```

---

## Definiciones técnicas

### D1 — Exit-anim simultáneo al entry-anim, no secuencial

- **Opciones consideradas:** (A) Secuencial — saliente desliza fuera (200ms) → entrante desliza dentro (200ms). Total 400ms. (B) Paralelo — saliente desliza fuera y entrante entra al mismo tiempo. Total 200ms.
- **Decisión:** B (paralelo).
- **Razón:** Total 400ms se siente lento para un toggle frecuente. Paralelo da percepción de crossfade fluido (~200ms) que es lo que el usuario espera para chrome swap. Costo: ambos componentes coexisten en el DOM durante 200ms — no se solapan visualmente porque viven en estructuras flex distintas (Sidebar es hijo del row outer; TopBar es hijo del column inner antes del main).

### D2 — Saliente mantiene su slot del flex durante el exit, no se reposiciona absolute

- **Opciones consideradas:** (A) Reposicionar el saliente a `position: absolute` durante el exit, capturando bounds → permite que el entrante tome el slot inmediatamente y el main ajuste width simultáneamente al exit (smooth). (B) Mantener el saliente en su slot relative; el slot queda ocupado hasta el unmount → el main expande width "de golpe" al final del exit (200ms post-toggle).
- **Decisión:** B.
- **Razón:** A requiere capturar bounds + injectar `position: absolute` con coords exactos al momento del flip — refactor no trivial del Layout, no reusable, y propenso a edge cases (resize durante el exit, scroll, etc.). B mantiene el approach declarativo: el saliente conserva su slot como cualquier otro hijo del flex; al unmount, flex re-flow expande el main. El "pop" final es enmascarado por la animación de salida — el saliente está ~80% fuera de pantalla en el frame del pop. Si surge feedback de que el pop final se nota, escalar a A como follow-up.

### D3 — Hook puro `useMountedTransition`, no inlined en Layout

- **Opciones consideradas:** (A) Inline el patrón en `layout.tsx` con dos pares de useState/useRef/useEffect. (B) Extraer a hook reutilizable.
- **Decisión:** B.
- **Razón:** El patrón "retardar unmount tras flip de visibilidad" es genérico; cualquier futura swap-anim de chrome (drawer slide, modal con backdrop, banner one-time, tabs swipe) lo va a necesitar. Inline duplicaría 15-20 líneas de coordinación y haría el `layout.tsx` más denso. Extraído, el Layout queda declarativo (`const t = useMountedTransition(showSidebar, 200)`).

### D4 — `fill-mode-forwards` obligatorio en `animate-out`

- **Razón:** `tailwindcss-animate` (base de `tw-animate-css`) no aplica `animation-fill-mode: forwards` por default — el componente revierte a estado inicial al terminar la anim, lo que produce un flash visual de 1 frame antes del unmount. Aplicar `fill-mode-forwards` (utility de tw-animate-css) lo deja en estado final hasta el unmount. Aplicable a cualquier futura `animate-out` que combine con unmount post-anim.

### D5 — Botón explícito "Mostrar menú" en TopBar, no hover-edge auto-show

- **Opciones consideradas:** (A) Strip de 8px en el borde izquierdo del viewport que al hover muestra el sidebar (patrón macOS Dock auto-hide). (B) Botón explícito en el TopBar con icono `PanelLeftOpen`. (C) Click en el logo del TopBar togglea sidebar en lugar de navegar al Dashboard.
- **Decisión:** B.
- **Razón:** A introduce divergencia visual sidebar / preferencia (sidebar visible temporariamente sin tocar `sidebarHidden`) → state mgmt complejo + UX learning curve (¿qué pasa si el user mueve el mouse fuera mientras navega? ¿se oculta de vuelta y pierde el flow?). C rompe expectativa estándar de logos como "navegar al home" — confunde más de lo que resuelve. B es el patrón canónico de "menu toggle" en headers (hamburger/menu icon a la izquierda del logo); paridad funcional con Cmd+B sin compromisos. Hover-edge queda como follow-up futuro si hay demanda concreta.

### D6 — Botón a la izquierda del logo, no a la derecha

- **Razón:** Convención visual de chrome global: el toggle de menú vive a la izquierda (hamburger pattern), el branding/logo después, las acciones contextuales (search, sync indicator, captura) a la derecha. Mover el toggle a la derecha rompería el patrón y obligaría al usuario a escanear el header completo para encontrarlo.

### D7 — Patrón `setState durante render` para skip-initial, no `useRef + isInitialMount`

- **Opciones consideradas:** (A) `useRef<boolean>(true)` + `useEffect` con guard `if (isInitialMount.current) { isInitialMount.current = false; return; }` (paridad inline F32.3 en `layout.tsx:50`). (B) `setState durante render` con state combinado `{ shouldRender, isExiting, prevVisible }` y check `if (state.prevVisible !== visible)` (paridad `useExpandThenCollapse` ya en repo).
- **Decisión:** B.
- **Razón:** Cuatro razones convergentes detectadas en step 2 SDD (audit Phase 1 + Plan agent):
  1. **Patrón canónico del repo para hooks reutilizables.** `useExpandThenCollapse` ya canoniza el patrón "setState durante render" para detectar cambios de prop (ver [React docs](https://react.dev/reference/react/useState#storing-information-from-previous-renders)). El `isInitialMount` ref de F32.3 fue un workaround inline aceptable para un único consumer en `layout.tsx`, no un patrón a replicar para hooks reutilizables.
  2. **Skip-initial gratis sin ref auxiliar.** En mount inicial `state.prevVisible === visible` (inicializado igual en `useState`), la rama de update simplemente no corre. Sin necesidad de ref, sin doble-source-of-truth.
  3. **Pre-paint timing sin `useLayoutEffect`.** El audit Phase 1 (Agent 2) detectó que con Opción A en `useEffect`, el `setIsExiting(true)` corre POST-paint → ~30ms de desfase entre el `animate-in` del entrante (que arranca en t=0 vía `animateLayoutSwap` de F32.3) y el `animate-out` del saliente (que arrancaría 30ms tarde). Forzaría `useLayoutEffect` interno con su sync re-render. Opción B resuelve por construcción: el setState durante render ya pre-cede al paint del mismo ciclo.
  4. **Sin `eslint-disable react-hooks/set-state-in-effect`.** Opción A en `layout.tsx:58` requirió silenciar la lint rule porque el setState dentro del effect ES el side-effect intencional. Un hook reutilizable nuevo no debería arrancar con disable.
- **Trade-off rechazado:** Paridad estilística con F32.3 (lo que pidió el user originalmente). Argumento contra: F32.3 fue inline en consumer; F33.1 es un hook reutilizable y debe seguir el patrón canónico de hooks del repo (`useExpandThenCollapse`). Confirmado por user vía AskUserQuestion en step 2 SDD.

### G1 — `animateEntry` y `animateExit` mutuamente exclusivos en consumer

- **Razón:** Si Layout pasa ambas props como `true` simultáneamente al mismo componente, el `cn()` aplicaría `animate-in slide-in-from-X` Y `animate-out slide-out-to-X` en el mismo elemento → comportamiento CSS undefined (el navegador resuelve por orden de declaración, no por intención semántica). El consumer (Layout) debe garantizar la mutua exclusión por construcción:
  ```tsx
  const sidebarTransition = useMountedTransition(showSidebar, 200);
  // ...
  <Sidebar
    animateEntry={animateLayoutSwap && !sidebarTransition.isExiting}
    animateExit={sidebarTransition.isExiting}
  />;
  ```
  El `&& !isExiting` es el guard crítico: cuando el saliente está en exit, `animateEntry` queda `false` aunque `animateLayoutSwap` siga `true` durante los primeros 300ms del swap. Detectado por Plan agent (Q4 G1) — sin el guard, el saliente podría recibir ambas clases en el primer frame del exit. Aplicable simétricamente a TopBar.

---

## Checklist global de completado

- [ ] `npm run dev` arranca sin errores de TypeScript ni runtime.
- [ ] `npm run lint` + `npm run build` limpios.
- [ ] E2E con Playwright en `1280×800` cubre: toggle Cmd+B en ambos sentidos con animación de salida visible, mount inicial sin animación, click en botón "Mostrar menú" del TopBar, console limpia.
- [ ] E2E en `768×1024` (tablet) y `375×667` (mobile) confirma que F33.1/F33.2 NO afectan los chromes alternos (sidebar collapsed / drawer / BottomNav).
- [ ] Reload con `localStorage.sidebarHidden:${uid} = 'true'` muestra TopBar (con el nuevo botón) desde frame 1 sin slide.
- [ ] Toggle rápido Cmd+B varios cambios en <200ms NO produce errores ni componentes "stuck" en exit (el cleanup del timer del hook funciona).
- [ ] Hooks recientes de PostToolUse (Prettier + ESLint --fix) pasan en cada commit atómico.
- [ ] Deploy: `npm run build && npm run deploy` (hosting). Tauri/Capacitor opcional — F33 es 100% client-side sin tocar `src-tauri/` ni `android/`.

---

## Out of scope (deuda explícita)

- **Hover-edge auto-show del sidebar.** Descartado en D5 por complejidad de state mgmt. Si surge demanda concreta de "modo dock" tipo macOS, escalar a F34.
- **Animar el width del main durante el exit (smooth pop).** Requiere `position: absolute` durante exit + capture de bounds (D2 opción A). Aceptado v1 con el approach simple; escalar si el pop final se siente mal en uso real.
- **`getModKey()` util cross-platform** para renderizar `⌘B` en mac y `Ctrl B` en win/linux dinámicamente. Sigue postergado de F31/F32 — el botón nuevo no muestra shortcut, así que F33 no fuerza la decisión.
- **Cleanup explícito del hint en signOut.** Sigue postergado de F32. F33 no toca `preferences.ts` ni el hint.
- **Race del hint stale cross-device.** Sigue aceptado v1 (documentado en F32). F33 no afecta.
- **Refactor a `useQuickActions()` extraído** del CommandPalette. Sigue postergado de F32 (9 entries todavía caben cómodas inline).

---

## Siguiente fase

F33 cierra las dos deudas de mayor impacto del out-of-scope de F32. Las restantes (`getModKey`, hover-edge, hint cleanup, race cross-device, refactor `useQuickActions`) son optimización marginal — defer hasta que algo las gatille. Próxima fase probable es **F34** orientada a contenido nuevo (no polish del sidebar), salvo que la animación o el botón de F33 abran feedback visual que justifique iteración.
