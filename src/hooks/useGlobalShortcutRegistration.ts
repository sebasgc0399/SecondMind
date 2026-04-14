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
        const windows = await getAllWebviewWindows();
        const capture = windows.find((w) => w.label === 'capture');
        if (!capture) return;
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
