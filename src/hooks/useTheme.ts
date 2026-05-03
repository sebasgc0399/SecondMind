import { useCallback, useSyncExternalStore } from 'react';
import { isTauri } from '@/lib/tauri';
import {
  applyTheme,
  readStoredTheme,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type Theme,
} from '@/lib/theme';

function subscribe(callback: () => void): () => void {
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  mql.addEventListener('change', callback);
  window.addEventListener('storage', callback);
  window.addEventListener(THEME_CHANGE_EVENT, callback);
  return () => {
    mql.removeEventListener('change', callback);
    window.removeEventListener('storage', callback);
    window.removeEventListener(THEME_CHANGE_EVENT, callback);
  };
}

function getThemeSnapshot(): Theme {
  return readStoredTheme();
}

function getResolvedSnapshot(): ResolvedTheme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function getServerSnapshot(): Theme {
  return 'auto';
}

function getServerResolvedSnapshot(): ResolvedTheme {
  return 'dark';
}

export default function useTheme() {
  const theme = useSyncExternalStore(subscribe, getThemeSnapshot, getServerSnapshot);
  const resolvedTheme = useSyncExternalStore(
    subscribe,
    getResolvedSnapshot,
    getServerResolvedSnapshot,
  );

  const setTheme = useCallback(async (next: Theme) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // localStorage puede fallar en contextos privados o WebViews restringidas;
      // el DOM class sigue siendo la fuente de verdad runtime.
    }

    // En Tauri, liberar/aplicar el theme de la window ANTES de applyTheme.
    // El WebView2 sincroniza matchMedia('prefers-color-scheme') con el theme
    // forzado de la window — si applyTheme corre antes del setTauriTheme,
    // systemPrefersDark() lee un valor stale del lock anterior y resuelve
    // 'auto' al theme equivocado.
    if (isTauri()) {
      try {
        const { setTheme: setTauriTheme } = await import('@tauri-apps/api/app');
        await setTauriTheme(next === 'auto' ? null : next);
      } catch {
        // Tauri puede fallar en escenarios atípicos (versión, permisos).
        // Degradamos silenciosamente: el chrome nativo queda en su default.
      }
    }

    applyTheme(next);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }, []);

  return { theme, setTheme, resolvedTheme };
}
