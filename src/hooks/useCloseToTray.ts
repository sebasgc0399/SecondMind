import { useEffect } from 'react';
import { saveContentQueue } from '@/lib/saveQueue';
import { isTauri } from '@/lib/tauri';

const FLUSH_TIMEOUT_MS = 2000;

export default function useCloseToTray(): void {
  useEffect(() => {
    if (!isTauri()) return;

    let unlisten: (() => void) | undefined;

    (async () => {
      const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      const tauriWindow = getCurrentWebviewWindow();
      unlisten = await tauriWindow.onCloseRequested(async (event) => {
        event.preventDefault();
        // Si hay queue entries pending, intentar flush antes de minimizar al
        // tray. Race con timeout: si el flush tarda >2s (servidor lento, red
        // intermitente), proceder con hide igual — el queue persiste in-memory
        // mientras el proceso sigue vivo en tray.
        const pending = saveContentQueue.getSnapshot().size > 0;
        if (pending) {
          await Promise.race([
            saveContentQueue.flushAll(),
            new Promise<void>((resolve) => window.setTimeout(resolve, FLUSH_TIMEOUT_MS)),
          ]);
        }
        void tauriWindow.hide();
      });
    })();

    return () => {
      unlisten?.();
    };
  }, []);
}
