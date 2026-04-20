import { useEffect } from 'react';
import { isTauri } from '@/lib/tauri';

const STARTUP_CHECK_DELAY_MS = 5000;
export const CHECK_UPDATES_EVENT = 'check-for-updates';

export default function useAutoUpdate(): void {
  useEffect(() => {
    if (!isTauri()) return;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      if (getCurrentWebviewWindow().label !== 'main') return;

      const { listen } = await import('@tauri-apps/api/event');
      unlisten = await listen(CHECK_UPDATES_EVENT, () => {
        void runCheck(true);
      });

      timeoutId = setTimeout(() => {
        if (!cancelled) void runCheck(false);
      }, STARTUP_CHECK_DELAY_MS);
    })();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      unlisten?.();
    };
  }, []);
}

async function runCheck(userInitiated: boolean): Promise<void> {
  try {
    const [{ check }, { ask, message }, { relaunch }] = await Promise.all([
      import('@tauri-apps/plugin-updater'),
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/plugin-process'),
    ]);

    const update = await check();
    if (update?.available) {
      const notes = update.body ? `\n\n${update.body}` : '';
      const accepted = await ask(
        `Versión ${update.version} disponible.${notes}\n\nLa app se cerrará automáticamente para instalar.`,
        {
          title: 'Actualización disponible',
          kind: 'info',
          okLabel: 'Actualizar',
          cancelLabel: 'Después',
        },
      );
      if (accepted) {
        await update.downloadAndInstall();
        await relaunch();
      }
    } else if (userInitiated) {
      await message('Estás en la última versión.', {
        title: 'Sin actualizaciones',
        kind: 'info',
        okLabel: 'OK',
      });
    }
  } catch (err) {
    console.error('Update check failed:', err);
    if (userInitiated) {
      const { message } = await import('@tauri-apps/plugin-dialog');
      await message(
        'No se pudo verificar actualizaciones. Revisá tu conexión e intentá de nuevo.',
        {
          title: 'Error',
          kind: 'error',
          okLabel: 'OK',
        },
      );
    }
  }
}
