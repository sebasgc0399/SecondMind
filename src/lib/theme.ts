export type Theme = 'light' | 'dark' | 'auto';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'sm-theme';
export const DEFAULT_THEME: Theme = 'auto';

const THEMES: readonly Theme[] = ['light', 'dark', 'auto'] as const;

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

export function readStoredTheme(): Theme {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(raw) ? raw : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === 'auto') return systemPrefersDark() ? 'dark' : 'light';
  return theme;
}

export function applyTheme(theme: Theme): ResolvedTheme {
  const resolved = resolveTheme(theme);
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  return resolved;
}

export const THEME_CHANGE_EVENT = 'sm-theme-change';
