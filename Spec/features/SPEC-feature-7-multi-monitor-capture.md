# SPEC — SecondMind · Feature 7: Capture Window Multi-Monitor (Registro de implementación)

> Estado: Completada — Abril 2026 (3 rondas de fix post-merge)
> Commits:
>
> - Base: `1ec915f` (capabilities), `a3f8328` (hook JS), `2e36424` (tray Rust), `a2d04f1` (docs)
> - Round 1: `1830414` (scaleFactor calc + double setPosition) — no resolvió los bugs reales
> - Round 2: `ba291b7` (shortcut movido a Rust + onScaleChanged listener) — Bug A resuelto; Bug B destapó panic de tao
> - Round 3: `b856051` (drag removido, F4 revertido) — tao#3610 queda fuera de scope
>
> Gotchas operativos vigentes → [`Spec/ESTADO-ACTUAL.md`](../ESTADO-ACTUAL.md) sección "Tauri Desktop (Fase 5.1 + Feature 7)".

---

## Objetivo

El usuario con setup multi-monitor invoca la captura rápida (`Ctrl+Shift+Space` o menú tray) y la ventana aparece centrada en el monitor donde está su cursor — no en el primario.

El bug original: `tauri.conf.json` definía `"center": true`, que Tauri interpreta como "centro del primario" (no "del monitor activo"), y `window_state` tenía `capture` en denylist impidiendo persistir posición. Combinado, la ventana siempre abría en primary en setups multi-monitor.

---

## Qué se implementó

- **F1 — Capabilities de la capture window:** se agregaron los permisos `core:window:allow-set-position`, `core:window:allow-outer-size`, `core:window:allow-start-dragging` a `capture.json`. Round 2 sumó `core:window:allow-set-size` (para el `setSize` post-show en Rust). Round 3 removió `allow-start-dragging` (junto con el drag revertido). Archivos tocados: `src-tauri/capabilities/capture.json`, `src-tauri/capabilities/default.json` (removidas `global-shortcut:*` en round 2 tras mover el registro a Rust).

- **F2 — Reposicionamiento al monitor del cursor:** cálculo de posición centrada en el monitor que contiene el cursor (hit-test con `cursor.x >= pos.x && cursor.x < pos.x + size.width` + `?? monitors[0]` como fallback). Implementación inicial fue un callback en hook JS; **movida enteramente a Rust en round 2** al descubrir que el hook se montaba en ambas ventanas del bundle. Dimensiones físicas calculadas con `scale_factor * LOGICAL_SIZE` (no `outer_size()`, que queda stale tras cross-DPI drift). `set_position` se llama dos veces (pre y post `show()`) por quirk de Windows con hidden-window setPosition. Archivos tocados: `src-tauri/src/lib.rs` (registro `with_handler` en `setup()`), `src-tauri/src/tray.rs` (helper `compute_cursor_monitor_position` + `show_capture` unificado); `src/hooks/useGlobalShortcutRegistration.ts` eliminado en round 2.

- **F3 — Handler Rust del tray unificado con el shortcut:** el menú "Captura rápida" del system tray y el global shortcut comparten el mismo `tray::show_capture(app)` (pub(crate)). Un único point-of-truth tras round 2 — la duplicación JS/Rust del SPEC original dejó de existir cuando el shortcut se movió a Rust. Archivos tocados: `src-tauri/src/tray.rs`.

- **F4 — Drag desde header: REVERTIDO en round 3.** La feature original (drag de la ventana frameless desde el header vía `data-tauri-drag-region`) habilitaba cross-DPI drag, que dispara [tauri#3610](https://github.com/tauri-apps/tauri/issues/3610) sin workaround sano a nivel app. Removido: `data-tauri-drag-region` de ambas variantes del page. Capture es efímera por diseño — para mover a otro monitor, re-invocar el shortcut con el cursor ahí. Archivos tocados: `src/app/capture/page.tsx`.

---

## Decisiones clave

| #   | Decisión                                         | Razón                                                                                                                                                                                                                                                         |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Duplicar lógica en JS (hook) y Rust (tray)       | **Moot tras round 2:** la duplicación desapareció al mover el shortcut a Rust. El handler del shortcut y el del tray comparten `show_capture`. La latencia IPC que justificaba D1 originalmente no es un issue porque ambos handlers corren en contexto Rust. |
| D2  | No persistir última posición de capture          | `window_state` con denylist `["capture"]` es intencional: capture es efímera, siempre "fresh". Persistir posición no resuelve el caso "user cambia de monitor" — la posición persistida sigue mal. Post round 3 esto también justifica no tener drag.         |
| D3  | `try/catch` en JS; `let _ =` en Rust             | Fallbacks silenciosos para no dejar la ventana oculta. **Ajustado en round 1:** JS pasó a `console.error` porque `catch { /* silent */ }` ocultó los bugs DPI durante varias pruebas. Rust sigue con `let _ =` porque los errores van a los logs del plugin.  |
| D4  | Monitor que "contiene" el cursor, no el "activo" | Windows no tiene concepto claro de "monitor activo". El cursor es la señal más confiable de dónde está la atención del usuario.                                                                                                                               |
| D5  | Drag region solo en header, no full window       | **Moot tras round 3:** drag completamente removido. La razón original (evitar drag accidental en textarea/footer) ya no aplica.                                                                                                                               |

---

## Rondas de fix

F7 llegó a main tras verificación automatizable (cargo check + tsc + eslint limpios). Al probar con hardware multi-monitor real aparecieron dos bugs que la verificación automatizable no podía capturar. Los tres rounds se suceden porque cada uno reveló que el fix previo atacó un síntoma, no la causa.

### Bug A — Shortcut abría en última posición, ignorando cursor

**Síntoma:** `Ctrl+Shift+Space` con cursor en monitor B seguía abriendo la ventana donde se había dejado la vez anterior.

**Intento fallido (round 1):** hipótesis de que `setPosition()` en hidden windows era inconsistente en Windows. Fix: llamar `setPosition` dos veces (pre y post `show()`) + calcular dimensiones con `scale_factor` en vez de `outer_size()`. **No funcionó.** El bug persistía.

**Root cause real (round 2):** el hook `useGlobalShortcutRegistration` se montaba en AMBAS ventanas del bundle — `main` y `capture` comparten `main.tsx`. La secuencia `isRegistered → unregister → register` corría dos veces, y el callback final quedaba registrado en el contexto de la ventana `capture` operando sobre sí misma en hidden state. Operar `setPosition` sobre tu propia ventana desde su propio contexto JS tiene [quirks conocidos de Windows (tauri#6843)](https://github.com/tauri-apps/tauri/issues/6843) que ningún double-call post-show podía arreglar — la causa no era "setPosition no funciona en hidden windows" sino "el callback corre en el contexto equivocado".

**Fix final:** registro Rust-side con `tauri_plugin_global_shortcut::Builder::new().with_handler(...)` dentro de `setup()`. El handler llama `tray::show_capture(app)` (ya existente, usado por el menú del tray). Un único registro, contexto `AppHandle` estable, cero duplicación de lógica con el tray.

### Bug B — Diseño roto tras cross-DPI drag

**Síntoma:** al arrastrar la ventana entre monitores con DPI distinto, el contenido del WebView2 quedaba renderizado al DPI previo mientras el chrome se redimensionaba al nuevo DPI → scrollbars + clipping.

**Intento fallido (round 1):** `setSize(LogicalSize(480, 220))` post-`show()` fuerza reflow de WebView2. **Corregía solo en la próxima invocación**, no durante el drag activo — el estado corrupto se veía mientras la ventana seguía visible.

**Intento fallido (round 2):** `onScaleChanged` listener en `CapturePage` que llama `setSize` al instante, respondiendo al mismo `WM_DPICHANGED` que causa la corrupción. **Disparó un peor bug:** feedback loop cuando la ventana straddleaba monitores. setSize → nuevo `WM_DPICHANGED` → otro setSize → ventana se achica iterativamente → eventualmente tao panicea con integer underflow (`attempt to subtract with overflow` en `tao-0.34.8/src/platform_impl/windows/event_loop.rs:2035/2042`).

**Root cause final:** [tauri#3610](https://github.com/tauri-apps/tauri/issues/3610) (abierto desde 2022 sin fix). WebView2 no recibe el hint para rescalar su contenido tras `WM_DPICHANGED`; sólo el chrome se redimensiona. Cualquier workaround desde JS que reaccione al evento dispara feedback loops en ventanas sin decorations.

**Fix final (round 3):** eliminar el drag de la capture window. Razones: (1) capture es efímera por diseño, no "reposicionable"; (2) para mover a otro monitor, re-invocar el shortcut ya funciona gracias al fix de Bug A; (3) tao#3610 no tiene workaround sano; (4) F4 era nice-to-have, no core.

La lógica Rust-side de `show_capture` (set_position + show + set_size + set_position) se mantiene intacta: se ejecuta con la ventana AT REST en un monitor específico, no mid-drag — no dispara el feedback loop.

---

## Lecciones

- **"Verificable automáticamente" ≠ "funciona".** `cargo check` + `tsc --noEmit` + `eslint` limpios no prueban que una feature funcione — sólo que compila. Multi-monitor + cross-DPI son edge cases que sólo se ven en hardware real. Las features que tocan APIs del sistema operativo deberían tener un paso de validación manual antes de merge, no después.

- **Catch silencioso en código nuevo es mala apuesta.** `catch { /* silent */ }` en el callback JS del round 1 ocultó los bugs por varias iteraciones de debug. Regla: en features exploratorias, `console.error` con contexto. Remover el logging es trivial cuando la feature está estable; agregar logging retrospectivamente requiere reproducir el bug.

- **Hook JS en `main.tsx` se monta en TODAS las ventanas del bundle.** Tauri no separa entrypoints por ventana. Side effects globales (registro de shortcut OS-level, init de servicio singleton, analytics) duplican registro si no tienen guard. Patrones seguros: (1) registrar Rust-side si es OS-level, (2) guard `getCurrentWebviewWindow().label === 'main'` si tiene que quedarse en JS, (3) hook legítimamente per-window (ej. `useCloseToTray` necesita su propio listener por ventana).

- **No todos los bugs upstream tienen workaround viable.** Si hay un issue abierto por años sin fix (tao#3610 lleva 4), considerar si la feature que lo necesita es esencial. Revertir una feature no-core cuesta 0 UX real y gana estabilidad completa; pelear workarounds frágiles cuesta tiempo y produce nuevos bugs.

- **Atacar síntomas en vez de causa multiplica el trabajo.** Round 1 asumió "setPosition en hidden windows es inconsistente" sin investigar por qué. Round 2 encontró la causa real (contexto de ejecución equivocado) al mirar el setup del bundle. Entre round 1 y round 2 se escribieron 2 commits de fix que terminaron revertidos. Moraleja: si un fix obvio no funciona, detenerse antes de reintentar variantes — buscar la causa.
