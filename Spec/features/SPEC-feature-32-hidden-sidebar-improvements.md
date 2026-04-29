# SPEC F32 — Hidden Sidebar Mode Improvements

> Alcance: 4 mejoras post-F31 que cierran las 4 deudas explícitas del out-of-scope original (toggle desde palette, event.code universal, animación de transición, anti-flash con localStorage).
> Dependencias: F31 (UserPreferences.sidebarHidden, useSidebarVisibilityShortcut, TopBar, gate page.tsx).
> Estimado: ½ sesión (3 cambios mecánicos + 1 visual con decisión de approach).
> Stack relevante: React 19, TinyBase, Firestore, Tailwind v4 + tw-animate-css, localStorage.

---

## Objetivo

Pulir las cuatro deudas explícitas dejadas en F31 sin alterar el modelo persistente ni las decisiones D1–D8. Resultado:

- **Ergonomía equivalente al shortcut** desde Command Palette (entry dinámica única "Ocultar sidebar" / "Mostrar sidebar" según estado, solo en desktop).
- **Cierre de la deuda layout-independence universal** migrando los dos shortcuts legacy del repo (Cmd+K, Alt+N) al patrón canónico `event.code` establecido en F31.
- **Animación de transición sidebar↔TopBar** que solo dispara en cambios interactivos, no en mount inicial (clave para que F32.4 no genere ruido visual en cada page load).
- **localStorage anti-flash** que elimina el flash sidebar→TopBar de ~100-300ms para usuarios con `sidebarHidden=true` persistido. Cierra la deuda D7 documentada en F31 como "aceptable v1".

Ningún cambio toca `UserPreferences` schema, security rules, ni Cloud Functions. Cero migración de datos.

---

## Features

### F32.1 — Toggle bidireccional desde Command Palette

**Qué:** Una sola entry dinámica en `QUICK_ACTIONS` que cambia label + icon según el estado actual de `preferences.sidebarHidden`. Solo visible en desktop (≥1024px) y con sesión activa.

- Estado `sidebarHidden=false` → entry "Ocultar sidebar" con `PanelLeftClose`.
- Estado `sidebarHidden=true` → entry "Mostrar sidebar" con `PanelLeftOpen`.
- Click → `setPreferences(user.uid, { sidebarHidden: !current })` y luego `close()` del palette.

**Criterio de done:**

- [ ] Desktop con sidebar visible: Cmd+K muestra "Ocultar sidebar" como última entry de Acciones; Enter oculta el sidebar y cierra el palette.
- [ ] Desktop con sidebar oculto: Cmd+K muestra "Mostrar sidebar" con icon `PanelLeftOpen`; Enter restaura el sidebar.
- [ ] Tablet 768 y mobile 375: la entry NO aparece (8 entries originales sin agregado).
- [ ] La búsqueda con query (`/notes`, etc.) sigue mostrando solo resultados, NO la entry de toggle.
- [ ] El estado se actualiza en vivo: si Cmd+B se dispara mientras el palette está abierto, el label refleja el cambio en el siguiente render.

**Archivos a crear/modificar:**

- `src/components/layout/CommandPalette.tsx` — discriminar `QuickAction` en `kind: 'navigate' | 'handler'`; computar `quickActions` con `useMemo` que lee `useBreakpoint`, `usePreferences`, `useAuth` para sumar la entry dinámica al final del array; `navigateTo` invoca `data.handler()` cuando `kind === 'handler'` antes del `onClose`.

**Notas de implementación:**

Tipo discriminado:

```ts
type QuickAction =
  | { id: string; label: string; icon: typeof FileText; kind: 'navigate'; url: string }
  | { id: string; label: string; icon: typeof FileText; kind: 'handler'; handler: () => void };
```

`quickActions` se construye dentro de `CommandPaletteContent` (no a nivel de módulo) porque depende de hooks. Las 8 entries actuales mantienen `kind: 'navigate'`. La novena entry solo se agrega cuando `breakpoint === 'desktop' && user`. Mantener el array hardcoded — no extraer a `useQuickActions` separado: 9 entries no justifican abstracción (sigue principio "tres similar lines mejor que premature abstraction" del CLAUDE.md).

---

### F32.2 — Migración Cmd+K y Alt+N a `event.code`

**Qué:** Cierre de la deuda explícita F31 sobre los dos shortcuts existentes que siguen usando `event.key`. Migración mecánica al patrón canónico establecido en `useSidebarVisibilityShortcut` (`event.code === 'KeyX'`), independiente del layout físico (Dvorak/AZERTY siguen funcionando).

**Criterio de done:**

- [ ] `CommandPaletteProvider` matchea con `event.code === 'KeyK'` + check explícito de `!event.shiftKey && !event.altKey` (paridad con `useSidebarVisibilityShortcut`).
- [ ] `QuickCaptureProvider` matchea con `event.code === 'KeyN'`; el doble check `event.key !== 'n' && event.key !== 'N'` desaparece (event.code no varía con shift).
- [ ] QWERTY estándar: Cmd+K abre/cierra palette, Alt+N abre QuickCapture (paridad funcional).
- [ ] Test manual con DevTools "Keyboard layout" en Dvorak (o swap físico): los shortcuts siguen funcionando en la tecla física B/K/N de QWERTY.
- [ ] Sin regresión: `useSidebarVisibilityShortcut` sigue intacto (ya está en event.code desde F31.5).

**Archivos a crear/modificar:**

- `src/components/layout/CommandPalette.tsx` — línea 33, `event.key === 'k'` → `event.code === 'KeyK' && !event.shiftKey && !event.altKey`.
- `src/components/capture/QuickCaptureProvider.tsx` — líneas 47–52, simplificar a single-check `event.code === 'KeyN'` (mantener el guard de modificadores `!event.altKey || event.ctrlKey || ...` invertido como hoy).

**Notas de implementación:**

**No agregar guards de `activeElement`** en este SPEC. F31 los introdujo solo para `useSidebarVisibilityShortcut` porque Cmd+B colisiona con bold de TipTap. Cmd+K no colisiona con ningún atajo del editor (TipTap no lo mapea), y Alt+N tampoco — abrir el palette/QuickCapture desde un input es comportamiento esperado. La deuda que F32 cierra es **layout-independence**, NO foco-awareness; mezclar ambos cambia el comportamiento intencional. Si en el futuro surge demanda de "no abrir palette desde un textarea", se evalúa por separado.

---

### F32.3 — Animación sidebar↔TopBar (toggle-only)

**Qué:** Animación de entrada del componente que se monta tras el toggle. Sidebar entra con `slide-in-from-left`, TopBar con `slide-in-from-top`, ambos `duration-200`. **Solo dispara en cambios interactivos** — el mount inicial (page load) NO anima, evitando ruido en cada carga para usuarios con hidden=true persistido.

**Criterio de done:**

- [ ] Cmd+B desde sidebar visible → sidebar desmonta instantáneo + TopBar entra deslizándose desde arriba en ~200ms.
- [ ] Cmd+B desde TopBar → TopBar desmonta instantáneo + sidebar entra deslizándose desde la izquierda en ~200ms.
- [ ] Page load inicial con `sidebarHidden=true` (post-F32.4) → TopBar aparece estático, SIN slide-in. Refresh repetido confirma cero animación inicial.
- [ ] Toggle desde Settings y desde palette tienen idéntica animación.
- [ ] Toggle rápido (Cmd+B → Cmd+B antes de 300ms) no rompe: el setTimeout previo se cancela vía cleanup del effect.

**Archivos a crear/modificar:**

- `src/app/layout.tsx` — sumar `useRef<boolean>(true)` para detectar mount inicial, `useState<boolean>(false)` para `animateLayoutSwap`, y un `useEffect` con dep `[sidebarHiddenEffective]` que sale temprano en el primer render y dispara `setAnimateLayoutSwap(true)` + `setTimeout(false, 300)` en cambios subsecuentes. Pasar prop `animateEntry={animateLayoutSwap}` a Sidebar y TopBar.
- `src/components/layout/Sidebar.tsx` — sumar prop opcional `animateEntry?: boolean` a `SidebarProps`; si true, agregar `animate-in slide-in-from-left duration-200` al `cn()` del `<aside>`.
- `src/components/layout/TopBar.tsx` — sumar prop opcional `animateEntry?: boolean`; si true, agregar `animate-in slide-in-from-top duration-200` al `<header>`.

**Notas de implementación:**

Approach descartado **A** — _animación siempre en mount_: una clase `animate-in slide-in-from-X` fija en TopBar/Sidebar dispara también al cargar la página, generando un slide-in cada vez que el usuario abre la app. Para hidden mode persistido (caso común post-F32.4), se vuelve molesto.

Approach descartado **B** — _AnimatePresence custom con exit-anim_: implica retardar unmount con setTimeout + state intermedio (`isExiting`). Doble la complejidad para que el componente saliente también deslize fuera. El asimétrico "el que entra anima, el que sale desmonta" es 80% del valor con 20% del costo.

Approach elegido **C** — _toggle-only mount-anim_:

```ts
const isInitialMount = useRef(true);
const [animateLayoutSwap, setAnimateLayoutSwap] = useState(false);

useEffect(() => {
  if (isInitialMount.current) {
    isInitialMount.current = false;
    return;
  }
  setAnimateLayoutSwap(true);
  const timer = window.setTimeout(() => setAnimateLayoutSwap(false), 300);
  return () => window.clearTimeout(timer);
}, [sidebarHiddenEffective]);
```

Dep es `sidebarHiddenEffective` (ya derivado en layout). El cleanup cancela el timer si el user toggea de nuevo antes de 300ms — la animación nueva se dispara con state fresco.

Aplicable a cualquier futura transición de chrome global (sidebar/TopBar/header/etc.) que necesite distinguir mount inicial de toggle interactivo.

---

### F32.4 — localStorage hint anti-flash

**Qué:** Cachear `sidebarHidden` en `localStorage` por uid al recibir cada snapshot real. Al montar el layout, leer el hint sincrónamente como valor inicial de `sidebarHidden` antes de que `subscribePreferences` complete. Elimina el flash sidebar→TopBar de ~100-300ms para usuarios con `hidden=true` persistido. Cierra la deuda D7 documentada en F31 como "aceptable v1".

**Criterio de done:**

- [ ] Usuario con `sidebarHidden=true` persistido refrescha la página → TopBar visible desde el primer frame, sin flash inverso del sidebar (verificable con Network throttle "Slow 3G" + grabación de pantalla).
- [ ] Usuario con `sidebarHidden=false` (default) refrescha → sidebar visible desde el primer frame (sin cambio respecto a F31).
- [ ] Sign-out + sign-in de otra cuenta → el hint del primer uid no contamina al segundo (key incluye uid).
- [ ] localStorage no disponible (ej. iOS private mode, navegador con storage deshabilitado) → fallback silencioso al comportamiento F31 (try/catch + return null). Sin runtime error en consola.
- [ ] Anti-flash quita el AND-gate `prefsLoaded && preferences.sidebarHidden` en `layout.tsx` para que `sidebarHiddenEffective = preferences.sidebarHidden` use el state hidratado por el hint. Otros campos (`distillIntroSeen`, `trashAutoPurgeDays`) siguen usando `prefsLoaded` como antes.
- [ ] Edge case documentado: hint stale cross-device (user cambió en device A a `false`, abre device B con hint `true`) → flash inverso TopBar→Sidebar de una vez. Aceptable como trade-off frente al caso común.

**Archivos a crear/modificar:**

- `src/lib/preferences.ts` — sumar `readSidebarHiddenHint(uid: string): boolean | null` y `writeSidebarHiddenHint(uid: string, value: boolean): void` con try/catch defensivo. Key: `'secondmind:sidebarHidden:' + uid`. `null` retornado cuando no hay hint o localStorage falla.
- `src/hooks/usePreferences.ts` — en el effect de `[user]`, después de `setIsLoaded(false)` y antes de `subscribePreferences`, leer `readSidebarHiddenHint(uid)` y si es no-null hacer `setPreferences((prev) => ({ ...prev, sidebarHidden: hint }))`. En el callback de subscribe, después de `setIsLoaded(loaded)`, escribir `writeSidebarHiddenHint(uid, p.sidebarHidden)`.
- `src/app/layout.tsx` — `sidebarHiddenEffective` pasa de `prefsLoaded && preferences.sidebarHidden` a `preferences.sidebarHidden` (sin AND-gate). Decisión D7 de F31 queda revisada — se documentará en el SPEC de cierre. `prefsLoaded` sigue usándose para gates de side-effects de otros campos (banners, intros) — solo `sidebarHidden` se desacopla del flag.

**Notas de implementación:**

**Por qué solo `sidebarHidden` y no todo el shape de preferences en el hint:** los otros campos (`trashAutoPurgeDays`, `distillIntroSeen`, `distillBannersSeen`) gobiernan side-effects que NO pueden disparar con valores stale (banner one-time se marcaría como visto contra hint, pisa el valor real al llegar). `sidebarHidden` solo afecta layout — un valor stale por 100ms produce flash visual, no corrupción de state. Limitación intencional.

**Por qué key incluye uid:** sin uid, multi-account en el mismo browser cruza preferencias (user A `hidden=true` + sign-out + user B `hidden=false` → hint `true` se lee al login de B, flash inverso por 300ms). Con uid, cada cuenta tiene hint propio. Costo: una clave extra de localStorage por cuenta — despreciable.

**Sign-out NO limpia el hint:** próximo login del mismo uid hidrata correcto. Si el usuario quiere "olvidar" el state, lo cambia desde Settings (write fresh hint) o limpia localStorage manualmente. No hay pérdida de privacidad — el dato es boolean trivial.

**`writeSidebarHiddenHint` se invoca solo cuando `loaded === true`:** evita escribir el DEFAULT del cache `subscribePreferences` (pre-snapshot) que pisaría un hint válido durante el rare case del cache hit con isLoaded=false (sucede con múltiples consumers compartiendo cache).

---

## Orden de implementación

1. **F32.2** (event.code migration) — primero. Cero acoplamiento con las otras 3, cambios mecánicos de 2 líneas cada uno. Validar que no rompe nada (smoke test Cmd+K + Alt+N en QWERTY) antes de proceder.
2. **F32.4** (localStorage hint) — segundo. Independiente de F32.1 y F32.3. Crítico antes de F32.3 porque la animación + el flash combinados duplican la fealdad inicial: con anti-flash el TopBar arranca estático en el frame 1, el slide-in de F32.3 solo dispara en toggles interactivos.
3. **F32.1** (Toggle desde palette) — tercero. Independiente del resto pero conceptualmente sigue al F32.4 (no anti-flash el toggle desde palette). Confirma E2E que el palette dispara `setPreferences` correctamente.
4. **F32.3** (Animación) — último. Polish visual sobre las 3 anteriores estables. Permite iterar el approach C sin revisitar lógica de prefs/palette.

---

## Estructura de archivos

```
src/
├── app/
│   └── layout.tsx                              # MODIFICAR: useRef+useState+useEffect para animateLayoutSwap; quitar AND-gate sobre sidebarHidden
├── components/
│   ├── layout/
│   │   ├── CommandPalette.tsx                  # MODIFICAR: kind discriminado, useMemo de quickActions, navigateTo handler-aware, event.code en provider
│   │   ├── Sidebar.tsx                         # MODIFICAR: prop animateEntry?, clase animate-in condicional
│   │   └── TopBar.tsx                          # MODIFICAR: prop animateEntry?, clase animate-in condicional
│   └── capture/
│       └── QuickCaptureProvider.tsx            # MODIFICAR: event.code === 'KeyN'
├── hooks/
│   └── usePreferences.ts                       # MODIFICAR: hidratar sidebarHidden desde hint pre-subscribe; escribir hint en cb
└── lib/
    └── preferences.ts                          # MODIFICAR: agregar readSidebarHiddenHint / writeSidebarHiddenHint
```

Cero archivos nuevos. 7 archivos modificados.

---

## Definiciones técnicas

### Hint key shape — `secondmind:sidebarHidden:${uid}`

- **Opciones consideradas:** A) key sin uid (`'secondmind:sidebarHidden'`), B) key con uid prefix.
- **Decisión:** B.
- **Razón:** evita cross-account leak en multi-account browsers. Costo trivial (1 entry extra de localStorage por cuenta vs. corrupción visible cross-account).

### Animación: toggle-only vs. always-on-mount

- **Opciones consideradas:** A) `animate-in` siempre; C) gate por `useRef(isInitialMount)` + `setTimeout`.
- **Decisión:** C.
- **Razón:** A genera ruido visual en cada page load para usuarios con hidden persistido (caso común post-F32.4). C aísla la animación a cambios interactivos por costo medio (un useEffect + un ref + un state booleano, ~10 líneas en `layout.tsx`).

### Toggle palette vs. Quick Action genérica

- **Opciones consideradas:** A) extraer `useQuickActions()` hook separado, B) computar inline en `CommandPaletteContent` con useMemo.
- **Decisión:** B.
- **Razón:** 9 entries no justifican abstracción. Si futuras features (tema, modo focus, etc.) suman entries dinámicas, evaluar extracción cuando llegue ese punto.

---

## Checklist de completado

Al terminar F32, TODAS estas condiciones deben ser verdaderas:

- [ ] `npm run lint` y `npm test` pasan sin errores nuevos.
- [ ] Build prod (`npm run build`) compila sin warnings de TS.
- [ ] Cmd+K y Alt+N funcionan en QWERTY (verificación rápida en sesión de cierre).
- [ ] Refresh con `sidebarHidden=true` persistido NO muestra flash de sidebar (E2E con Playwright + throttle).
- [ ] Toggle bidireccional desde 3 entrypoints (Cmd+B, Settings, Palette) anima slide-in del entrante; mount inicial NO anima.
- [ ] Tablet 768 + mobile 375: la entry de toggle del palette NO aparece, comportamiento general intacto.
- [ ] Sign-out + sign-in con cuenta distinta no contamina hint (verificar localStorage en DevTools).
- [ ] localStorage deshabilitado no rompe la app (test manual: bloquear cookies/storage en DevTools y refrescar).
- [ ] `Spec/ESTADO-ACTUAL.md` actualizado: la línea sobre shortcuts existentes pasa a "todos migrados a event.code post-F32.2"; la deuda D7 anti-flash se marca cerrada.
- [ ] SPEC convertido a registro de implementación al merge (formato consistente con F31).
- [ ] Deploy a producción si aplica (cambio 100% client-side: `npm run build && npm run deploy`; Tauri/Android opt-in).

---

## Siguiente fase

F33 queda abierta para definir según prioridad real. Candidatos plausibles según deuda actual del repo: AnimatePresence-style exit-anim si el usuario reporta que el approach C asimétrico se siente incompleto, o `getModKey()` util cross-platform para renderizar `⌘K` vs `Ctrl K` dinámicamente (deuda explícita en F31). Ninguno crítico.
