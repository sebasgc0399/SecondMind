import { useCallback, useSyncExternalStore } from 'react';
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

  const setTheme = useCallback((next: Theme) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // localStorage puede fallar en contextos privados o WebViews restringidas;
      // el DOM class sigue siendo la fuente de verdad runtime.
    }
    applyTheme(next);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }, []);

  return { theme, setTheme, resolvedTheme };
}
