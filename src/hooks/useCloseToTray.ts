import { useEffect } from 'react';
import { isTauri } from '@/lib/tauri';

export default function useCloseToTray(): void {
  useEffect(() => {
    if (!isTauri()) return;

    let unlisten: (() => void) | undefined;

    (async () => {
      const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      const window = getCurrentWebviewWindow();
      unlisten = await window.onCloseRequested((event) => {
        event.preventDefault();
        void window.hide();
      });
    })();

    return () => {
      unlisten?.();
    };
  }, []);
}
