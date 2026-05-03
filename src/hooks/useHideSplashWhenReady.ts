import { useEffect } from 'react';
import { hideSplash } from '@/lib/splash';
import { showMainWindow } from '@/lib/tauri';

// El system splash se oculta apenas Layout monta, NO al final del bootstrap.
// Si esperáramos a !isLoading + stores hidratados, el system splash (Capacitor)
// o la window oculta (Tauri) taparían el AppBootSplash branded durante todo el
// boot y el handoff se vería como un solo frame imperceptible. El timeout 5s
// en main.tsx cubre el caso de crash pre-mount. Ambas calls son no-op en web.
export default function useHideSplashWhenReady(): void {
  useEffect(() => {
    void hideSplash();
    void showMainWindow();
  }, []);
}
