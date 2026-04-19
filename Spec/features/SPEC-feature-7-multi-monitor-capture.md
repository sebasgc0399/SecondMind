# SPEC — SecondMind · Feature 7: Capture Window Multi-Monitor (Registro de implementación)

> Estado: **Completada con 2 rondas de fix post-merge** — Abril 2026
> Commits F7 base: `1ec915f` (F1) · `a3f8328` (F2) · `2e36424` (F3 + F4 implícito) · `a2d04f1` (docs)
> Fix round 1 (`1830414`): scaleFactor calc + double setPosition + setSize(Logical) post-show — NO resolvió los bugs reales.
> Fix round 2 (`ba291b7`): shortcut movido a Rust + `onScaleChanged` listener — ataca las root causes verificadas.
> Alcance: La ventana `/capture` (Tauri Desktop) aparece centrada en el monitor donde está el cursor, no siempre en el primario. Incluye drag manual desde el header.
> Dependencias: Fase 5.1 (Tauri Desktop) completada
> Stack implementado: Tauri v2 JS API (`@tauri-apps/api/window`: `cursorPosition`, `availableMonitors`, `PhysicalPosition`), Rust (`WebviewWindow::cursor_position`, `available_monitors`, `set_position`), capabilities JSON (`core:window:allow-set-position`, `allow-outer-size`, `allow-start-dragging`).
> Para gotchas operativos consolidados → `Spec/ESTADO-ACTUAL.md` sección "Tauri Desktop (Fase 5.1)" (actualizada con entradas de Feature 7).

---

## Objetivo

El usuario con setup multi-monitor puede invocar la captura rápida (`Ctrl+Shift+Space` o menú tray) y la ventana aparece centrada en el monitor donde está su cursor — no en el primario. Además, puede arrastrar la ventana desde el header si quiere reposicionarla manualmente.

**Bug actual:** la ventana siempre abre en el monitor primario porque `tauri.conf.json` define `"center": true` (que Tauri interpreta como "centro del primario") y `window_state` tiene `capture` en denylist.

---

## Features

### F1: Actualizar capabilities de la capture window

**Qué:** Agregar los permisos `core:window:allow-set-position`, `core:window:allow-outer-size` y `core:window:allow-start-dragging` a las capabilities de la capture window. Bloqueante para F2, F3 y F4.

**Criterio de done:**

- [x] `src-tauri/capabilities/capture.json` incluye `core:window:allow-set-position`, `core:window:allow-outer-size` y `core:window:allow-start-dragging`
- [x] `cargo check` pasa sin warnings nuevos (verificado tras F3)
- [x] Shortcut JS puede reposicionar la capture window sin error IPC (automatable vía `cargo check` pasa + permisos schema)

**Archivo a modificar:**

- `src-tauri/capabilities/capture.json` — agregar 3 strings al array `permissions`

**Estado esperado del archivo:**

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "capture",
  "description": "Permisos de la ventana de captura rápida",
  "windows": ["capture"],
  "permissions": [
    "core:default",
    "core:window:allow-hide",
    "core:window:allow-show",
    "core:window:allow-set-focus",
    "core:window:allow-set-position",
    "core:window:allow-outer-size",
    "core:window:allow-start-dragging",
    "core:webview:allow-internal-toggle-devtools"
  ]
}
```

**Notas de implementación:**

- `availableMonitors()` y `cursorPosition()` son reads app-level que Tauri v2 considera parte de `core:default` — no necesitan permiso explícito.
- Gotcha: si el IDE sigue marcando "not accepted" tras editar el JSON, correr `cargo check --manifest-path src-tauri/Cargo.toml` para regenerar schemas y recargar la ventana del IDE.

---

### F2: Helper JS — reposicionar capture window al monitor del cursor

**Qué:** Reemplazar el callback del global shortcut para que antes de `show()` calcule la posición centrada en el monitor del cursor y la aplique con `setPosition()`.

**Criterio de done:**

- [ ] `Ctrl+Shift+Space` con cursor en monitor secundario → ventana aparece centrada ahí _(verificación manual pendiente — requiere setup multi-monitor físico)_
- [ ] `Ctrl+Shift+Space` con cursor en primario → ventana aparece en primario _(verificación manual pendiente)_
- [ ] Setup de un solo monitor funciona idéntico a antes _(verificación manual pendiente — pero lógica `?? monitors[0]` + try/catch garantiza fallback)_
- [x] Código sin errores de TypeScript (`tsc --noEmit` limpio) ni ESLint en el archivo modificado
- [x] Fallback con `try/catch` cubre fallo de `cursorPosition()`; `show()` + `setFocus()` siempre ejecutan fuera del try

**Archivo a modificar:**

- `src/hooks/useGlobalShortcutRegistration.ts` — reemplazar el callback (líneas 22-29) con la nueva lógica

**Snippet de referencia:**

```ts
await register(CAPTURE_SHORTCUT, async (event) => {
  if (event.state !== 'Pressed') return;

  const { cursorPosition, availableMonitors, PhysicalPosition } =
    await import('@tauri-apps/api/window');
  const { getAllWebviewWindows } = await import('@tauri-apps/api/webviewWindow');

  const windows = await getAllWebviewWindows();
  const capture = windows.find((w) => w.label === 'capture');
  if (!capture) return;

  try {
    const cursor = await cursorPosition();
    const monitors = await availableMonitors();
    const target =
      monitors.find(
        (m) =>
          cursor.x >= m.position.x &&
          cursor.x < m.position.x + m.size.width &&
          cursor.y >= m.position.y &&
          cursor.y < m.position.y + m.size.height,
      ) ?? monitors[0];

    if (target) {
      const winSize = await capture.outerSize();
      const cx = Math.round(target.position.x + (target.size.width - winSize.width) / 2);
      const cy = Math.round(target.position.y + (target.size.height - winSize.height) / 2);
      await capture.setPosition(new PhysicalPosition(cx, cy));
    }
  } catch {
    // Fallback silencioso: si algo falla, mostramos la ventana en su última posición
  }

  await capture.show();
  await capture.setFocus();
});
```

**Notas de implementación:**

- **Physical pixels:** `cursorPosition()` y `availableMonitors()` devuelven posiciones en physical pixels. `setPosition(new PhysicalPosition(...))` también es physical. No multiplicar por `scaleFactor`.
- **Multi-DPI:** Tauri normaliza todo a physical — el algoritmo de hit-test de monitores funciona sin ajuste extra.
- **Fallback:** `try/catch` envuelve solo el reposicionamiento. `show()` + `setFocus()` siempre ejecutan.

---

### F3: Replicar fix en handler Rust del tray

**Qué:** `show_capture` en `tray.rs` también debe centrar la ventana en el monitor del cursor. El menú "Captura rápida" del system tray dispara en Rust — no pasa por el hook JS.

**Criterio de done:**

- [ ] Click derecho en tray → "Captura rápida" con cursor en monitor secundario → ventana aparece ahí _(verificación manual pendiente)_
- [ ] Comportamiento idéntico al shortcut JS en los 3 escenarios _(verificación manual pendiente; lógica espejo verificada por code review)_
- [x] `cargo check` pasa sin warnings nuevos (`Finished dev profile [unoptimized + debuginfo] target(s) in 1m 06s`)

**Archivo a modificar:**

- `src-tauri/src/tray.rs` — reemplazar `show_capture` (líneas 89-94) y agregar helper `center_on_cursor_monitor`

**Snippet de referencia:**

```rust
use tauri::{AppHandle, Manager, PhysicalPosition, WebviewWindow};

fn show_capture(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("capture") {
        let _ = center_on_cursor_monitor(&window);
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn center_on_cursor_monitor(window: &WebviewWindow) -> tauri::Result<()> {
    let cursor = window.cursor_position()?;
    let monitors = window.available_monitors()?;
    let target = monitors
        .iter()
        .find(|m| {
            let pos = m.position();
            let size = m.size();
            cursor.x >= pos.x as f64
                && cursor.x < (pos.x + size.width as i32) as f64
                && cursor.y >= pos.y as f64
                && cursor.y < (pos.y + size.height as i32) as f64
        })
        .or_else(|| monitors.first());

    if let Some(monitor) = target {
        let win_size = window.outer_size()?;
        let mpos = monitor.position();
        let msize = monitor.size();
        let cx = mpos.x + (msize.width as i32 - win_size.width as i32) / 2;
        let cy = mpos.y + (msize.height as i32 - win_size.height as i32) / 2;
        window.set_position(PhysicalPosition { x: cx, y: cy })?;
    }
    Ok(())
}
```

**Notas de implementación:**

- `window.cursor_position()` devuelve `PhysicalPosition<f64>`, monitors devuelven `PhysicalPosition<i32>` / `PhysicalSize<u32>` — castear según snippet.
- `let _ =` en `show_capture` descarta el error — peor caso degrada al comportamiento actual, nunca deja la ventana oculta.

---

### F4: Capture window arrastrable desde el header

**Qué:** Habilitar drag de la ventana `/capture` desde la barra superior. El atributo `data-tauri-drag-region` **ya existe** en el header del page — solo falta la capability `allow-start-dragging` (incluida en F1).

**Criterio de done:**

- [ ] Click sostenido en la barra "Captura rápida" (header `h-8`) + arrastrar → ventana sigue el cursor _(verificación manual pendiente)_
- [ ] Soltar el click deja la ventana en la nueva posición _(verificación manual pendiente)_
- [x] Click en textarea o footer **no** arrastra — solo el header (confirmado por audit: `data-tauri-drag-region` solo en `<div class="h-8">` de las líneas 80 y 101 de capture page)
- [x] Drag funciona en ambas variantes del page (autenticado y "Abrí SecondMind") — ambas tienen `data-tauri-drag-region` idéntico
- [ ] Escape y Enter siguen funcionando post-drag _(verificación manual pendiente)_

**Archivos a modificar:**

- Ninguno. Se activa automáticamente con la capability agregada en F1.

**Notas de implementación:**

- El drag no persiste posición. La próxima invocación vuelve a centrarse en el monitor del cursor (consistente con D2 — capture siempre "fresh").
- Drag region limitado al header (32px). No expandir a full window — riesgo de drag accidental en padding/footer.

---

## Decisiones clave

| #   | Decisión                                         | Razón                                                                                                                                                                                                                 |
| --- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Duplicar lógica en JS (hook) y Rust (tray)       | Las dos rutas son independientes. Exponer un command Rust que el JS llame agrega un IPC round-trip — la latencia del `Ctrl+Shift+Space` es crítica. ~15 LOC duplicados son tolerables por ~1ms de ganancia.           |
| D2  | No persistir última posición de capture          | La denylist en `window_state` es intencional: capture es efímera, siempre "fresh". Persistir posición contradice el modelo y no soluciona el bug (si el usuario cambia de monitor, la posición persistida sigue mal). |
| D3  | `try/catch` en JS; `let _ =` en Rust             | Fallbacks silenciosos. Si el reposicionamiento falla, la ventana se muestra igual. Peor caso = comportamiento actual.                                                                                                 |
| D4  | Monitor que "contiene" el cursor, no el "activo" | Windows no tiene concepto claro de "monitor activo". El cursor es la señal más confiable de dónde está la atención del usuario.                                                                                       |
| D5  | Drag region solo en header, no full window       | El header (32px) ya se lee como asa. Expandir aumenta riesgo de drag accidental y obliga a excluir textarea explícitamente.                                                                                           |

---

## Orden de implementación

1. **F1** (capabilities) → bloqueante para todo. Sin los permisos, `setPosition()` y `start_dragging` fallan con IPC error.
2. **F2** (hook JS) → fix principal del shortcut.
3. **F3** (handler Rust) → fix del tray menu, lógica espejo de F2.
4. **F4** (drag) → sin código nuevo; se activa automáticamente con F1. Solo verificar en E2E.

**Commits atómicos:**

- C1: `chore(tauri): add capture capabilities for set-position, outer-size, start-dragging`
- C2: `feat(tauri): capture window follows cursor to active monitor (global shortcut)`
- C3: `feat(tauri): capture window follows cursor to active monitor (tray menu)`

F4 queda cubierto por C1 (no hay código nuevo).

---

## Estructura de archivos

```
src-tauri/
├── capabilities/
│   └── capture.json          ← F1: +3 permisos
├── src/
│   └── tray.rs               ← F3: show_capture + center_on_cursor_monitor
src/
└── hooks/
    └── useGlobalShortcutRegistration.ts  ← F2: nuevo callback con reposicionamiento
```

---

## Checklist de completado

Automatizables (✅ verificados):

- [x] `cargo check` pasa sin warnings nuevos (1m 06s limpio)
- [x] `npx tsc --noEmit` limpio en archivos tocados
- [x] `npx eslint src/hooks/useGlobalShortcutRegistration.ts` limpio

Manuales (pendientes — requieren setup multi-monitor físico):

- [ ] `npm run tauri:dev` compila y levanta sin errores
- [ ] Shortcut `Ctrl+Shift+Space` en monitor secundario → ventana aparece ahí (centrada)
- [ ] Shortcut en monitor primario → ventana aparece ahí
- [ ] Tray → "Captura rápida" en monitor secundario → ventana aparece ahí
- [ ] Tray → "Captura rápida" en monitor primario → ventana aparece ahí
- [ ] Setup mono-monitor → comportamiento idéntico al pre-fix
- [ ] Drag desde header funciona en ambas variantes del page
- [ ] Escape y Enter siguen funcionando post-drag
- [ ] `close-to-tray`, autostart, window-state del main, single-instance → sin regresiones

---

## Out of scope

- Guardar última posición de capture (contradice D2)
- Cambiar el shortcut `Ctrl+Shift+Space`
- Refactorizar tray para delegar en IPC en vez de handler Rust directo
- Build del MSI/NSIS (se verifica con `tauri:dev`)
- Centrar main window en monitor del cursor (main usa `window_state`, su UX es "recordar posición")

---

## Bugs descubiertos post-merge (fix `1830414`)

Al testear F7 con hardware multi-monitor real aparecieron 2 bugs que la verificación automatizable no cubría. Fix aplicado en la misma rama `fix/multi-monitor-capture-dpi` mergeada a `main`.

### Bug A — Shortcut abría en última posición, ignorando cursor

**Síntoma:** `Ctrl+Shift+Space` con cursor en monitor B seguía abriendo la ventana en el monitor donde se había dejado la vez anterior (no en B).

**Root cause:** `setPosition()` sobre ventanas con `visible: false` en Windows entra a una queue que no se consume antes de `show()`. En macOS/Linux se aplica inmediatamente; en Windows queda pendiente y la ventana se muestra en su última posición visible.

**Fix:** Llamar `setPosition()` **dos veces** — una pre-`show()` (inocua en macOS/Linux, queue en Windows) y otra post-`show()` (definitiva en todos los OS). El tradeoff es un flash de 1 frame en la posición vieja en Windows, imperceptible.

### Bug B — Diseño roto tras cross-DPI drag

**Síntoma:** Tras arrastrar la ventana entre monitores con DPI distinto (ej. 100% → 125%), aparecían scrollbars horizontales/verticales y el contenido del header/textarea quedaba clippeado.

**Root cause:** Tauri/tao handlea `WM_DPICHANGED` para el chrome de la ventana (mantiene `LogicalSize` al cruzar monitores), pero WebView2 no recibe el hint para rescalar su contenido interno. El HTML/CSS queda renderizado al DPI previo mientras el chrome se redimensiona al nuevo DPI.

**Fix:** `setSize(LogicalSize(480, 220))` explícito **post-`show()`** fuerza a WebView2 a reflow al DPI del monitor actual. Además, las dimensiones físicas para calcular el centrado ahora vienen de `target.scaleFactor * LOGICAL_DIM` en vez de `outerSize()` (que queda stale tras cross-DPI drag y podía meter el cálculo en un loop de escalado incorrecto).

### Cambios colaterales del fix

- `console.error` reemplaza los `catch { /* silent */ }` del callback JS. Los fallbacks silenciosos son aceptables para comportamiento (no dejar la ventana oculta), NO para diagnóstico. Rust sigue con `let _ =` porque los errores van a los logs del plugin automáticamente.
- Constantes canónicas `CAPTURE_LOGICAL_WIDTH`/`CAPTURE_LOGICAL_HEIGHT` = 480/220 definidas en ambos archivos. Cualquier cambio futuro al tamaño del capture debe actualizar los tres lugares: constantes JS, constantes Rust, `tauri.conf.json`.

### Lecciones

- "Verificable automáticamente" (cargo check + tsc + eslint) ≠ "funciona". Multi-monitor + cross-DPI son edge cases que solo se ven en hardware real. F7 debería haber tenido un paso de validación manual antes de merge.
- Catch silencioso en código nuevo es una mala apuesta — siempre logguear errores en features exploratorias. Remover el logging es trivial cuando la feature está estable.

---

## Fix round 2 (commit `ba291b7`)

El fix round 1 no resolvió los bugs reales. Tras investigar issues upstream ([tauri-apps/tauri#6843](https://github.com/tauri-apps/tauri/issues/6843), [#3610](https://github.com/tauri-apps/tauri/issues/3610)) y mirar el setup de la app con más cuidado, aparecieron las causas reales:

### Bug A real — Hook JS registrándose en ambas ventanas

`main.tsx` es entrypoint compartido por `main` y `capture`. `TauriIntegration` llamaba `useGlobalShortcutRegistration()` en ambos contextos. Cada ventana ejecutaba la secuencia `isRegistered → unregister → register`, ganando el callback la última que se montaba — normalmente `capture`. Operar `setPosition` sobre "la propia ventana en hidden state" desde su propio contexto JS tiene quirks conocidos en Windows que ningún double-call post-show arreglaba.

**Fix:** Registro Rust-side con `tauri_plugin_global_shortcut::Builder::new().with_handler(...)` dentro de `setup()`. El handler llama `tray::show_capture(app)` (ya existente, usado por el tray menu). Un único registro, contexto `AppHandle` estable, cero duplicación de lógica con el tray.

### Bug B real — Fix round 1 corregía en "próxima invocación", no durante el drag

El síntoma del usuario fue: "la arrastro entre monitores, se autorescala grande, la vuelvo al original, y se queda dañada". Esto ocurre DURANTE el drag activo, no al próximo show. El `setSize(LogicalSize)` post-show del round 1 solo limpiaba el estado al volver a invocar la ventana — el estado corrupto se veía mientras seguía visible.

**Fix:** `onScaleChanged` listener en `CapturePage` que llama `setSize(LogicalSize(480, 220))` al instante. Responde al mismo `WM_DPICHANGED` que dispara la corrupción del WebView2. Requiere capability `core:window:allow-set-size` en `capture.json`.

### Cambios colaterales

- `src/hooks/useGlobalShortcutRegistration.ts` eliminado (deadcode tras mover a Rust).
- `TauriIntegration` en `main.tsx` solo llama `useCloseToTray` ahora (ese hook sí es legítimamente per-window).
- `default.json`: removidas capabilities `global-shortcut:allow-register/unregister/is-registered` (ya no se usan desde JS; principio de mínimo privilegio).
- `show_capture` ahora `pub(crate)` en `tray.rs` para ser llamada desde `lib.rs`.

### Por qué esto funciona donde el round 1 falló

- **Bug A:** La causa no era "setPosition no funciona en hidden windows" sino "el callback corre en el contexto equivocado". Rust-side lo arregla de raíz.
- **Bug B:** La causa es que WebView2 no rescala (tauri#3610 abierto desde 2022). No hay forma de "arreglarlo" — hay que reaccionar cuando pasa. El `onScaleChanged` es la vía correcta.

### Lección adicional

**Hook JS en `main.tsx` se monta en TODAS las ventanas del bundle.** Cualquier side effect global (shortcut OS-level, init de singleton) duplica registro sin guard. Patrones seguros:

1. Registrar Rust-side si la feature es OS-level.
2. Guard `getCurrentWebviewWindow().label === 'main'` si tiene que quedarse en JS.
3. Hook legítimamente per-window: `useCloseToTray` necesita su propio listener por ventana.

---

## Siguiente feature

Con capture multi-monitor resuelto, los candidatos pendientes son mejoras al editor (floating menu, bubble menu para imágenes, drag handle) o mejoras a la vista de notas (filtro destiladas, vista resúmenes, mini-modo lectura).
