import { useEffect } from 'react';
import { isTauri } from '@/lib/tauri';
import { readStoredTheme } from '@/lib/theme';

// Sync inicial del theme de la window Tauri con el valor guardado.
// Las transiciones runtime ya las maneja useTheme.setTheme directamente
// (co-localizado para evitar race con matchMedia post-F42).
export default function useTauriThemeSync() {
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    void (async () => {
      try {
        const { setTheme } = await import('@tauri-apps/api/app');
        if (cancelled) return;
        const stored = readStoredTheme();
        await setTheme(stored === 'auto' ? null : stored);
      } catch {
        // Tauri puede fallar en escenarios atípicos (versión, permisos).
        // Degradamos silenciosamente: el chrome nativo queda en su default.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}
