import { useEffect } from 'react';
import { isTauri } from '@/lib/tauri';
import { readStoredTheme, THEME_CHANGE_EVENT, type Theme } from '@/lib/theme';

function toTauriTheme(theme: Theme): 'light' | 'dark' | null {
  return theme === 'auto' ? null : theme;
}

export default function useTauriThemeSync() {
  useEffect(() => {
    if (!isTauri()) return;

    let cancelled = false;

    async function sync() {
      try {
        const { setTheme } = await import('@tauri-apps/api/app');
        if (cancelled) return;
        await setTheme(toTauriTheme(readStoredTheme()));
      } catch {
        // Tauri puede fallar en escenarios atípicos (versión, permisos).
        // Degradamos silenciosamente: el chrome nativo queda en su default.
      }
    }

    void sync();
    window.addEventListener(THEME_CHANGE_EVENT, sync);

    return () => {
      cancelled = true;
      window.removeEventListener(THEME_CHANGE_EVENT, sync);
    };
  }, []);
}
