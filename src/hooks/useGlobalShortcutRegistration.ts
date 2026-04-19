import { useEffect } from 'react';
import { isTauri } from '@/lib/tauri';

const CAPTURE_SHORTCUT = 'Ctrl+Shift+Space';

const CAPTURE_LOGICAL_WIDTH = 480;
const CAPTURE_LOGICAL_HEIGHT = 220;

export default function useGlobalShortcutRegistration(): void {
  useEffect(() => {
    if (!isTauri()) return;

    let cancelled = false;

    (async () => {
      const { register, unregister, isRegistered } =
        await import('@tauri-apps/plugin-global-shortcut');
      const { getAllWebviewWindows } = await import('@tauri-apps/api/webviewWindow');

      if (await isRegistered(CAPTURE_SHORTCUT)) {
        await unregister(CAPTURE_SHORTCUT);
      }
      if (cancelled) return;

      await register(CAPTURE_SHORTCUT, async (event) => {
        if (event.state !== 'Pressed') return;

        const { cursorPosition, availableMonitors, PhysicalPosition, LogicalSize } =
          await import('@tauri-apps/api/window');

        const windows = await getAllWebviewWindows();
        const capture = windows.find((w) => w.label === 'capture');
        if (!capture) return;

        let targetPosition: { x: number; y: number } | null = null;
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
            // Dimensiones físicas calculadas con scaleFactor del monitor destino.
            // No usar outerSize(): tras un drag cross-DPI puede quedar stale y meter
            // al cálculo en un loop de escalado incorrecto (Bug B de F7).
            const winWidthPhysical = Math.round(CAPTURE_LOGICAL_WIDTH * target.scaleFactor);
            const winHeightPhysical = Math.round(CAPTURE_LOGICAL_HEIGHT * target.scaleFactor);
            targetPosition = {
              x: Math.round(target.position.x + (target.size.width - winWidthPhysical) / 2),
              y: Math.round(target.position.y + (target.size.height - winHeightPhysical) / 2),
            };
            await capture.setPosition(new PhysicalPosition(targetPosition.x, targetPosition.y));
          }
        } catch (error) {
          console.error('capture reposition pre-show failed', error);
        }

        await capture.show();

        // Post-show: reset LogicalSize fuerza a WebView2 a reflow en el DPI del
        // monitor actual (Bug B — sin esto, contenido queda renderizado al DPI
        // del monitor anterior y aparecen scrollbars/clipping).
        // Segundo setPosition: workaround Windows — hidden-window setPosition es
        // inconsistente; llamarlo tras show() garantiza que la posición quede
        // aplicada (Bug A).
        try {
          await capture.setSize(new LogicalSize(CAPTURE_LOGICAL_WIDTH, CAPTURE_LOGICAL_HEIGHT));
          if (targetPosition) {
            await capture.setPosition(new PhysicalPosition(targetPosition.x, targetPosition.y));
          }
        } catch (error) {
          console.error('capture resize/reposition post-show failed', error);
        }

        await capture.setFocus();
      });
    })();

    return () => {
      cancelled = true;
      void import('@tauri-apps/plugin-global-shortcut').then(({ unregister, isRegistered }) =>
        isRegistered(CAPTURE_SHORTCUT).then((registered) => {
          if (registered) return unregister(CAPTURE_SHORTCUT);
        }),
      );
    };
  }, []);
}
