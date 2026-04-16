# Feature — Capture window sigue al cursor en setups multi-monitor

> Estado: **Pendiente** — sesión 2026-04-14, implementación diferida a PC principal
> Alcance: fix de UX en ventana `/capture` de Tauri Desktop para que aparezca en el monitor donde está el cursor, no siempre en el primario.
> Stack: Tauri v2 JS API (`@tauri-apps/api/window`) + handler Rust del tray.
> Rama sugerida: `feat/multi-monitor-capture` (base: `main` post-merge de branding).

---

## Objetivo

Cuando el usuario presiona `Ctrl+Shift+Space` global o click en "Captura rápida" del menú del tray, la ventana frameless `/capture` (480×220) debe aparecer centrada en el **monitor donde está el cursor del mouse**, no en el primario.

Escenario actual (bug):

- Usuario tiene dos monitores, está trabajando en el secundario.
- Pulsa `Ctrl+Shift+Space`.
- Ventana aparece en el monitor primario — pierde foco de flujo, obliga a mover ojos/cursor.

Escenario esperado (fix):

- El cursor está en monitor secundario → ventana aparece centrada ahí.
- El cursor está en primario → ventana aparece ahí.
- Monitor único → comportamiento idéntico al actual (centrado en ese único monitor).

---

## Causa raíz

1. `src-tauri/tauri.conf.json` define la capture window con `"center": true`. Tauri interpreta "center" como "centro del monitor primario" cuando la ventana se muestra tras un `show()` sin posición previa.
2. `tauri_plugin_window_state` tiene `.with_denylist(&["capture"])` en [src-tauri/src/lib.rs:18](../../src-tauri/src/lib.rs#L18) — decisión correcta de UX para mantener "capture siempre fresh", pero combinado con `center: true` fuerza el monitor primario cada vez.
3. El hook [src/hooks/useGlobalShortcutRegistration.ts:22-29](../../src/hooks/useGlobalShortcutRegistration.ts#L22-L29) llama `capture.show()` + `capture.setFocus()` sin reposicionar antes.
4. El handler Rust [src-tauri/src/tray.rs:89-94](../../src-tauri/src/tray.rs#L89-L94) (`show_capture`) tiene el mismo gap.

Dos caminos de invocación (shortcut JS y menú tray Rust) → el fix tiene que ir en ambos lados.

---

## Prerequisitos

Ninguno. El proyecto ya tiene:

- Tauri v2.10 con plugin-global-shortcut configurado.
- Capabilities scoped en `src-tauri/capabilities/{default,capture}.json`.
- Build chain Windows operativo (Fase 5.1 completada).

---

## Features

### F1: Helper JS para reposicionar la capture window al monitor del cursor

**Qué:** Reemplazar el callback del global shortcut para que antes de `show()` calcule la posición centrada en el monitor del cursor y la aplique con `setPosition()`.

**Criterio de done:**

- [ ] `Ctrl+Shift+Space` con cursor en monitor secundario abre la ventana ahí (centrada en ese monitor).
- [ ] `Ctrl+Shift+Space` con cursor en primario abre la ventana en primario.
- [ ] Setup de un solo monitor funciona idéntico a antes.
- [ ] Ningún error en consola de devtools al disparar el shortcut.
- [ ] Fallback funciona si `cursorPosition()` falla (raro en multi-DPI): usa `currentMonitor()` de la capture window.

**Archivos a modificar:**

- [src/hooks/useGlobalShortcutRegistration.ts](../../src/hooks/useGlobalShortcutRegistration.ts) — reemplazar el callback (líneas 22-29) con la nueva lógica. Agregar los imports dinámicos de `cursorPosition`, `availableMonitors`, `PhysicalPosition` del mismo módulo `@tauri-apps/api/window`.

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
    // Fallback silencioso: si algo falla, al menos mostramos la ventana
    // (quedará en el último centro que hayamos computado o en el default).
  }

  await capture.show();
  await capture.setFocus();
});
```

**Notas de implementación:**

- **Physical pixels:** `cursorPosition()` y `availableMonitors()` devuelven posiciones en physical pixels. `setPosition(new PhysicalPosition(...))` también es physical. No hay que multiplicar por `scaleFactor`.
- **Edge case multi-DPI:** dos monitores con distinto scale factor (ej. 100% + 150%). Tauri normaliza todo a physical, por lo que los rects de `availableMonitors()` ya están en coordenadas físicas globales. El algoritmo de "qué monitor contiene el cursor" funciona sin ajuste extra.
- **Fallback:** si `cursorPosition()` tira (observado ocasionalmente en Windows multi-DPI), envolver el bloque en `try/catch` y dejar que caiga al comportamiento actual (`show()` sin reposicionar).

---

### F2: Replicar el fix en el handler Rust del tray

**Qué:** `show_capture` en `tray.rs` también tiene que centrar la ventana en el monitor del cursor. El menú "Captura rápida" del system tray dispara directo en Rust — no pasa por el hook JS.

**Criterio de done:**

- [ ] Click derecho en tray icon → "Captura rápida" con cursor en monitor secundario → ventana aparece ahí.
- [ ] Comportamiento idéntico al shortcut JS en los 3 escenarios (primario, secundario, mono-monitor).
- [ ] `cargo check` pasa sin warnings nuevos.

**Archivo a modificar:**

- [src-tauri/src/tray.rs](../../src-tauri/src/tray.rs) — reemplazar `show_capture` (líneas 89-94) y agregar un helper `center_on_cursor_monitor(window: &WebviewWindow)`.

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

- `window.cursor_position()` (Tauri v2 API) devuelve `tauri::PhysicalPosition<f64>`. Los monitors devuelven `PhysicalPosition<i32>` / `PhysicalSize<u32>`. Castear según corresponda — el snippet arriba ya lo hace.
- `window.available_monitors()` devuelve `Vec<Monitor>` — no hace falta clonar, solo iterar.
- Firmar el helper como `-> tauri::Result<()>` permite usar `?` limpio. El `let _ =` en `show_capture` descarta el error — el peor caso es que no se reposicione, que es el comportamiento actual.

---

### F3: Actualizar capabilities de la capture window

**Qué:** Agregar los permisos necesarios para que la capture window acepte los commands `set_position` y `outer_size` desde JS.

**Criterio de done:**

- [ ] `src-tauri/capabilities/capture.json` incluye `core:window:allow-set-position` y `core:window:allow-outer-size`.
- [ ] IDE no marca "permission not accepted" tras `cargo check`.
- [ ] Shortcut JS puede reposicionar la capture window sin error IPC.

**Archivo a modificar:**

- [src-tauri/capabilities/capture.json](../../src-tauri/capabilities/capture.json) — agregar dos strings al array `permissions`.

**Estado esperado final del archivo:**

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

**Notas:**

- `availableMonitors()` y `cursorPosition()` son reads del app-level que Tauri v2 considera parte de `core:default` — no necesitan permiso explícito.
- `allow-start-dragging` es lo que habilita F4 (ver abajo).
- Gotcha documentado en CLAUDE.md: si el IDE sigue marcando "not accepted" tras editar el JSON, correr `cargo check --manifest-path src-tauri/Cargo.toml` para regenerar `src-tauri/gen/schemas/desktop-schema.json` y recargar la ventana del IDE.

---

### F4: Capture window arrastrable desde el header

**Qué:** Permitir que el usuario mueva la ventana `/capture` clickeando y arrastrando la barra superior "Captura rápida". Útil si el fix de F1/F2 lo deja en una posición que no le gusta, o si quiere moverlo al lado del contenido que está capturando.

**Estado actual:** el atributo `data-tauri-drag-region` **ya está puesto** en el header de la capture page — ver [src/app/capture/page.tsx:100-105](../../src/app/capture/page.tsx#L100-L105) (variante autenticada) y [src/app/capture/page.tsx:80](../../src/app/capture/page.tsx#L80) (variante no autenticada). Lo que falta es la capability para que Tauri acepte el comando `start_dragging` cuando el WebView lo invoca por el click.

**Criterio de done:**

- [ ] Click sostenido en la barra "Captura rápida" (el `h-8` del header) + arrastrar → la ventana se mueve siguiendo el cursor.
- [ ] Soltar el click deja la ventana en la nueva posición.
- [ ] Click en el textarea o en el footer (Enter/Esc) **no** arrastra — solo el header.
- [ ] El drag funciona en ambas variantes del page (autenticado y "Abrí SecondMind").
- [ ] Escape y Enter siguen funcionando post-drag.

**Archivo a modificar:**

- [src-tauri/capabilities/capture.json](../../src-tauri/capabilities/capture.json) — agregar `core:window:allow-start-dragging` (ver F3, el snippet ya lo incluye).

**Cambios de código:** ninguno. Los `data-tauri-drag-region` ya están en el markup desde Fase 5.1.

**Notas:**

- El drag region cubre la altura completa del header (`h-8`, 32px) con un borde inferior visible. Visualmente ya se entiende como "asa".
- **Opcional — ampliar área de drag:** si se quiere que TODA el área fuera del textarea sea draggeable, agregar `data-tauri-drag-region` al `div` exterior `flex h-screen w-screen flex-col` y luego `data-tauri-drag-region="false"` al `<textarea>` para excluirlo. Decisión: **no hacerlo por ahora** — el header es suficiente, y expandir la zona aumenta el riesgo de drag accidental al hacer click en padding/footer.
- **Interacción con el fix de multi-monitor (F1/F2):** el drag manual no persiste. Si el usuario mueve la ventana y luego la cierra, la próxima invocación vuelve a centrarse en el monitor del cursor (porque `window_state` tiene `capture` en denylist). Consistente con D2.

---

## Decisiones clave

| #   | Decisión                                                 | Razón                                                                                                                                                                                                                                                                    |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Duplicar lógica en JS (hook) y Rust (tray)               | Las dos rutas son independientes (shortcut global vs menú tray). Exponer un command Rust que el JS llame agrega un IPC round-trip al shortcut — la latencia percibida del `Ctrl+Shift+Space` es crítica. Los ~15 LOC duplicados son tolerables por la ganancia de ~1 ms. |
| D2  | No persistir última posición de la capture               | La denylist actual en `window_state` es intencional: capture es una ventana efímera que siempre debe abrir "fresh". Persistir posición contradice este modelo y no soluciona el bug base (si el usuario cambia de monitor, la posición persistida sigue estando mal).    |
| D3  | `try/catch` en JS; `let _ =` en Rust                     | Fallbacks silenciosos: si algo en el reposicionamiento falla, al menos mostramos la ventana. El peor caso degrada al comportamiento actual — nunca deja la ventana oculta.                                                                                               |
| D4  | Usar el monitor que "contiene" el cursor, no el "activo" | Windows no tiene concepto claro de "monitor activo". El cursor es la señal más confiable de dónde está la atención del usuario.                                                                                                                                          |
| D5  | Drag region solo en el header, no full window            | El header (32px) ya se lee visualmente como asa. Expandir la zona de drag al resto de la ventana permite drags accidentales al clickear en padding o footer, y obliga a excluir textarea con `data-tauri-drag-region="false"` — más markup para poca ganancia.           |

---

## Verificación end-to-end

1. `npm run tauri:dev` — no hace falta build de release ni `.env.local` con creds OAuth; este fix es puramente de posicionamiento de ventana.
2. **Setup dual-monitor — shortcut:**
   - Mover cursor al monitor secundario.
   - Pulsar `Ctrl+Shift+Space` → ventana capture aparece centrada en el secundario.
   - Escape para cerrar.
   - Mover cursor al primario.
   - Pulsar `Ctrl+Shift+Space` → ventana aparece centrada en el primario.
3. **Setup dual-monitor — tray:**
   - Click derecho en tray icon.
   - "Captura rápida" con cursor en secundario → ventana ahí.
   - Repetir con cursor en primario.
4. **Setup mono-monitor:** el shortcut y el tray abren la ventana centrada en ese único monitor (regresión check).
5. **F4 — drag manual:**
   - Abrir la ventana capture (shortcut o tray).
   - Click sostenido en la barra "Captura rápida" (header superior) + arrastrar → ventana sigue el cursor.
   - Soltar → ventana queda ahí.
   - Click en textarea → NO arrastra. Click en footer "Enter guardar · Esc cerrar" → NO arrastra.
   - Escape cierra. Próxima invocación vuelve a centrarse en el monitor del cursor (no recuerda la posición arrastrada — consistente con D2).
6. **Regresión general:**
   - `close-to-tray` sigue funcionando (cerrar main window → va al tray, no sale).
   - Autostart check sigue toggleable desde el menú.
   - Window-state del main persiste pos/size entre sesiones.
   - Single-instance funciona (segundo lanzamiento enfoca el primero).

---

## Orden de implementación

1. **F3 primero** (capabilities) — bloqueante para F1 y F4. Sin los permisos, `setPosition()` y `start_dragging` fallan con IPC error.
2. **F1** (hook JS).
3. **F2** (handler Rust).
4. **F4** (drag) — no tiene código asociado; se activa automáticamente al aplicar F3 (`allow-start-dragging`). Solo verificar en F4 del E2E.

Commits atómicos posibles:

- C1: `chore(tauri): agregar capabilities core:window:allow-{set-position,outer-size,start-dragging} a capture`
- C2: `feat(tauri): capture window sigue cursor en multi-monitor (shortcut global)`
- C3: `feat(tauri): capture window sigue cursor en multi-monitor (tray menu)`

F4 queda cubierto por C1 (no hay código nuevo). O bundled en un único commit si se prefiere.

---

## Out of scope

- Guardar la última posición de la capture window (contradice el patrón "siempre fresh" — D2).
- Cambiar el shortcut `Ctrl+Shift+Space` a otra combinación.
- Refactorizar el tray para delegar en IPC en vez de handler Rust directo.
- Build del MSI/NSIS — se hace en el PC de casa donde están las creds OAuth; para este fix basta con `tauri:dev` para verificar.
- Centrar la main window en el monitor del cursor — main usa `window_state` sin denylist, su UX es "recordar posición", no cambiar.

---

## Referencias

- Hook actual: [src/hooks/useGlobalShortcutRegistration.ts](../../src/hooks/useGlobalShortcutRegistration.ts)
- Handler tray actual: [src-tauri/src/tray.rs](../../src-tauri/src/tray.rs)
- Capabilities capture: [src-tauri/capabilities/capture.json](../../src-tauri/capabilities/capture.json)
- Config ventana capture: [src-tauri/tauri.conf.json](../../src-tauri/tauri.conf.json) (buscar `"label": "capture"`)
- SPEC de la Fase 5.1 Tauri (contexto completo): [../SPEC-fase-5.1-tauri-desktop.md](../SPEC-fase-5.1-tauri-desktop.md)
