# SPEC — SecondMind · F41: Splash Tauri Desktop (hide-until-ready)

> **Estado:** Implementada en branch `feat/splash-tauri-f41` (commit `ca9554d`, Mayo 2026). Pre-QA Windows desktop + pre-merge a `main` + pre-rebuild Tauri (MSI/NSIS).
> Alcance final: main window arranca oculta (`visible:false`) y se revela tras el primer mount del Layout via `showMainWindow()` desde `useHideSplashWhenReady`. Reusa `<AppBootSplash>` + patrón idempotente module-scope de F40.
> Stack: Tauri 2.10.3 + `@tauri-apps/api` v2.10.1 (webviewWindow API moderna), `<AppBootSplash>` React, `useHideSplashWhenReady` hook cross-platform.

---

## Objetivo

Eliminar el flash blanco entre que la window Tauri (Windows MSI/NSIS prod o `npm run tauri:dev`) aparece y que React + `<AppBootSplash>` termina el primer paint. El usuario ve directamente el branded splash desde el primer frame visible. Equivalente desktop del problema que F40 atacó en Android.

Síntoma previo: window en blanco ~50–300ms en cold start prod, hasta ~1–3s con bootstrap auth + hidratación TinyBase.

---

## Resultado final implementado

Estrategia A del plan: `visible:false` Tauri config + `showMainWindow()` post-paint del Layout. Estrategias B (show post-bootstrap completo) y C (HTML inline en `index.html`) descartadas en audit por degradar UX o duplicar lógica de splash.

**Capa 1 — Tauri config (`src-tauri/tauri.conf.json`):**

- Main window con `"visible": false` (línea 23). La window arranca oculta tras lanzar el `.exe`. Capture window ya tenía `visible:false` desde antes y no se toca.

**Capa 2 — Reveal trigger (React):**

- `showMainWindow()` se llama desde `useHideSplashWhenReady` en `useEffect` post-paint del Layout, en el mismo hook que ya disparaba `hideSplash()` para Capacitor.
- El WebView monta React + `<AppBootSplash>` mientras la window está oculta. El primer frame visible al usuario YA contiene el branded splash (logo 174px + "SecondMind" sobre `bg-background`).

**Capa 3 — Idempotency (`src/lib/tauri.ts`):**

- Flag `mainWindowShown` module-scope (mismo patrón que `hideSplash` F40). Multiple calls = no-op tras la primera.
- Cubre: StrictMode double-mount (dev), `tauri-plugin-single-instance` `show()` desde Rust en 2da instancia, HMR full-reload (resetea flag pero el plugin Tauri ya hace `show()` idempotente del lado nativo).

**Capa 4 — Safety net (`src/main.tsx`):**

- `setTimeout(5000)` en `if (isTauri())` block, paralelo al `if (isCapacitor())` que F40 dejó.
- Si Layout no monta en 5s (crash pre-mount, bootstrap colgado), la window aparece igual — no se queda en `.exe` invisible para siempre.
- Idempotente: si Layout monta antes (>95% caso normal), el call del hook fija el flag y el timeout es no-op.

**Lifecycle:**

- Click `.exe` → process Tauri arranca con window oculta.
- WebView carga bundle Vite → React mount → Layout mount → `useEffect` dispara `hideSplash()` (no-op web/Tauri) + `showMainWindow()`.
- `showMainWindow()` → `main.show() + unminimize() + setFocus()`. Window aparece con `<AppBootSplash>` YA pintado.
- `bootSplashMinElapsed` gate (800ms, F40) garantiza perceptibilidad incluso en cold starts rápidos.

---

## Archivos finales

### Modificados (4 archivos, 34 insertions / 12 deletions)

- `src-tauri/tauri.conf.json` — main window agrega `"visible": false`. Capture window unchanged.
- `src/lib/tauri.ts` — `showMainWindow()` agrega flag `mainWindowShown` module-scope + try/catch defensivo. `isTauri()` y `hideCurrentWindow()` unchanged.
- `src/hooks/useHideSplashWhenReady.ts` — import `showMainWindow` + call `void showMainWindow()` en el mismo `useEffect` que ya disparaba `void hideSplash()`. Comentario expandido a dual-platform (Capacitor hideSplash + Tauri showMainWindow). Ambas calls son no-op en web.
- `src/main.tsx` — import `isTauri, showMainWindow` desde `@/lib/tauri` + bloque `if (isTauri())` con `setTimeout(() => void showMainWindow(), 5000)`. Paralelo al `if (isCapacitor())` existente.

### Sin tocar

- `src/components/layout/AppBootSplash.tsx` — reusable cross-platform desde F40.
- `src/lib/splash.ts` — Capacitor-only.
- `src/app/layout.tsx` — ya invocaba `useHideSplashWhenReady()` desde F40 (línea 40). Cero cambios; el wiring nuevo entra "por debajo" del hook.
- `src-tauri/src/lib.rs` y `src-tauri/src/tray.rs` — Rust intacto. `tauri-plugin-single-instance` y `tauri-plugin-window-state` siguen registrados igual.
- `index.html` — sin HTML inline pre-React (estrategia C descartada).

### Creados / Eliminados

Ninguno.

---

## Desviaciones sobre el plan original

### D1 — Diff stat ligeramente mayor que estimado

**Plan original:** ~12 líneas netas.

**Final:** 34 insertions / 12 deletions = 22 netas.

**Razón:** comentarios expandidos en `useHideSplashWhenReady` (4 líneas para describir el dual-platform pattern Capacitor+Tauri y el rationale de "primer mount, no fin de bootstrap") y en `main.tsx` (3 líneas de safety timeout rationale). Coherente con la regla "comentar el WHY no obvio". El bytecount funcional sigue siendo 12 líneas.

### D2 — Sin desviaciones técnicas vs el plan

Las 5 mitigaciones (R1–R5) del plan se mantuvieron como aceptables sin cambios:

- R1 (`useEffect` vs `useLayoutEffect`/RAF): no emergió necesidad de mover a RAF; aceptable hasta QA.
- R2 (`tauri-plugin-window-state` orden de registro): verificado pre-implementación, ya está antes del setup callback en `lib.rs`.
- R3 (single-instance race con cold start): aceptado como edge case raro; fix diferido a F42 si emerge feedback.
- R4 (HMR borra flag): aceptable, plugin Tauri es idempotente del lado Rust.
- R5 (`setFocus()` en safety roba foco): aceptable, ocurre solo en bootstrap fallido (UX ya degradada).

---

## Plan de verificación E2E (pendiente, 10 casos)

Pre-merge requiere QA en Windows desktop. Casos del plan:

1. **Cold start prod (MSI instalado, primera vez tras reboot)** — window aparece directo con `<AppBootSplash>`, sin frame blanco, mínimo 800ms perceptible.
2. **Warm start prod** — más rápido pero sin flash.
3. **Cold start dev (`npm run tauri:dev`)** — ~500ms-1s de "nothing happens" (Vite serve), luego window con AppBootSplash sin flash.
4. **Dark mode** — fondo oscuro sin flash a light durante reveal.
5. **Light mode** — análogo.
6. **Single instance race** — 2da instancia durante cold start de la 1ra (~200ms ventana), `single_instance` plugin dispara `show()` desde Rust → window aparece con AppBootSplash, hook idempotente.
7. **Safety timeout 5s** — DevTools offline o killear Vite mid-load: window aparece igual a los 5s.
8. **StrictMode double-mount (dev)** — `showMainWindow()` invoca pero solo dispara plugin Tauri 1x.
9. **Tray show/hide cycle (F7)** — sin flash blanco al re-show.
10. **Auto-update flow (F8)** — process restart no regenera flash.

Comandos:

```bash
npm run tauri:dev                                      # casos 3, 8
npm run tauri:build                                    # genera MSI + NSIS firmados
# instalar MSI desde src-tauri/target/release/bundle/msi/, luego:
# casos 1, 2, 4, 5, 6, 7, 9, 10 desde Start Menu / desktop shortcut
```

---

## Gotchas a escalar (post-QA)

Candidato principal a `Spec/gotchas/tauri-desktop.md`:

**Hide-until-ready de main window** (post-F41) — `visible:false` en `tauri.conf.json` + `showMainWindow()` idempotente desde `useEffect` post-paint del Layout. Patrón canónico Tauri 2.x contra flash blanco entre window OS y primer paint React. La idempotency module-scope es obligatoria: cubre StrictMode dev, `tauri-plugin-single-instance` `show()` desde Rust en 2da instancia mid-cold-start, y HMR full-reload. Pareja con F40 móvil: `useHideSplashWhenReady` es el handoff cross-platform unificado (Capacitor `hideSplash` + Tauri `showMainWindow`).

Posible gotcha si emerge en QA:

**`tauri-plugin-single-instance` show() race con cold start** — si la 2da instancia llega durante los ~200ms de cold start de la 1ra, el plugin Rust llama `window.show()` ANTES que React monte, exponiendo flash blanco breve. Mitigación R3 del plan: aceptar como caso edge raro; si feedback usuario lo eleva, fix complejo (race entre setup Rust y mount React) en F42.

---

## Cierre

Pendiente:

1. QA en Windows desktop (10 casos).
2. Merge `--no-ff feat/splash-tauri-f41 → main`.
3. `npm run tauri:build` para regenerar MSI + NSIS firmados (auto-updater F8 los propaga a usuarios desktop existentes vía `latest.json`).
4. Step 8 SDD: actualizar `Spec/ESTADO-ACTUAL.md` con pointer a este SPEC + escalar el gotcha de "Hide-until-ready" a `Spec/gotchas/tauri-desktop.md`.

CFs no cambian (cambio 100% client-side). Hosting web no cambia (post-F6 theme anti-flash, la web ya no tiene flash relevante). Capacitor Android no cambia.
