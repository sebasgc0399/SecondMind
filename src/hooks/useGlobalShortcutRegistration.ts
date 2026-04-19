import { useEffect } from 'react';
import { isTauri } from '@/lib/tauri';

const CAPTURE_SHORTCUT = 'Ctrl+Shift+Space';

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

        const { cursorPosition, availableMonitors, PhysicalPosition } =
          await import('@tauri-apps/api/window');

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
          // Fallback silencioso: si el reposicionamiento falla, mostramos la ventana en su última posición
        }

        await capture.show();
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
