import { useEffect } from 'react';
import { allQueues } from '@/lib/saveQueue';
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
        // Si hay entries pending en cualquier queue (los 7), intentar flush
        // antes de minimizar al tray. Race con timeout: si flush tarda >2s
        // (servidor lento, red intermitente), proceder con hide igual — los
        // queues persisten in-memory mientras el proceso sigue vivo en tray.
        // Timeout cubre el agregado, no per-queue.
        const pending = allQueues.some((q) => q.getSnapshot().size > 0);
        if (pending) {
          await Promise.race([
            Promise.allSettled(allQueues.map((q) => q.flushAll())),
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
